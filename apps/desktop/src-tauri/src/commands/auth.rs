use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::models::Session;
use crate::state::AppState;

// Mirrors packages/shared-types LoginRequest/LoginResponse/EntitlementClaims.
// Kept as separate Rust structs (rather than shared codegen) since this is the
// only cross-language boundary in the stack; keep in sync by hand when the
// cloud-api contract changes.

#[derive(Debug, Serialize)]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct UserDto {
    id: String,
    tenant_id: String,
    full_name: String,
    email: String,
    roles: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct EntitlementClaims {
    tenant_id: String,
    branch_ids: serde_json::Value, // Vec<String> | "all"
    subscription_status: String,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
struct LoginResponse {
    access_token: String,
    refresh_token: String,
    user: UserDto,
    entitlement: EntitlementClaims,
}

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", [key], |r| r.get(0))
        .ok()
}

fn session_from_cached(user: UserDto, entitlement: EntitlementClaims) -> Session {
    let branch_ids = match &entitlement.branch_ids {
        serde_json::Value::String(s) if s == "all" => Vec::new(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        _ => Vec::new(),
    };

    Session {
        user_id: user.id,
        full_name: user.full_name,
        email: user.email,
        tenant_id: user.tenant_id,
        roles: user.roles,
        branch_ids,
        entitlement_expires_at: entitlement.expires_at,
    }
}

/// Requires connectivity. On success, caches the access token, refresh token,
/// user, and entitlement locally so the app can restore the session (and keep
/// working) fully offline afterwards -- see `get_session`.
#[tauri::command]
pub async fn login(state: State<'_, AppState>, email: String, password: String) -> Result<Session, String> {
    let url = format!("{}/auth/login", state.cloud_api_base_url);

    let resp = state
        .http
        .post(&url)
        .json(&LoginRequest { email: &email, password: &password })
        .send()
        .await
        .map_err(|e| format!("could not reach server: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("login failed: HTTP {}", resp.status()));
    }

    let body: LoginResponse = resp.json().await.map_err(|e| e.to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    set_setting(&conn, "access_token", &body.access_token)?;
    set_setting(&conn, "refresh_token", &body.refresh_token)?;
    set_setting(&conn, "user", &serde_json::to_string(&body.user).map_err(|e| e.to_string())?)?;
    set_setting(
        &conn,
        "entitlement",
        &serde_json::to_string(&body.entitlement).map_err(|e| e.to_string())?,
    )?;

    Ok(session_from_cached(body.user, body.entitlement))
}

/// Restores the session from local cache. Works fully offline -- no network
/// call. Callers should compare `entitlement_expires_at` (plus the offline
/// grace period) against now to decide whether to prompt for reconnect.
#[tauri::command]
pub fn get_session(state: State<AppState>) -> Result<Option<Session>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let (Some(user_json), Some(entitlement_json)) =
        (get_setting(&conn, "user"), get_setting(&conn, "entitlement"))
    else {
        return Ok(None);
    };

    let user: UserDto = serde_json::from_str(&user_json).map_err(|e| e.to_string())?;
    let entitlement: EntitlementClaims =
        serde_json::from_str(&entitlement_json).map_err(|e| e.to_string())?;

    Ok(Some(session_from_cached(user, entitlement)))
}

#[tauri::command]
pub fn logout(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    for key in ["access_token", "refresh_token", "user", "entitlement"] {
        conn.execute("DELETE FROM app_settings WHERE key = ?1", [key])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
