use rusqlite::params;
use tauri::State;

use crate::models::{AuditLogEntry, AuditLogFilter};
use crate::state::{require_permission, AppState};

const PAGE_SIZE: i64 = 100;

#[tauri::command]
pub fn list_audit_log(state: State<AppState>, filter: AuditLogFilter) -> Result<Vec<AuditLogEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "audit.view")?;

    let page = filter.page.unwrap_or(0).max(0);
    let offset = page * PAGE_SIZE;

    let mut stmt = conn
        .prepare(
            "SELECT a.id, u.full_name, a.entity_table, a.entity_id, a.action, a.summary, a.created_at
             FROM audit_log a
             LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE (?1 IS NULL OR a.entity_table = ?1)
               AND (?2 IS NULL OR a.actor_user_id = ?2)
               AND (?3 IS NULL OR a.created_at >= ?3)
               AND (?4 IS NULL OR a.created_at <= ?4)
             ORDER BY a.created_at DESC
             LIMIT ?5 OFFSET ?6",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            params![filter.entity_table, filter.actor_user_id, filter.from_date, filter.to_date, PAGE_SIZE, offset],
            |row| {
                Ok(AuditLogEntry {
                    id: row.get(0)?,
                    actor_name: row.get(1)?,
                    entity_table: row.get(2)?,
                    entity_id: row.get(3)?,
                    action: row.get(4)?,
                    summary: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
