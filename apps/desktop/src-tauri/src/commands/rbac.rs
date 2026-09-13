use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    CreateStaffLoginInput, NewRoleInput, ResetStaffPasswordInput, Role, SetRolePermissionsInput,
    UserSummary, PERMISSION_CATALOG,
};
use crate::state::{current_actor_role_names, current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn list_permission_catalog() -> Vec<String> {
    PERMISSION_CATALOG.iter().map(|s| s.to_string()).collect()
}

/// The current user's effective permission set (union across all their
/// assigned roles) -- what the frontend loads at login/bootstrap to decide
/// which buttons/routes to show. This is the read-only counterpart to
/// `require_permission`'s enforcement check.
#[tauri::command]
pub fn list_my_permissions(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let role_names = current_actor_role_names(&conn);
    if role_names.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = role_names.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT DISTINCT rp.permission_key FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.name IN ({placeholders}) AND rp.deleted_at IS NULL"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<&dyn rusqlite::ToSql> = role_names.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(params.as_slice(), |row| row.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_roles(state: State<AppState>) -> Result<Vec<Role>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, is_system FROM roles WHERE deleted_at IS NULL ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Role { id: row.get(0)?, name: row.get(1)?, is_system: row.get::<_, i64>(2)? != 0 })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_role(state: State<AppState>, input: NewRoleInput) -> Result<Role, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "roles.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO roles (id, tenant_id, name, is_system, updated_at, version) VALUES (?1, ?2, ?3, 0, ?4, 1)",
        params![id, tenant_id, input.name, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "roles", &id, "insert").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "roles", &id, "create", &format!("Created role '{}'", input.name))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Role { id, name: input.name, is_system: false })
}

