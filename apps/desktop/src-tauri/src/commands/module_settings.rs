use rusqlite::params;
use tauri::State;

use crate::models::{ModuleSetting, SetModuleEnabledInput, TOGGLEABLE_MODULES};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, AppState};

/// Returns every toggleable module's enabled state for a branch. A module
/// with no row yet defaults to enabled -- so existing branches (and the
/// demo seed) don't need a migration-time backfill for every module key.
#[tauri::command]
pub fn get_module_settings(state: State<AppState>, branch_id: String) -> Result<Vec<ModuleSetting>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT module_key, is_enabled FROM module_settings
             WHERE branch_id = ?1 AND deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;

    let existing: std::collections::HashMap<String, bool> = stmt
        .query_map([&branch_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    Ok(TOGGLEABLE_MODULES
        .iter()
        .map(|key| ModuleSetting {
            module_key: key.to_string(),
            is_enabled: existing.get(*key).copied().unwrap_or(true),
        })
        .collect())
}

#[tauri::command]
pub fn set_module_enabled(state: State<AppState>, input: SetModuleEnabledInput) -> Result<ModuleSetting, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;

    if !TOGGLEABLE_MODULES.contains(&input.module_key.as_str()) {
        return Err(format!("'{}' is not a toggleable module", input.module_key));
    }

    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO module_settings (id, tenant_id, branch_id, module_key, is_enabled, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
         ON CONFLICT(branch_id, module_key) DO UPDATE SET
             is_enabled = excluded.is_enabled,
             updated_at = excluded.updated_at,
             version = module_settings.version + 1",
        params![id, tenant_id, input.branch_id, input.module_key, input.is_enabled, now],
    )
    .map_err(|e| e.to_string())?;

    let row_id: String = tx
        .query_row(
            "SELECT id FROM module_settings WHERE branch_id = ?1 AND module_key = ?2",
            params![input.branch_id, input.module_key],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "module_settings", &row_id, "update").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ModuleSetting { module_key: input.module_key, is_enabled: input.is_enabled })
}
