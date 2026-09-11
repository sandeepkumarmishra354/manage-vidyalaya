use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::SyncStatus;
use crate::state::AppState;

/// Tables the sync engine is allowed to read/write. Table names from the
/// server are checked against this list before being interpolated into SQL,
/// since sqlite doesn't support parameterized identifiers.
const SYNCABLE_TABLES: &[&str] = &[
    "branches",
    "users",
    "roles",
    "user_roles",
    "academic_sessions",
    "classes",
    "sections",
    "students",
    "guardians",
    "student_guardians",
    "admissions",
    "attendance_records",
    "fee_structures",
    "fee_invoices",
    "fee_payments",
    "subjects",
    "exams",
    "exam_marks",
];

#[derive(Debug, Serialize)]
struct OutboxChangeDto {
    entity_table: String,
    entity_id: String,
    op: String,
    payload: Value,
    client_ts: String,
}

#[derive(Debug, Serialize)]
struct SyncPushRequest {
    tenant_id: String,
    changes: Vec<OutboxChangeDto>,
}

#[derive(Debug, Deserialize)]
struct SyncPushResult {
    entity_table: String,
    entity_id: String,
    #[allow(dead_code)]
    server_seq: i64,
    accepted: bool,
    #[allow(dead_code)]
    conflict: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SyncPushResponse {
    results: Vec<SyncPushResult>,
}

#[derive(Debug, Deserialize)]
struct SyncPullChange {
    entity_table: String,
    #[allow(dead_code)]
    entity_id: String,
    #[allow(dead_code)]
    op: String,
    payload: Value,
    #[allow(dead_code)]
    server_seq: i64,
}

#[derive(Debug, Deserialize)]
struct SyncPullResponse {
    changes: Vec<SyncPullChange>,
    latest_server_seq: i64,
    has_more: bool,
}

fn current_tenant_id(conn: &rusqlite::Connection) -> Option<String> {
    conn.query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0)).ok()
}

fn access_token(conn: &rusqlite::Connection) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'access_token'",
        [],
        |row| row.get(0),
    )
    .ok()
}

/// Pushes every unsynced sync_outbox row, then pulls anything new since the
/// local cursor and applies it. Called on a timer in the background and can
/// also be triggered manually from the UI (`sync_now`).
pub async fn run_sync_cycle(state: &AppState) -> anyhow::Result<()> {
    let (tenant_id, token, pending) = {
        let conn = state.db.lock().unwrap();
        let tenant_id = current_tenant_id(&conn);
        let token = access_token(&conn);
        let pending = load_pending_outbox(&conn)?;
        (tenant_id, token, pending)
    };

    let (Some(tenant_id), Some(token)) = (tenant_id, token) else {
        // Not logged in yet, or no tenant provisioned -- nothing to sync.
        return Ok(());
    };

    if !pending.is_empty() {
        push_changes(state, &tenant_id, &token, pending).await?;
    }

    pull_changes(state, &tenant_id, &token).await?;

    Ok(())
}

fn load_pending_outbox(
    conn: &rusqlite::Connection,
) -> anyhow::Result<Vec<(String, OutboxChangeDto)>> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_table, entity_id, op, payload_json, client_ts
         FROM sync_outbox WHERE synced_at IS NULL ORDER BY client_ts LIMIT 200",
    )?;

    let rows = stmt.query_map([], |row| {
        let outbox_id: String = row.get(0)?;
        let payload_json: String = row.get(4)?;
        Ok((
            outbox_id,
            OutboxChangeDto {
                entity_table: row.get(1)?,
                entity_id: row.get(2)?,
                op: row.get(3)?,
                payload: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
                client_ts: row.get(5)?,
            },
        ))
    })?;

    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

