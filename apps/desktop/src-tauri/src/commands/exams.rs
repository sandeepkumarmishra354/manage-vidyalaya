use rusqlite::params;
use tauri::State;

use crate::models::{
    Exam, MarksRosterEntry, NewExamInput, NewSubjectInput, ReportCard, ReportCardSubjectRow,
    SaveMarksInput, Subject,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, AppState};

#[tauri::command]
pub fn create_subject(state: State<AppState>, input: NewSubjectInput) -> Result<Subject, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_subject_impl(&mut conn, input)
}

pub fn create_subject_impl(conn: &mut rusqlite::Connection, input: NewSubjectInput) -> Result<Subject, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO subjects (id, tenant_id, branch_id, name, code, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
        params![id, tenant_id, input.branch_id, input.name, input.code, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "subjects", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Subject { id, branch_id: input.branch_id, name: input.name, code: input.code })
}

#[tauri::command]
pub fn list_subjects(state: State<AppState>, branch_id: String) -> Result<Vec<Subject>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, branch_id, name, code FROM subjects WHERE branch_id = ?1 AND deleted_at IS NULL ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(Subject { id: row.get(0)?, branch_id: row.get(1)?, name: row.get(2)?, code: row.get(3)? })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_exam(state: State<AppState>, input: NewExamInput) -> Result<Exam, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_exam_impl(&mut conn, input)
}

pub fn create_exam_impl(conn: &mut rusqlite::Connection, input: NewExamInput) -> Result<Exam, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO exams (id, tenant_id, branch_id, academic_session_id, class_id, name, exam_date, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)",
        params![
            id,
            tenant_id,
            input.branch_id,
            input.academic_session_id,
            input.class_id,
            input.name,
            input.exam_date,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "exams", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(Exam {
        id,
        branch_id: input.branch_id,
        academic_session_id: input.academic_session_id,
        class_id: input.class_id,
        name: input.name,
        exam_date: input.exam_date,
    })
}

#[tauri::command]
pub fn list_exams(
    state: State<AppState>,
    branch_id: String,
    class_id: Option<String>,
) -> Result<Vec<Exam>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, academic_session_id, class_id, name, exam_date
             FROM exams WHERE branch_id = ?1 AND deleted_at IS NULL AND (?2 IS NULL OR class_id = ?2)
             ORDER BY exam_date DESC, name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, class_id], |row| {
            Ok(Exam {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                academic_session_id: row.get(2)?,
                class_id: row.get(3)?,
                name: row.get(4)?,
                exam_date: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Every student in the exam's class, with whatever marks already exist for
/// this exam+subject, so the UI can render a marks-entry roster in one call.
#[tauri::command]
pub fn get_marks_roster(
    state: State<AppState>,
    exam_id: String,
    subject_id: String,
) -> Result<Vec<MarksRosterEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let class_id: String = conn
        .query_row("SELECT class_id FROM exams WHERE id = ?1", [&exam_id], |row| row.get(0))
        .map_err(|e| format!("exam not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.first_name, s.last_name,
                    coalesce(m.max_marks, 100), m.marks_obtained, coalesce(m.is_absent, 0)
             FROM students s
             LEFT JOIN exam_marks m
               ON m.student_id = s.id AND m.exam_id = ?1 AND m.subject_id = ?2 AND m.deleted_at IS NULL
             WHERE s.current_class_id = ?3 AND s.deleted_at IS NULL AND s.status = 'enrolled'
             ORDER BY s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![exam_id, subject_id, class_id], |row| {
            Ok(MarksRosterEntry {
                student_id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                max_marks: row.get(3)?,
                marks_obtained: row.get(4)?,
                is_absent: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_marks(state: State<AppState>, input: SaveMarksInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    save_marks_impl(&mut conn, input)
}

pub fn save_marks_impl(conn: &mut rusqlite::Connection, input: SaveMarksInput) -> Result<(), String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for entry in &input.entries {
        let new_id = uuid::Uuid::new_v4().to_string();

        tx.execute(
            "INSERT INTO exam_marks (
                id, tenant_id, exam_id, subject_id, student_id, max_marks, marks_obtained, is_absent, updated_at, version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)
            ON CONFLICT(exam_id, subject_id, student_id) DO UPDATE SET
                max_marks = excluded.max_marks,
                marks_obtained = excluded.marks_obtained,
                is_absent = excluded.is_absent,
                updated_at = excluded.updated_at,
                version = exam_marks.version + 1",
            params![
                new_id,
                tenant_id,
                input.exam_id,
                input.subject_id,
                entry.student_id,
                entry.max_marks,
                entry.marks_obtained,
                entry.is_absent,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        let row_id: String = tx
            .query_row(
                "SELECT id FROM exam_marks WHERE exam_id = ?1 AND subject_id = ?2 AND student_id = ?3",
                params![input.exam_id, input.subject_id, entry.student_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        enqueue_outbox_from_row(&tx, "exam_marks", &row_id, "update").map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_report_card(state: State<AppState>, student_id: String, exam_id: String) -> Result<ReportCard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_report_card_impl(&conn, student_id, exam_id)
}

pub fn get_report_card_impl(
    conn: &rusqlite::Connection,
    student_id: String,
    exam_id: String,
) -> Result<ReportCard, String> {
    let (student_name, exam_name): (String, String) = conn
        .query_row(
            "SELECT (SELECT s.first_name || ' ' || coalesce(s.last_name, '') FROM students s WHERE s.id = ?1),
                    (SELECT e.name FROM exams e WHERE e.id = ?2)",
            params![student_id, exam_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT sub.name, m.max_marks, m.marks_obtained, m.is_absent
             FROM exam_marks m
             JOIN subjects sub ON sub.id = m.subject_id
             WHERE m.exam_id = ?1 AND m.student_id = ?2 AND m.deleted_at IS NULL
             ORDER BY sub.name",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<ReportCardSubjectRow> = stmt
        .query_map(params![exam_id, student_id], |row| {
            Ok(ReportCardSubjectRow {
                subject_name: row.get(0)?,
                max_marks: row.get(1)?,
                marks_obtained: row.get(2)?,
                is_absent: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let total_max: i64 = rows.iter().map(|r| r.max_marks).sum();
    let total_obtained: f64 = rows.iter().filter_map(|r| r.marks_obtained).sum();
    let percentage = if total_max > 0 { (total_obtained / total_max as f64) * 100.0 } else { 0.0 };

    Ok(ReportCard {
        student_id,
        student_name,
        exam_name,
        rows,
        total_obtained,
        total_max,
        percentage,
    })
}
