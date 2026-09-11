use rusqlite::params;
use serde_json::json;
use tauri::State;

use crate::models::{Admission, Guardian, NewAdmissionInput, Student, StudentDetail, StudentListItem};
use crate::state::{current_tenant_id, enqueue_outbox, AppState};

#[tauri::command]
pub fn list_students(
    state: State<AppState>,
    branch_id: String,
    search: Option<String>,
) -> Result<Vec<StudentListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let search_pattern = format!("%{}%", search.unwrap_or_default().to_lowercase());

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.admission_number, s.first_name, s.last_name, s.status,
                    c.name as class_name, sec.name as section_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.current_class_id
             LEFT JOIN sections sec ON sec.id = s.current_section_id
             WHERE s.branch_id = ?1 AND s.deleted_at IS NULL
               AND (
                 lower(s.first_name) LIKE ?2
                 OR lower(coalesce(s.last_name, '')) LIKE ?2
                 OR lower(coalesce(s.admission_number, '')) LIKE ?2
               )
             ORDER BY s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, search_pattern], |row| {
            Ok(StudentListItem {
                id: row.get(0)?,
                admission_number: row.get(1)?,
                first_name: row.get(2)?,
                last_name: row.get(3)?,
                status: row.get(4)?,
                class_name: row.get(5)?,
                section_name: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Students currently in a given class, regardless of branch filtering --
/// used to populate student pickers for class-scoped flows (exam marks,
/// report cards) without needing the caller to already know the branch.
#[tauri::command]
pub fn list_students_in_class(
    state: State<AppState>,
    class_id: String,
) -> Result<Vec<StudentListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.admission_number, s.first_name, s.last_name, s.status,
                    c.name as class_name, sec.name as section_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.current_class_id
             LEFT JOIN sections sec ON sec.id = s.current_section_id
             WHERE s.current_class_id = ?1 AND s.deleted_at IS NULL
             ORDER BY s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([class_id], |row| {
            Ok(StudentListItem {
                id: row.get(0)?,
                admission_number: row.get(1)?,
                first_name: row.get(2)?,
                last_name: row.get(3)?,
                status: row.get(4)?,
                class_name: row.get(5)?,
                section_name: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_student(state: State<AppState>, id: String) -> Result<StudentDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let student = conn
        .query_row(
            "SELECT id, tenant_id, branch_id, admission_number, first_name, last_name,
                    date_of_birth, gender, current_class_id, current_section_id, status,
                    address, updated_at, version
             FROM students WHERE id = ?1 AND deleted_at IS NULL",
            [&id],
            |row| {
                Ok(Student {
                    id: row.get(0)?,
                    tenant_id: row.get(1)?,
                    branch_id: row.get(2)?,
                    admission_number: row.get(3)?,
                    first_name: row.get(4)?,
                    last_name: row.get(5)?,
                    date_of_birth: row.get(6)?,
                    gender: row.get(7)?,
                    current_class_id: row.get(8)?,
                    current_section_id: row.get(9)?,
                    status: row.get(10)?,
                    address: row.get(11)?,
                    updated_at: row.get(12)?,
                    version: row.get(13)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT g.id, g.full_name, g.relation, g.phone, g.email
             FROM guardians g
             JOIN student_guardians sg ON sg.guardian_id = g.id
             WHERE sg.student_id = ?1 AND g.deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;

    let guardians = stmt
        .query_map([&id], |row| {
            Ok(Guardian {
                id: row.get(0)?,
                full_name: row.get(1)?,
                relation: row.get(2)?,
                phone: row.get(3)?,
                email: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(StudentDetail { student, guardians })
}

/// Creates a student + guardian + admission record in one local transaction,
/// writing a sync_outbox row for each new entity so the sync engine picks it
/// up on the next push cycle. This is the vertical slice proving the whole
/// offline-write -> outbox -> sync architecture end to end.
#[tauri::command]
pub fn create_admission(
    state: State<AppState>,
    input: NewAdmissionInput,
) -> Result<Admission, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    create_admission_impl(&mut conn, input)
}

/// Core logic behind `create_admission`, factored out of the `#[tauri::command]`
/// wrapper (which needs a live `State<AppState>`) so it can be exercised
/// directly from integration tests against a plain `rusqlite::Connection`.
pub fn create_admission_impl(
    conn: &mut rusqlite::Connection,
    input: NewAdmissionInput,
) -> Result<Admission, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let student_id = uuid::Uuid::new_v4().to_string();
    let guardian_id = uuid::Uuid::new_v4().to_string();
    let student_guardian_id = uuid::Uuid::new_v4().to_string();
    let admission_id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO students (
            id, tenant_id, branch_id, first_name, last_name, date_of_birth, gender,
            current_class_id, status, address, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'applied', ?9, ?10, 1)",
        params![
            student_id,
            tenant_id,
            input.branch_id,
            input.first_name,
            input.last_name,
            input.date_of_birth,
            input.gender,
            input.applied_class_id,
            input.address,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let student_payload = json!({
        "id": student_id, "tenant_id": tenant_id, "branch_id": input.branch_id,
        "first_name": input.first_name, "last_name": input.last_name,
        "date_of_birth": input.date_of_birth, "gender": input.gender,
        "current_class_id": input.applied_class_id, "status": "applied",
        "address": input.address, "updated_at": now, "version": 1
    });
    enqueue_outbox(&tx, "students", &student_id, "insert", &student_payload.to_string())
        .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO guardians (id, tenant_id, full_name, relation, phone, email, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        params![
            guardian_id,
            tenant_id,
            input.guardian_name,
            input.guardian_relation,
            input.guardian_phone,
            input.guardian_email,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let guardian_payload = json!({
        "id": guardian_id, "tenant_id": tenant_id, "full_name": input.guardian_name,
        "relation": input.guardian_relation, "phone": input.guardian_phone,
        "email": input.guardian_email, "updated_at": now, "version": 1
    });
    enqueue_outbox(&tx, "guardians", &guardian_id, "insert", &guardian_payload.to_string())
        .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relation, is_primary_contact, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, 1)",
        params![
            student_guardian_id,
            tenant_id,
            student_id,
            guardian_id,
            input.guardian_relation,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let sg_payload = json!({
        "id": student_guardian_id, "tenant_id": tenant_id, "student_id": student_id,
        "guardian_id": guardian_id, "relation": input.guardian_relation,
        "is_primary_contact": true, "updated_at": now, "version": 1
    });
    enqueue_outbox(&tx, "student_guardians", &student_guardian_id, "insert", &sg_payload.to_string())
        .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO admissions (
            id, tenant_id, branch_id, student_id, applied_class_id, academic_session_id,
            stage, applied_at, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'applied', ?7, ?7, 1)",
        params![
            admission_id,
            tenant_id,
            input.branch_id,
            student_id,
            input.applied_class_id,
            input.academic_session_id,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    let admission_payload = json!({
        "id": admission_id, "tenant_id": tenant_id, "branch_id": input.branch_id,
        "student_id": student_id, "applied_class_id": input.applied_class_id,
        "academic_session_id": input.academic_session_id, "stage": "applied",
        "applied_at": now, "updated_at": now, "version": 1
    });
    enqueue_outbox(&tx, "admissions", &admission_id, "insert", &admission_payload.to_string())
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Admission {
        id: admission_id,
        student_id,
        branch_id: input.branch_id,
        stage: "applied".to_string(),
        applied_at: now,
    })
}
