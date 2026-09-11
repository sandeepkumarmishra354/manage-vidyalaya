use tauri::State;

use crate::models::{
    AcademicSession, Branch, NewAcademicSessionInput, NewClassInput, NewSectionInput, SchoolClass, Section,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, AppState};

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

/// Creates a class within a branch/academic session. Any school with more
/// than the single demo class needs this -- there was previously no way to
/// add one at all.
#[tauri::command]
pub fn create_class(state: State<AppState>, input: NewClassInput) -> Result<SchoolClass, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_class_impl(&mut conn, input)
}

pub fn create_class_impl(conn: &mut rusqlite::Connection, input: NewClassInput) -> Result<SchoolClass, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO classes (id, tenant_id, branch_id, academic_session_id, name, sort_order, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        rusqlite::params![
            id,
            tenant_id,
            input.branch_id,
            input.academic_session_id,
            input.name,
            input.sort_order,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "classes", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(SchoolClass {
        id,
        branch_id: input.branch_id,
        academic_session_id: input.academic_session_id,
        name: input.name,
        sort_order: input.sort_order,
    })
}

#[tauri::command]
pub fn create_section(state: State<AppState>, input: NewSectionInput) -> Result<Section, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_section_impl(&mut conn, input)
}

pub fn create_section_impl(conn: &mut rusqlite::Connection, input: NewSectionInput) -> Result<Section, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO sections (id, tenant_id, class_id, name, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        rusqlite::params![id, tenant_id, input.class_id, input.name, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "sections", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Section { id, class_id: input.class_id, name: input.name })
}

#[tauri::command]
pub fn list_academic_sessions(state: State<AppState>) -> Result<Vec<AcademicSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, start_date, end_date, is_current
             FROM academic_sessions WHERE deleted_at IS NULL ORDER BY start_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AcademicSession {
                id: row.get(0)?,
                name: row.get(1)?,
                start_date: row.get(2)?,
                end_date: row.get(3)?,
                is_current: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Creates an academic session. If `is_current` is set, every other session
/// is demoted first so exactly one session is ever current at a time.
#[tauri::command]
pub fn create_academic_session(
    state: State<AppState>,
    input: NewAcademicSessionInput,
) -> Result<AcademicSession, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_academic_session_impl(&mut conn, input)
}

pub fn create_academic_session_impl(
    conn: &mut rusqlite::Connection,
    input: NewAcademicSessionInput,
) -> Result<AcademicSession, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if input.is_current {
        let demoted_ids: Vec<String> = {
            let mut stmt = tx
                .prepare("SELECT id FROM academic_sessions WHERE tenant_id = ?1 AND is_current = 1")
                .map_err(|e| e.to_string())?;
            let ids = stmt
                .query_map([&tenant_id], |row| row.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            ids
        };

        for demoted_id in demoted_ids {
            tx.execute(
                "UPDATE academic_sessions SET is_current = 0, updated_at = ?1, version = version + 1 WHERE id = ?2",
                rusqlite::params![now, demoted_id],
            )
            .map_err(|e| e.to_string())?;
            enqueue_outbox_from_row(&tx, "academic_sessions", &demoted_id, "update")
                .map_err(|e| e.to_string())?;
        }
    }

    tx.execute(
        "INSERT INTO academic_sessions (id, tenant_id, name, start_date, end_date, is_current, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        rusqlite::params![id, tenant_id, input.name, input.start_date, input.end_date, input.is_current, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "academic_sessions", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(AcademicSession {
        id,
        name: input.name,
        start_date: input.start_date,
        end_date: input.end_date,
        is_current: input.is_current,
    })
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