#[tauri::command]
pub fn update_role(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "roles.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE roles SET name = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3 AND deleted_at IS NULL",
        params![name, now, id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "roles", &id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "roles", &id, "update", &format!("Renamed role to '{name}'"))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// System roles (seeded at provisioning time: super_admin, branch_admin,
/// accountant, teacher, front_desk) can't be deleted -- other code paths
/// (default role assignment during staff onboarding) assume they exist.
#[tauri::command]
pub fn delete_role(state: State<AppState>, id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "roles.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let is_system: bool = conn
        .query_row("SELECT is_system FROM roles WHERE id = ?1", [&id], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        != 0;
    if is_system {
        return Err("cannot delete a system role".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE roles SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "roles", &id, "delete").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "roles", &id, "delete", "Deleted role").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_role_permissions(state: State<AppState>, role_id: String) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT permission_key FROM role_permissions WHERE role_id = ?1 AND deleted_at IS NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([role_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Replaces the full permission set for a role: deletes any granted keys not
/// in the new set, inserts any new ones. Simpler and safer to reason about
/// than a diff for a checkbox-matrix UI that always submits the full set.
#[tauri::command]
pub fn set_role_permissions(state: State<AppState>, input: SetRolePermissionsInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "roles.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let existing: Vec<(String, String)> = {
        let mut stmt = tx
            .prepare("SELECT id, permission_key FROM role_permissions WHERE role_id = ?1 AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&input.role_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    for (row_id, key) in &existing {
        if !input.permission_keys.contains(key) {
            tx.execute(
                "UPDATE role_permissions SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2",
                params![now, row_id],
            )
            .map_err(|e| e.to_string())?;
            enqueue_outbox_from_row(&tx, "role_permissions", row_id, "delete").map_err(|e| e.to_string())?;
        }
    }

    let existing_keys: Vec<&String> = existing.iter().map(|(_, k)| k).collect();
    for key in &input.permission_keys {
        if existing_keys.contains(&key) {
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO role_permissions (id, tenant_id, role_id, permission_key, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            params![id, tenant_id, input.role_id, key, now],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "role_permissions", &id, "insert").map_err(|e| e.to_string())?;
    }

    record_audit(
        &tx,
        &tenant_id,
        None,
        "roles",
        &input.role_id,
        "update",
        &format!("Set permissions for role ({} keys)", input.permission_keys.len()),
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_users(state: State<AppState>) -> Result<Vec<UserSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, full_name, email, is_active FROM users WHERE deleted_at IS NULL ORDER BY full_name",
        )
        .map_err(|e| e.to_string())?;

    let users: Vec<(String, String, String, bool)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get::<_, i64>(3)? != 0))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(users.len());
    for (id, full_name, email, is_active) in users {
        let mut role_stmt = conn
            .prepare("SELECT role_id FROM user_roles WHERE user_id = ?1")
            .map_err(|e| e.to_string())?;
        let role_ids: Vec<String> = role_stmt
            .query_map([&id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        out.push(UserSummary { id, full_name, email, is_active, role_ids });
    }
    Ok(out)
}

#[tauri::command]
pub fn assign_user_role(state: State<AppState>, user_id: String, role_id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "users.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5, 1)
         ON CONFLICT(user_id, role_id) DO NOTHING",
        params![id, tenant_id, user_id, role_id, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "user_roles", &id, "insert").ok(); // no-op if ON CONFLICT DO NOTHING skipped the insert
    record_audit(&tx, &tenant_id, None, "user_roles", &user_id, "update", "Assigned role")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_user_role(state: State<AppState>, user_id: String, role_id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "users.manage")?;
    let tenant_id = current_tenant_id(&conn)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM user_roles WHERE user_id = ?1 AND role_id = ?2",
        params![user_id, role_id],
    )
    .map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "user_roles", &user_id, "delete", "Removed role")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_user_active(state: State<AppState>, user_id: String, is_active: bool) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "users.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE users SET is_active = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3",
        params![is_active, now, user_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "users", &user_id, "update").map_err(|e| e.to_string())?;
    record_audit(
        &tx,
        &tenant_id,
        None,
        "users",
        &user_id,
        "update",
        if is_active { "Reactivated user" } else { "Deactivated user" },
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Login creation / password reset -- must go through cloud-api since
// password_hash is set server-side only (desktop never computes or stores a
// hash). See apps/cloud-api/src/users for the endpoints these call.
// ============================================================================

#[derive(serde::Serialize)]
struct CreateUserRequest<'a> {
    tenant_id: &'a str,
    branch_id: Option<&'a str>,
    full_name: &'a str,
    email: &'a str,
    password: &'a str,
}

#[derive(serde::Deserialize)]
struct CreateUserResponse {
    id: String,
}

/// Creates a login (a `users` row with a password) for an existing staff
/// member via cloud-api, then links `staff.user_id` locally. Requires
/// connectivity -- there is no offline path for setting a password.
#[tauri::command]
pub async fn create_staff_login(
    state: State<'_, AppState>,
    input: CreateStaffLoginInput,
) -> Result<String, String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        require_permission(&conn, "users.manage")?;
    }

    let (tenant_id, token) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let tenant_id = current_tenant_id(&conn)?;
        let token = conn
            .query_row("SELECT value FROM app_settings WHERE key = 'access_token'", [], |row| row.get::<_, String>(0))
            .map_err(|_| "not logged in".to_string())?;
        (tenant_id, token)
    };

    let url = format!("{}/users", state.cloud_api_base_url);
    let resp = state
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&CreateUserRequest {
            tenant_id: &tenant_id,
            branch_id: input.branch_id.as_deref(),
            full_name: &input.full_name,
            email: &input.email,
            password: &input.initial_password,
        })
        .send()
        .await
        .map_err(|e| format!("could not reach server: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("create login failed: HTTP {}", resp.status()));
    }
    let body: CreateUserResponse = resp.json().await.map_err(|e| e.to_string())?;

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE staff SET user_id = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3",
        params![body.id, now, input.staff_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "staff", &input.staff_id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "staff", &input.staff_id, "update", "Created login for staff member")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(body.id)
}

#[derive(serde::Serialize)]
struct ResetPasswordRequest<'a> {
    password: &'a str,
}

#[tauri::command]
pub async fn reset_staff_password(
    state: State<'_, AppState>,
    input: ResetStaffPasswordInput,
) -> Result<(), String> {
    let token = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        require_permission(&conn, "users.manage")?;
        conn.query_row("SELECT value FROM app_settings WHERE key = 'access_token'", [], |row| row.get::<_, String>(0))
            .map_err(|_| "not logged in".to_string())?
    };

    let url = format!("{}/users/{}/reset-password", state.cloud_api_base_url, input.user_id);
    let resp = state
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&ResetPasswordRequest { password: &input.new_password })
        .send()
        .await
        .map_err(|e| format!("could not reach server: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("reset password failed: HTTP {}", resp.status()));
    }

    // No local row changes -- password_hash is never stored client-side --
    // but still worth an audit trail entry for "who reset whose password".
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let tenant_id = current_tenant_id(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "users", &input.user_id, "update", "Reset password")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
