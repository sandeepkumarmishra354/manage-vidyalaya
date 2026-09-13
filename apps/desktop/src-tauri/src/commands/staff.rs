use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    NewStaffInput, NewTeacherAssignmentInput, SetClassTeacherInput, SetStaffStatusInput, Staff,
    StaffListItem, TeacherAssignment, UpdateStaffInput,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn list_staff(state: State<AppState>, branch_id: String, search: Option<String>) -> Result<Vec<StaffListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.view")?;

    let search_pattern = format!("%{}%", search.unwrap_or_default().to_lowercase());

    let mut stmt = conn
        .prepare(
            "SELECT id, employee_code, first_name, last_name, designation, department, status, user_id
             FROM staff
             WHERE branch_id = ?1 AND deleted_at IS NULL
               AND (
                 lower(first_name) LIKE ?2
                 OR lower(coalesce(last_name, '')) LIKE ?2
                 OR lower(employee_code) LIKE ?2
                 OR lower(designation) LIKE ?2
               )
             ORDER BY first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, search_pattern], |row| {
            Ok(StaffListItem {
                id: row.get(0)?,
                employee_code: row.get(1)?,
                first_name: row.get(2)?,
                last_name: row.get(3)?,
                designation: row.get(4)?,
                department: row.get(5)?,
                status: row.get(6)?,
                has_login: row.get::<_, Option<String>>(7)?.is_some(),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

const STAFF_COLUMNS: &str = "id, branch_id, user_id, employee_code, first_name, last_name, date_of_birth,
    gender, phone, personal_email, address, city, state, pincode, designation, department,
    employment_type, date_of_joining, date_of_leaving, status, qualification, blood_group,
    photo_path, pan_number, aadhaar_number, bank_account_number, bank_ifsc, bank_name,
    pf_number, esi_number, uan_number, emergency_contact_name, emergency_contact_phone, notes";

fn row_to_staff(row: &rusqlite::Row) -> rusqlite::Result<Staff> {
    Ok(Staff {
        id: row.get(0)?,
        branch_id: row.get(1)?,
        user_id: row.get(2)?,
        employee_code: row.get(3)?,
        first_name: row.get(4)?,
        last_name: row.get(5)?,
        date_of_birth: row.get(6)?,
        gender: row.get(7)?,
        phone: row.get(8)?,
        personal_email: row.get(9)?,
        address: row.get(10)?,
        city: row.get(11)?,
        state: row.get(12)?,
        pincode: row.get(13)?,
        designation: row.get(14)?,
        department: row.get(15)?,
        employment_type: row.get(16)?,
        date_of_joining: row.get(17)?,
        date_of_leaving: row.get(18)?,
        status: row.get(19)?,
        qualification: row.get(20)?,
        blood_group: row.get(21)?,
        photo_path: row.get(22)?,
        pan_number: row.get(23)?,
        aadhaar_number: row.get(24)?,
        bank_account_number: row.get(25)?,
        bank_ifsc: row.get(26)?,
        bank_name: row.get(27)?,
        pf_number: row.get(28)?,
        esi_number: row.get(29)?,
        uan_number: row.get(30)?,
        emergency_contact_name: row.get(31)?,
        emergency_contact_phone: row.get(32)?,
        notes: row.get(33)?,
    })
}

#[tauri::command]
pub fn get_staff(state: State<AppState>, id: String) -> Result<Staff, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.view")?;
    conn.query_row(
        &format!("SELECT {STAFF_COLUMNS} FROM staff WHERE id = ?1 AND deleted_at IS NULL"),
        [&id],
        row_to_staff,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_staff(state: State<AppState>, input: NewStaffInput) -> Result<Staff, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO staff (
            id, tenant_id, branch_id, employee_code, first_name, last_name, date_of_birth, gender,
            phone, personal_email, address, city, state, pincode, designation, department,
            employment_type, date_of_joining, status, qualification, blood_group, pan_number,
            aadhaar_number, bank_account_number, bank_ifsc, bank_name, pf_number, esi_number,
            uan_number, emergency_contact_name, emergency_contact_phone, notes, updated_at, version
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,'active',?19,?20,?21,
                  ?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,1)",
        params![
            id, tenant_id, input.branch_id, input.employee_code, input.first_name, input.last_name,
            input.date_of_birth, input.gender, input.phone, input.personal_email, input.address,
            input.city, input.state, input.pincode, input.designation, input.department,
            input.employment_type, input.date_of_joining, input.qualification, input.blood_group,
            input.pan_number, input.aadhaar_number, input.bank_account_number, input.bank_ifsc,
            input.bank_name, input.pf_number, input.esi_number, input.uan_number,
            input.emergency_contact_name, input.emergency_contact_phone, input.notes, now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "staff", &id, "insert").map_err(|e| e.to_string())?;
    record_audit(
        &tx,
        &tenant_id,
        Some(&input.branch_id),
        "staff",
        &id,
        "create",
        &format!("Added staff member '{} {}'", input.first_name, input.last_name.clone().unwrap_or_default()),
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    conn.query_row(&format!("SELECT {STAFF_COLUMNS} FROM staff WHERE id = ?1"), [&id], row_to_staff)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_staff(state: State<AppState>, input: UpdateStaffInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let f = &input.fields;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE staff SET
            employee_code = ?1, first_name = ?2, last_name = ?3, date_of_birth = ?4, gender = ?5,
            phone = ?6, personal_email = ?7, address = ?8, city = ?9, state = ?10, pincode = ?11,
            designation = ?12, department = ?13, employment_type = ?14, date_of_joining = ?15,
            qualification = ?16, blood_group = ?17, pan_number = ?18, aadhaar_number = ?19,
            bank_account_number = ?20, bank_ifsc = ?21, bank_name = ?22, pf_number = ?23,
            esi_number = ?24, uan_number = ?25, emergency_contact_name = ?26,
            emergency_contact_phone = ?27, notes = ?28, updated_at = ?29, version = version + 1
         WHERE id = ?30",
        params![
            f.employee_code, f.first_name, f.last_name, f.date_of_birth, f.gender, f.phone,
            f.personal_email, f.address, f.city, f.state, f.pincode, f.designation, f.department,
            f.employment_type, f.date_of_joining, f.qualification, f.blood_group, f.pan_number,
            f.aadhaar_number, f.bank_account_number, f.bank_ifsc, f.bank_name, f.pf_number,
            f.esi_number, f.uan_number, f.emergency_contact_name, f.emergency_contact_phone,
            f.notes, now, input.id,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "staff", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, Some(&f.branch_id), "staff", &input.id, "update", "Updated staff profile")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Deactivates (or reactivates) a staff member -- the soft-delete equivalent
/// for HR records, matching payroll/attendance conventions where a full
/// employment history should be preserved rather than erased.
#[tauri::command]
pub fn set_staff_status(state: State<AppState>, input: SetStaffStatusInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE staff SET status = ?1, date_of_leaving = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4",
        params![input.status, input.date_of_leaving, now, input.staff_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "staff", &input.staff_id, "update").map_err(|e| e.to_string())?;
    record_audit(
        &tx,
        &tenant_id,
        None,
        "staff",
        &input.staff_id,
        "update",
        &format!("Set staff status to '{}'", input.status),
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_teacher_assignments(
    state: State<AppState>,
    branch_id: String,
    staff_id: Option<String>,
) -> Result<Vec<TeacherAssignment>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.view")?;

    let mut stmt = conn
        .prepare(
            "SELECT ta.id, ta.staff_id, st.first_name || ' ' || coalesce(st.last_name, ''),
                    ta.class_id, c.name, ta.section_id, sec.name, ta.subject_id, sub.name, ta.academic_session_id
             FROM teacher_subject_assignments ta
             JOIN staff st ON st.id = ta.staff_id
             JOIN classes c ON c.id = ta.class_id
             LEFT JOIN sections sec ON sec.id = ta.section_id
             JOIN subjects sub ON sub.id = ta.subject_id
             WHERE ta.branch_id = ?1 AND ta.deleted_at IS NULL AND (?2 IS NULL OR ta.staff_id = ?2)
             ORDER BY c.sort_order, st.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, staff_id], |row| {
            Ok(TeacherAssignment {
                id: row.get(0)?,
                staff_id: row.get(1)?,
                staff_name: row.get(2)?,
                class_id: row.get(3)?,
                class_name: row.get(4)?,
                section_id: row.get(5)?,
                section_name: row.get(6)?,
                subject_id: row.get(7)?,
                subject_name: row.get(8)?,
                academic_session_id: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_teacher_assignment(
    state: State<AppState>,
    input: NewTeacherAssignmentInput,
) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO teacher_subject_assignments (
            id, tenant_id, branch_id, staff_id, class_id, section_id, subject_id, academic_session_id, updated_at, version
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1)",
        params![
            id, tenant_id, input.branch_id, input.staff_id, input.class_id, input.section_id,
            input.subject_id, input.academic_session_id, now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "teacher_subject_assignments", &id, "insert").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, Some(&input.branch_id), "teacher_subject_assignments", &id, "create", "Assigned teacher to subject/class")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_teacher_assignment(state: State<AppState>, id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE teacher_subject_assignments SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "teacher_subject_assignments", &id, "delete").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "teacher_subject_assignments", &id, "delete", "Removed teacher assignment")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_class_teacher(state: State<AppState>, input: SetClassTeacherInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "staff.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE sections SET class_teacher_staff_id = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3",
        params![input.staff_id, now, input.section_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "sections", &input.section_id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "sections", &input.section_id, "update", "Set class teacher")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
