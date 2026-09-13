use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    AssignHouseInput, House, HouseLeaderboardRow, HousePointEventListItem, NewHouseInput,
    NewHousePointEventInput, UpdateHouseInput,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn create_house(state: State<AppState>, input: NewHouseInput) -> Result<House, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "houses.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO houses (id, tenant_id, branch_id, name, color, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
        params![id, tenant_id, input.branch_id, input.name, input.color, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "houses", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(House { id, branch_id: input.branch_id, name: input.name, color: input.color })
}

#[tauri::command]
pub fn update_house(state: State<AppState>, input: UpdateHouseInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "houses.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE houses SET name = ?1, color = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4",
        params![input.name, input.color, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "houses", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "houses", &input.id, "update", &format!("Renamed house to '{}'", input.name))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_houses(state: State<AppState>, branch_id: String) -> Result<Vec<House>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "houses.view")?;
    let mut stmt = conn
        .prepare("SELECT id, branch_id, name, color FROM houses WHERE branch_id = ?1 AND deleted_at IS NULL ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(House { id: row.get(0)?, branch_id: row.get(1)?, name: row.get(2)?, color: row.get(3)? })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Assigns a student to a house, replacing any previous assignment (a
/// student has at most one house at a time).
#[tauri::command]
pub fn assign_student_house(state: State<AppState>, input: AssignHouseInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "houses.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO student_houses (id, tenant_id, student_id, house_id, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)
         ON CONFLICT(student_id) DO UPDATE SET
             house_id = excluded.house_id,
             updated_at = excluded.updated_at,
             version = student_houses.version + 1",
        params![id, tenant_id, input.student_id, input.house_id, now],
    )
    .map_err(|e| e.to_string())?;

    let row_id: String = tx
        .query_row(
            "SELECT id FROM student_houses WHERE student_id = ?1",
            [&input.student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "student_houses", &row_id, "update").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_student_house(state: State<AppState>, student_id: String) -> Result<Option<House>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT h.id, h.branch_id, h.name, h.color
         FROM houses h
         JOIN student_houses sh ON sh.house_id = h.id
         WHERE sh.student_id = ?1 AND sh.deleted_at IS NULL AND h.deleted_at IS NULL",
        [&student_id],
        |row| Ok(House { id: row.get(0)?, branch_id: row.get(1)?, name: row.get(2)?, color: row.get(3)? }),
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

#[tauri::command]
pub fn award_house_points(
    state: State<AppState>,
    input: NewHousePointEventInput,
) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "houses.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO house_point_events (
            id, tenant_id, branch_id, house_id, student_id, academic_session_id,
            points, reason, event_date, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)",
        params![
            id,
            tenant_id,
            input.branch_id,
            input.house_id,
            input.student_id,
            input.academic_session_id,
            input.points,
            input.reason,
            input.event_date,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "house_point_events", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn list_house_point_events(
    state: State<AppState>,
    branch_id: String,
) -> Result<Vec<HousePointEventListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, h.name,
                    (SELECT s.first_name || ' ' || coalesce(s.last_name, '') FROM students s WHERE s.id = e.student_id),
                    e.points, e.reason, e.event_date
             FROM house_point_events e
             JOIN houses h ON h.id = e.house_id
             WHERE e.branch_id = ?1 AND e.deleted_at IS NULL
             ORDER BY e.event_date DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(HousePointEventListItem {
                id: row.get(0)?,
                house_name: row.get(1)?,
                student_name: row.get(2)?,
                points: row.get(3)?,
                reason: row.get(4)?,
                event_date: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_house_leaderboard(
    state: State<AppState>,
    branch_id: String,
    academic_session_id: Option<String>,
) -> Result<Vec<HouseLeaderboardRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.name, h.color,
                    coalesce((SELECT SUM(e.points) FROM house_point_events e
                              WHERE e.house_id = h.id AND e.deleted_at IS NULL
                                AND (?2 IS NULL OR e.academic_session_id = ?2)), 0) as total_points,
                    (SELECT COUNT(*) FROM student_houses sh WHERE sh.house_id = h.id AND sh.deleted_at IS NULL) as student_count
             FROM houses h
             WHERE h.branch_id = ?1 AND h.deleted_at IS NULL
             ORDER BY total_points DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, academic_session_id], |row| {
            Ok(HouseLeaderboardRow {
                house_id: row.get(0)?,
                house_name: row.get(1)?,
                color: row.get(2)?,
                total_points: row.get(3)?,
                student_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
