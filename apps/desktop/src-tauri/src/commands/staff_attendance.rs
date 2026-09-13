use rusqlite::params;
use tauri::State;

use crate::models::{MarkStaffAttendanceInput, StaffAttendanceHistoryEntry, StaffAttendanceRosterEntry};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

/// Every active staff member in a branch, with whatever attendance status is
/// already recorded for that date (mirrors
/// commands::attendance::get_attendance_roster for students).
#[tauri::command]
pub fn get_staff_attendance_roster(
    state: State<AppState>,
    branch_id: String,
    attendance_date: String,
) -> Result<Vec<StaffAttendanceRosterEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff_attendance.view")?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.first_name, s.last_name, s.designation, a.status, a.remarks
             FROM staff s
             LEFT JOIN staff_attendance a
               ON a.staff_id = s.id AND a.attendance_date = ?1 AND a.deleted_at IS NULL
             WHERE s.branch_id = ?2 AND s.deleted_at IS NULL AND s.status = 'active'
             ORDER BY s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![attendance_date, branch_id], |row| {
            Ok(StaffAttendanceRosterEntry {
                staff_id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                designation: row.get(3)?,
                status: row.get(4)?,
                remarks: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_staff_attendance(state: State<AppState>, input: MarkStaffAttendanceInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff_attendance.mark")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for entry in &input.entries {
        let new_id = uuid::Uuid::new_v4().to_string();

        tx.execute(
            "INSERT INTO staff_attendance (
                id, tenant_id, branch_id, staff_id, attendance_date, status, remarks, updated_at, version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)
            ON CONFLICT(tenant_id, staff_id, attendance_date) DO UPDATE SET
                status = excluded.status,
                remarks = excluded.remarks,
                updated_at = excluded.updated_at,
                version = staff_attendance.version + 1",
            params![new_id, tenant_id, input.branch_id, entry.staff_id, input.attendance_date, entry.status, entry.remarks, now],
        )
        .map_err(|e| e.to_string())?;

        let row_id: String = tx
            .query_row(
                "SELECT id FROM staff_attendance WHERE tenant_id = ?1 AND staff_id = ?2 AND attendance_date = ?3",
                params![tenant_id, entry.staff_id, input.attendance_date],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        enqueue_outbox_from_row(&tx, "staff_attendance", &row_id, "update").map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_staff_attendance_history(
    state: State<AppState>,
    staff_id: String,
) -> Result<Vec<StaffAttendanceHistoryEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff_attendance.view")?;

    let mut stmt = conn
        .prepare(
            "SELECT attendance_date, status, remarks FROM staff_attendance
             WHERE staff_id = ?1 AND deleted_at IS NULL
             ORDER BY attendance_date DESC LIMIT 90",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([staff_id], |row| {
            Ok(StaffAttendanceHistoryEntry { attendance_date: row.get(0)?, status: row.get(1)?, remarks: row.get(2)? })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
