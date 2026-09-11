use tauri::State;

use crate::models::{Branch, SchoolClass, Section};
use crate::state::AppState;

#[tauri::command]
pub fn list_branches(state: State<AppState>) -> Result<Vec<Branch>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, tenant_id, name, code, city, is_active
             FROM branches WHERE deleted_at IS NULL ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Branch {
                id: row.get(0)?,
                tenant_id: row.get(1)?,
                name: row.get(2)?,
                code: row.get(3)?,
                city: row.get(4)?,
                is_active: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_classes(state: State<AppState>, branch_id: String) -> Result<Vec<SchoolClass>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, academic_session_id, name, sort_order
             FROM classes WHERE branch_id = ?1 AND deleted_at IS NULL ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(SchoolClass {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                academic_session_id: row.get(2)?,
                name: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_sections(state: State<AppState>, class_id: String) -> Result<Vec<Section>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, class_id, name FROM sections
             WHERE class_id = ?1 AND deleted_at IS NULL ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([class_id], |row| {
            Ok(Section {
                id: row.get(0)?,
                class_id: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn current_academic_session_id(state: State<AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id FROM academic_sessions WHERE is_current = 1 AND deleted_at IS NULL LIMIT 1",
        [],
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(e.to_string())
        }
    })
}
