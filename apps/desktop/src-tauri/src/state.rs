use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http: reqwest::Client,
    pub cloud_api_base_url: String,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        let cloud_api_base_url = std::env::var("VIDYALAYA_CLOUD_API_URL")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());

        Self {
            db: Mutex::new(db),
            http: reqwest::Client::new(),
            cloud_api_base_url,
        }
    }
}

/// Inserts a row into the local `sync_outbox` table. Must be called inside the
/// same rusqlite transaction as the mutation it describes, so a crash between
/// the data write and the outbox write is impossible.
pub fn enqueue_outbox(
    tx: &rusqlite::Transaction,
    entity_table: &str,
    entity_id: &str,
    op: &str,
    payload_json: &str,
) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO sync_outbox (id, entity_table, entity_id, op, payload_json, client_ts, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            entity_table,
            entity_id,
            op,
            payload_json,
            chrono::Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}

/// Convenience wrapper around `enqueue_outbox` that re-reads the row that was
/// just written (by id) and uses it as the payload snapshot, instead of the
/// caller hand-building a JSON object that has to be kept in sync with the
/// table's columns by hand. `table` must be a hardcoded string literal from
/// our own code (never user input) since it's interpolated into SQL.
pub fn enqueue_outbox_from_row(
    tx: &rusqlite::Transaction,
    table: &str,
    id: &str,
    op: &str,
) -> rusqlite::Result<()> {
    let sql = format!("SELECT * FROM {table} WHERE id = ?1");
    let mut stmt = tx.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let payload = stmt.query_row([id], |row| {
        let mut map = serde_json::Map::new();
        for (i, name) in column_names.iter().enumerate() {
            let value: rusqlite::types::Value = row.get(i)?;
            map.insert(name.clone(), sql_value_to_json(value));
        }
        Ok(serde_json::Value::Object(map))
    })?;

    enqueue_outbox(tx, table, id, op, &payload.to_string())
}

fn sql_value_to_json(v: rusqlite::types::Value) -> serde_json::Value {
    match v {
        rusqlite::types::Value::Null => serde_json::Value::Null,
        rusqlite::types::Value::Integer(i) => serde_json::json!(i),
        rusqlite::types::Value::Real(f) => serde_json::json!(f),
        rusqlite::types::Value::Text(s) => serde_json::Value::String(s),
        rusqlite::types::Value::Blob(_) => serde_json::Value::Null,
    }
}

/// Looks up the (single, local-install) tenant id. Shared by every command
/// module -- this desktop build is always scoped to exactly one tenant.
pub fn current_tenant_id(conn: &rusqlite::Connection) -> Result<String, String> {
    conn.query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0))
        .map_err(|e| format!("no tenant provisioned: {e}"))
}

/// The cached logged-in user's id, read from the same `app_settings` "user"
/// blob `commands::auth` caches on login (see `commands/auth.rs`). Used to
/// stamp audit log rows and to resolve the current user's permissions.
pub fn current_actor_user_id(conn: &rusqlite::Connection) -> Option<String> {
    let user_json: String = conn
        .query_row("SELECT value FROM app_settings WHERE key = 'user'", [], |row| row.get(0))
        .ok()?;
    let user: serde_json::Value = serde_json::from_str(&user_json).ok()?;
    user.get("id")?.as_str().map(|s| s.to_string())
}

/// The cached logged-in user's role *names* (as issued in the login JWT
/// payload, see `commands/auth.rs::UserDto`).
pub fn current_actor_role_names(conn: &rusqlite::Connection) -> Vec<String> {
    let Ok(user_json) =
        conn.query_row::<String, _, _>("SELECT value FROM app_settings WHERE key = 'user'", [], |row| row.get(0))
    else {
        return Vec::new();
    };
    let Ok(user) = serde_json::from_str::<serde_json::Value>(&user_json) else {
        return Vec::new();
    };
    user.get("roles")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

/// Checks whether the currently logged-in user holds `permission_key` via
/// any of their assigned roles' `role_permissions`. Every command that
/// performs a sensitive action should call this before doing any writes (or
/// before returning sensitive reads). Fails closed: no session, no matching
/// role, or no granted permission all return an error.
pub fn require_permission(conn: &rusqlite::Connection, permission_key: &str) -> Result<(), String> {
    let role_names = current_actor_role_names(conn);
    if role_names.is_empty() {
        return Err("not authorized: no active session".to_string());
    }

    let placeholders = role_names.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT COUNT(*) FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name IN ({placeholders}) AND rp.permission_key = ? AND rp.deleted_at IS NULL"
    );

    let mut params: Vec<&dyn rusqlite::ToSql> = role_names.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
    params.push(&permission_key);

    let granted_count: i64 = conn
        .query_row(&sql, params.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if granted_count == 0 {
        return Err(format!("not authorized: missing permission '{permission_key}'"));
    }
    Ok(())
}
