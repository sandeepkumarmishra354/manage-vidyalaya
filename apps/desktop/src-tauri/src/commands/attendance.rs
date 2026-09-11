use rusqlite::params;
use tauri::State;

use crate::models::{AttendanceHistoryEntry, AttendanceRosterEntry, MarkAttendanceInput};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, AppState};

/// Returns every (non-withdrawn) student in a class/section along with
/// whatever attendance status is already recorded for that date, so the UI
/// can render a mark-attendance roster in one call.
#[tauri::command]
pub fn get_attendance_roster(
    state: State<AppState>,
    branch_id: String,
    class_id: String,
    section_id: Option<String>,
    attendance_date: String,
) -> Result<Vec<AttendanceRosterEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let sql = "SELECT s.id, s.first_name, s.last_name, a.status, a.remarks
         FROM students s
         LEFT JOIN attendance_records a
           ON a.student_id = s.id AND a.attendance_date = ?1 AND a.deleted_at IS NULL
         WHERE s.branch_id = ?2 AND s.current_class_id = ?3 AND s.deleted_at IS NULL
           AND (?4 IS NULL OR s.current_section_id = ?4)
         ORDER BY s.first_name";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![attendance_date, branch_id, class_id, section_id], |row| {
            Ok(AttendanceRosterEntry {
                student_id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                status: row.get(3)?,
                remarks: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Upserts attendance for every student in the roster for one date, in a
/// single transaction. Re-marking a date updates the existing row (bumping
/// its version) rather than creating a duplicate.
#[tauri::command]
pub fn mark_attendance(state: State<AppState>, input: MarkAttendanceInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    mark_attendance_impl(&mut conn, input)
}

/// Core logic behind `mark_attendance`, factored out so it can be exercised
/// directly from integration tests against a plain `rusqlite::Connection`
/// (see commands::students::create_admission_impl for the same pattern).
pub fn mark_attendance_impl(conn: &mut rusqlite::Connection, input: MarkAttendanceInput) -> Result<(), String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for entry in &input.entries {
        let new_id = uuid::Uuid::new_v4().to_string();

        tx.execute(
            "INSERT INTO attendance_records (
                id, tenant_id, branch_id, student_id, class_id, section_id,
                attendance_date, status, remarks, updated_at, version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)
            ON CONFLICT(tenant_id, student_id, attendance_date) DO UPDATE SET
                class_id = excluded.class_id,
                section_id = excluded.section_id,
                status = excluded.status,
                remarks = excluded.remarks,
                updated_at = excluded.updated_at,
                version = attendance_records.version + 1",
            params![
                new_id,
                tenant_id,
                input.branch_id,
                entry.student_id,
                input.class_id,
                input.section_id,
                input.attendance_date,
                entry.status,
                entry.remarks,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        let row_id: String = tx
            .query_row(
                "SELECT id FROM attendance_records WHERE tenant_id = ?1 AND student_id = ?2 AND attendance_date = ?3",
                params![tenant_id, entry.student_id, input.attendance_date],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        enqueue_outbox_from_row(&tx, "attendance_records", &row_id, "update")
            .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_student_attendance_history(
    state: State<AppState>,
    student_id: String,
) -> Result<Vec<AttendanceHistoryEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT attendance_date, status, remarks FROM attendance_records
             WHERE student_id = ?1 AND deleted_at IS NULL
             ORDER BY attendance_date DESC LIMIT 90",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([student_id], |row| {
            Ok(AttendanceHistoryEntry {
                attendance_date: row.get(0)?,
                status: row.get(1)?,
                remarks: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
