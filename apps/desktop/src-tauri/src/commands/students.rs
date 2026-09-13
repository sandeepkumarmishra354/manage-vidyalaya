use rusqlite::params;
use serde_json::json;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    Admission, ConfirmAdmissionResult, Guardian, NewAdmissionInput, Student, StudentDetail,
    StudentListItem, UpdateGuardianInput, UpdateStudentInput,
};
use crate::state::{current_tenant_id, enqueue_outbox, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn list_students(
    state: State<AppState>,
    branch_id: String,
    search: Option<String>,
) -> Result<Vec<StudentListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "students.view")?;

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
    require_permission(&conn, "students.view")?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.admission_number, s.first_name, s.last_name, s.status,
                    c.name as class_name, sec.name as section_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.current_class_id
             LEFT JOIN sections sec ON sec.id = s.current_section_id
             WHERE s.current_class_id = ?1 AND s.deleted_at IS NULL AND s.status = 'enrolled'
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
    require_permission(&conn, "students.view")?;

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
    require_permission(&conn, "admissions.create")?;
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

    record_audit(&tx, &tenant_id, Some(&input.branch_id), "admissions", &admission_id, "create", "New admission enquiry")
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

/// The (non-deleted) admission record for a student, if any -- a student
/// created via `create_admission` has exactly one. Used by the UI to find
/// what to pass to `confirm_admission`.
#[tauri::command]
pub fn get_admission_for_student(
    state: State<AppState>,
    student_id: String,
) -> Result<Option<Admission>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, student_id, branch_id, stage, applied_at FROM admissions
         WHERE student_id = ?1 AND deleted_at IS NULL LIMIT 1",
        [&student_id],
        |row| {
            Ok(Admission {
                id: row.get(0)?,
                student_id: row.get(1)?,
                branch_id: row.get(2)?,
                stage: row.get(3)?,
                applied_at: row.get(4)?,
            })
        },
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

/// Confirms an admission: assigns a real admission number and flips the
/// student to `enrolled` (the status every other module -- fees,
/// attendance, exams -- requires before a student is eligible). The
/// admission number is branch + year scoped and sequential
/// (`MAIN-2026-0001`), with a bounded retry loop against the `UNIQUE
/// (tenant_id, admission_number)` constraint to absorb same-device races
/// (e.g. a rapid double-click). A true cross-device race -- two offline
/// devices confirming admissions for the same branch before either has
/// synced -- can still collide; see docs/architecture.md.
#[tauri::command]
pub fn confirm_admission(state: State<AppState>, admission_id: String) -> Result<ConfirmAdmissionResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "admissions.confirm")?;
    confirm_admission_impl(&mut conn, admission_id)
}

pub fn confirm_admission_impl(
    conn: &mut rusqlite::Connection,
    admission_id: String,
) -> Result<ConfirmAdmissionResult, String> {
    let now = chrono::Utc::now().to_rfc3339();

    let (student_id, branch_id): (String, String) = conn
        .query_row(
            "SELECT student_id, branch_id FROM admissions WHERE id = ?1 AND deleted_at IS NULL",
            [&admission_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("admission not found: {e}"))?;

    let branch_code: String = conn
        .query_row("SELECT code FROM branches WHERE id = ?1", [&branch_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let year = chrono::Utc::now().format("%Y").to_string();
    let prefix = format!("{branch_code}-{year}-");

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM students WHERE admission_number LIKE ?1",
            [format!("{prefix}%")],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut next_seq: i64 = count + 1;

    const MAX_ATTEMPTS: i64 = 20;
    let mut attempts = 0;
    let admission_number = loop {
        attempts += 1;
        let candidate = format!("{prefix}{next_seq:04}");

        let result = tx.execute(
            "UPDATE students SET admission_number = ?1, status = 'enrolled', updated_at = ?2, version = version + 1
             WHERE id = ?3",
            params![candidate, now, student_id],
        );

        match result {
            Ok(_) => break candidate,
            Err(e) if e.to_string().contains("UNIQUE constraint failed") && attempts < MAX_ATTEMPTS => {
                next_seq += 1;
                continue;
            }
            Err(e) => return Err(e.to_string()),
        }
    };

    enqueue_outbox_from_row(&tx, "students", &student_id, "update").map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE admissions SET stage = 'enrolled', decided_at = ?1, updated_at = ?1, version = version + 1
         WHERE id = ?2",
        params![now, admission_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "admissions", &admission_id, "update").map_err(|e| e.to_string())?;

    let tenant_id = current_tenant_id(&tx)?;
    record_audit(&tx, &tenant_id, None, "admissions", &admission_id, "update", &format!("Confirmed admission, assigned number {admission_number}"))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ConfirmAdmissionResult {
        admission_id,
        student_id,
        admission_number,
        stage: "enrolled".to_string(),
    })
}

/// General-purpose edit for a student's own fields (name, DOB, class/section,
/// address, etc.) -- previously the only way to change any of this was via
/// direct database access, since no update command existed at all.
#[tauri::command]
pub fn update_student(state: State<AppState>, input: UpdateStudentInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "students.edit")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE students SET
            first_name = ?1, last_name = ?2, date_of_birth = ?3, gender = ?4, blood_group = ?5,
            current_class_id = ?6, current_section_id = ?7, address = ?8, city = ?9, state = ?10,
            pincode = ?11, notes = ?12, updated_at = ?13, version = version + 1
         WHERE id = ?14",
        params![
            input.first_name, input.last_name, input.date_of_birth, input.gender, input.blood_group,
            input.current_class_id, input.current_section_id, input.address, input.city, input.state,
            input.pincode, input.notes, now, input.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "students", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "students", &input.id, "update", "Updated student profile")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Soft-deletes a student. Guardians/admissions/attendance/fee/exam history
/// tied to the student are left intact (deleting a student is rare and
/// mostly a data-entry-error correction, not a real offboarding path --
/// `status = 'withdrawn'`/`'alumni'` via `update_student` covers the normal
/// "this student left the school" case while preserving their record).
#[tauri::command]
pub fn delete_student(state: State<AppState>, id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "students.delete")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE students SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "students", &id, "delete").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "students", &id, "delete", "Deleted student record")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_guardian(state: State<AppState>, input: UpdateGuardianInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "students.edit")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE guardians SET full_name = ?1, relation = ?2, phone = ?3, email = ?4, updated_at = ?5, version = version + 1 WHERE id = ?6",
        params![input.full_name, input.relation, input.phone, input.email, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "guardians", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "guardians", &input.id, "update", "Updated guardian details")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