async fn push_changes(
    state: &AppState,
    tenant_id: &str,
    token: &str,
    pending: Vec<(String, OutboxChangeDto)>,
) -> anyhow::Result<()> {
    let outbox_ids: Vec<String> = pending.iter().map(|(id, _)| id.clone()).collect();
    let changes: Vec<OutboxChangeDto> = pending.into_iter().map(|(_, c)| c).collect();

    let url = format!("{}/sync/push", state.cloud_api_base_url);
    let resp = state
        .http
        .post(&url)
        .bearer_auth(token)
        .json(&SyncPushRequest { tenant_id: tenant_id.to_string(), changes })
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!("sync push failed: HTTP {}", resp.status());
    }

    let body: SyncPushResponse = resp.json().await?;
    let accepted_entity_ids: Vec<String> = body
        .results
        .iter()
        .filter(|r| r.accepted)
        .map(|r| format!("{}:{}", r.entity_table, r.entity_id))
        .collect();

    let conn = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    for outbox_id in outbox_ids {
        // Mark synced regardless of per-row accept/reject outcome -- a
        // rejected row (e.g. stale version) is logged server-side and
        // surfaces via the next pull; retrying the same outbox row forever
        // would otherwise wedge the queue. Rejection handling / conflict UI
        // is a documented follow-up (see plan's sync conflict-resolution note).
        conn.execute(
            "UPDATE sync_outbox SET synced_at = ?1 WHERE id = ?2",
            params![now, outbox_id],
        )?;
    }
    let _ = accepted_entity_ids; // reserved for future per-row conflict surfacing

    Ok(())
}

async fn pull_changes(state: &AppState, tenant_id: &str, token: &str) -> anyhow::Result<()> {
    loop {
        let since = {
            let conn = state.db.lock().unwrap();
            conn.query_row(
                "SELECT last_pulled_server_seq FROM sync_state WHERE id = 'singleton'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
        };

        let url = format!(
            "{}/sync/pull?tenant_id={}&since_server_seq={}",
            state.cloud_api_base_url, tenant_id, since
        );
        let resp = state.http.get(&url).bearer_auth(token).send().await?;

        if !resp.status().is_success() {
            anyhow::bail!("sync pull failed: HTTP {}", resp.status());
        }

        let body: SyncPullResponse = resp.json().await?;
        let has_more = body.has_more;
        let latest = body.latest_server_seq;

        {
            let mut conn = state.db.lock().unwrap();
            // Pulled changes are applied via INSERT OR REPLACE, which SQLite
            // implements as delete-then-insert; replacing a row referenced by
            // another row already applied earlier in this same batch would
            // otherwise trip an immediate FK check even though the batch is
            // internally consistent once fully applied. Deferring FK
            // enforcement to commit time (this pragma only affects the next
            // transaction) fixes that ordering hazard.
            conn.pragma_update(None, "defer_foreign_keys", "ON")?;
            let tx = conn.transaction()?;
            for change in &body.changes {
                apply_pulled_change(&tx, change)?;
            }

            tx.execute(
                "INSERT INTO sync_state (id, last_pulled_server_seq, last_synced_at)
                 VALUES ('singleton', ?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET last_pulled_server_seq = excluded.last_pulled_server_seq,
                                                last_synced_at = excluded.last_synced_at",
                params![latest, chrono::Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
        }

        if !has_more {
            break;
        }
    }

    Ok(())
}

fn apply_pulled_change(tx: &rusqlite::Transaction, change: &SyncPullChange) -> anyhow::Result<()> {
    if !SYNCABLE_TABLES.contains(&change.entity_table.as_str()) {
        anyhow::bail!("refusing to apply change to unknown table: {}", change.entity_table);
    }

    let Value::Object(fields) = &change.payload else {
        anyhow::bail!("pulled change payload is not a JSON object");
    };

    let columns: Vec<&String> = fields.keys().collect();
    let column_list = columns
        .iter()
        .map(|c| c.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=columns.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        change.entity_table, column_list, placeholders
    );

    let values: Vec<rusqlite::types::Value> = columns
        .iter()
        .map(|c| json_value_to_sql(&fields[c.as_str()]))
        .collect();

    tx.execute(&sql, rusqlite::params_from_iter(values)).map_err(|e| {
        anyhow::anyhow!(
            "apply_pulled_change failed for {} {}: {} (sql={}) (payload={})",
            change.entity_table,
            change.entity_id,
            e,
            sql,
            change.payload
        )
    })?;
    Ok(())
}

fn json_value_to_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else {
                rusqlite::types::Value::Real(n.as_f64().unwrap_or_default())
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

pub fn sync_status(state: &AppState) -> Result<SyncStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let pending_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let last_synced_at: Option<String> = conn
        .query_row(
            "SELECT last_synced_at FROM sync_state WHERE id = 'singleton'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(SyncStatus { last_synced_at, pending_count, is_online: false })
}
