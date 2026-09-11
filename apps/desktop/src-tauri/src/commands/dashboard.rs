use tauri::State;

use crate::models::{AttendanceTrendPoint, ClassCount, DashboardStats, FeeStatusCount};
use crate::state::AppState;

/// One aggregate call for everything the dashboard renders, rather than one
/// round trip per widget -- all read-only, computed fresh each time (no
/// caching) since local SQLite reads are effectively free.
#[tauri::command]
pub fn get_dashboard_stats(state: State<AppState>, branch_id: String) -> Result<DashboardStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut student_counts = std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT status, COUNT(*) FROM students WHERE branch_id = ?1 AND deleted_at IS NULL GROUP BY status")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&branch_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (status, count) = row.map_err(|e| e.to_string())?;
            student_counts.insert(status, count);
        }
    }
    let enrolled_count = *student_counts.get("enrolled").unwrap_or(&0);
    let applied_count = *student_counts.get("applied").unwrap_or(&0);
    let alumni_count = *student_counts.get("alumni").unwrap_or(&0);
    let total_students: i64 = student_counts.values().sum();

    let (todays_attendance_present, todays_attendance_total): (i64, i64) = conn
        .query_row(
            "SELECT coalesce(SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END), 0), COUNT(*)
             FROM attendance_records
             WHERE branch_id = ?1 AND attendance_date = date('now') AND deleted_at IS NULL",
            [&branch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let (fee_collected_paise, fee_pending_paise): (i64, i64) = conn
        .query_row(
            "SELECT coalesce(SUM(amount_paid), 0), coalesce(SUM(amount_due - amount_paid), 0)
             FROM fee_invoices WHERE branch_id = ?1 AND deleted_at IS NULL",
            [&branch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let overdue_books_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_issues
             WHERE branch_id = ?1 AND status = 'issued' AND due_date < date('now') AND deleted_at IS NULL",
            [&branch_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let enrollment_by_class = {
        let mut stmt = conn
            .prepare(
                "SELECT c.name, COUNT(s.id)
                 FROM classes c
                 LEFT JOIN students s ON s.current_class_id = c.id AND s.status = 'enrolled' AND s.deleted_at IS NULL
                 WHERE c.branch_id = ?1 AND c.deleted_at IS NULL
                 GROUP BY c.id
                 ORDER BY c.sort_order",
            )
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([&branch_id], |row| {
                Ok(ClassCount { class_name: row.get(0)?, count: row.get(1)? })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };

    let attendance_trend = {
        let mut stmt = conn
            .prepare(
                "SELECT attendance_date,
                        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END),
                        COUNT(*)
                 FROM attendance_records
                 WHERE branch_id = ?1 AND deleted_at IS NULL AND attendance_date >= date('now', '-13 days')
                 GROUP BY attendance_date
                 ORDER BY attendance_date",
            )
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([&branch_id], |row| {
                Ok(AttendanceTrendPoint {
                    attendance_date: row.get(0)?,
                    present_count: row.get(1)?,
                    total_count: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };

    let fee_status_breakdown = {
        let mut stmt = conn
            .prepare(
                "SELECT status, COUNT(*), coalesce(SUM(amount_due - amount_paid), 0)
                 FROM fee_invoices WHERE branch_id = ?1 AND deleted_at IS NULL GROUP BY status",
            )
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([&branch_id], |row| {
                Ok(FeeStatusCount { status: row.get(0)?, count: row.get(1)?, amount: row.get(2)? })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        result
    };

    Ok(DashboardStats {
        total_students,
        enrolled_count,
        applied_count,
        alumni_count,
        todays_attendance_present,
        todays_attendance_total,
        fee_collected_paise,
        fee_pending_paise,
        overdue_books_count,
        enrollment_by_class,
        attendance_trend,
        fee_status_breakdown,
    })
}
