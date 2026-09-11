//! Exercises the Attendance, Fees & Billing, and Exams & Report Cards
//! modules end to end against a real local SQLite database (no network,
//! no Tauri runtime) -- creating students, marking attendance, generating
//! and paying fee invoices, and entering exam marks, then reading the data
//! back through the same query paths the UI uses.

use desktop_lib::commands::exams::{
    create_exam_impl, create_subject_impl, get_report_card_impl, save_marks_impl,
};
use desktop_lib::commands::fees::{create_fee_structure_impl, generate_invoices_impl, record_payment_impl};
use desktop_lib::commands::attendance::mark_attendance_impl;
use desktop_lib::commands::students::create_admission_impl;
use desktop_lib::db;
use desktop_lib::models::{
    MarkAttendanceEntry, MarkAttendanceInput, NewAdmissionInput, NewExamInput, NewFeeStructureInput,
    NewSubjectInput, RecordPaymentInput, SaveMarksEntry, SaveMarksInput,
};
use desktop_lib::seed::{seed_demo_data_if_empty, DEMO_BRANCH_ID};

fn fresh_db() -> rusqlite::Connection {
    let dir = std::env::temp_dir().join(format!("vidyalaya-modules-it-{}", uuid::Uuid::new_v4()));
    let db_path = dir.join("device.sqlite3");
    let mut conn = db::open_db(&db_path).expect("open db");
    seed_demo_data_if_empty(&mut conn).expect("seed demo data");
    conn
}

fn enroll_student(conn: &mut rusqlite::Connection, first_name: &str) -> String {
    let academic_session_id: String = conn
        .query_row("SELECT id FROM academic_sessions LIMIT 1", [], |r| r.get(0))
        .unwrap();
    let class_id: String = conn.query_row("SELECT id FROM classes LIMIT 1", [], |r| r.get(0)).unwrap();

    let admission = create_admission_impl(
        conn,
        NewAdmissionInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            academic_session_id,
            applied_class_id: Some(class_id),
            first_name: first_name.to_string(),
            last_name: Some("Test".to_string()),
            date_of_birth: None,
            gender: None,
            address: None,
            guardian_name: "Parent Test".to_string(),
            guardian_relation: "father".to_string(),
            guardian_phone: None,
            guardian_email: None,
        },
    )
    .expect("create_admission_impl should succeed");

    admission.student_id
}

#[test]
fn attendance_can_be_marked_and_remarked_without_duplicating_rows() {
    let mut conn = fresh_db();
    let student_id = enroll_student(&mut conn, "Aarav");
    let class_id: String = conn.query_row("SELECT id FROM classes LIMIT 1", [], |r| r.get(0)).unwrap();

    mark_attendance_impl(
        &mut conn,
        MarkAttendanceInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            class_id: class_id.clone(),
            section_id: None,
            attendance_date: "2026-06-01".to_string(),
            entries: vec![MarkAttendanceEntry {
                student_id: student_id.clone(),
                status: "present".to_string(),
                remarks: None,
            }],
        },
    )
    .expect("mark_attendance_impl should succeed");

    // Re-mark the same date with a different status -- should update, not duplicate.
    mark_attendance_impl(
        &mut conn,
        MarkAttendanceInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            class_id,
            section_id: None,
            attendance_date: "2026-06-01".to_string(),
            entries: vec![MarkAttendanceEntry {
                student_id: student_id.clone(),
                status: "absent".to_string(),
                remarks: Some("Sick leave".to_string()),
            }],
        },
    )
    .expect("re-marking should succeed");

    let (count, status, version): (i64, String, i64) = conn
        .query_row(
            "SELECT COUNT(*), status, version FROM attendance_records WHERE student_id = ?1",
            [&student_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    // COUNT(*) from a single-row aggregate won't reflect duplicates directly;
    // assert distinctness explicitly instead.
    let row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM attendance_records WHERE student_id = ?1", [&student_id], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(row_count, 1, "re-marking the same date must update the existing row");
    assert_eq!(status, "absent");
    assert_eq!(version, 2, "version should bump on update");
    let _ = count;

    // Every mutation should have queued an outbox entry for sync.
    let outbox_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE entity_table = 'attendance_records'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(outbox_count, 2, "both the initial mark and the re-mark should be queued for sync");
}

#[test]
fn fee_invoice_moves_from_pending_to_partial_to_paid_as_payments_are_recorded() {
    let mut conn = fresh_db();
    let student_id = enroll_student(&mut conn, "Diya");
    let academic_session_id: String = conn
        .query_row("SELECT id FROM academic_sessions LIMIT 1", [], |r| r.get(0))
        .unwrap();

    let structure = create_fee_structure_impl(
        &mut conn,
        NewFeeStructureInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            academic_session_id,
            class_id: None, // applies to every class in the branch
            name: "Tuition Fee".to_string(),
            amount: 1_000_000, // Rs. 10,000 in paise
            frequency: "annual".to_string(),
        },
    )
    .expect("create_fee_structure_impl should succeed");

    let created = generate_invoices_impl(&mut conn, structure.id.clone())
        .expect("generate_invoices_impl should succeed");
    assert!(created >= 1, "should generate at least one invoice (for the enrolled student)");

    // Generating twice must not create duplicate invoices.
    let created_again =
        generate_invoices_impl(&mut conn, structure.id.clone()).expect("second generate should succeed");
    assert_eq!(created_again, 0, "invoices already exist -- nothing new to create");

    let invoice_id: String = conn
        .query_row(
            "SELECT id FROM fee_invoices WHERE student_id = ?1 AND fee_structure_id = ?2",
            rusqlite::params![student_id, structure.id],
            |row| row.get(0),
        )
        .expect("invoice for the enrolled student should exist");

    let status: String = conn
        .query_row("SELECT status FROM fee_invoices WHERE id = ?1", [&invoice_id], |r| r.get(0))
        .unwrap();
    assert_eq!(status, "pending");

    record_payment_impl(
        &mut conn,
        RecordPaymentInput {
            invoice_id: invoice_id.clone(),
            amount: 400_000,
            payment_method: "cash".to_string(),
            payment_date: "2026-06-01".to_string(),
            receipt_number: Some("RCPT-1".to_string()),
            remarks: None,
        },
    )
    .expect("partial payment should succeed");

    let status: String = conn
        .query_row("SELECT status FROM fee_invoices WHERE id = ?1", [&invoice_id], |r| r.get(0))
        .unwrap();
    assert_eq!(status, "partial");

    record_payment_impl(
        &mut conn,
        RecordPaymentInput {
            invoice_id: invoice_id.clone(),
            amount: 600_000,
            payment_method: "upi".to_string(),
            payment_date: "2026-06-15".to_string(),
            receipt_number: Some("RCPT-2".to_string()),
            remarks: None,
        },
    )
    .expect("final payment should succeed");

    let (status, amount_paid, amount_due): (String, i64, i64) = conn
        .query_row(
            "SELECT status, amount_paid, amount_due FROM fee_invoices WHERE id = ?1",
            [&invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(status, "paid");
    assert_eq!(amount_paid, amount_due);

    let payment_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM fee_payments WHERE invoice_id = ?1", [&invoice_id], |r| r.get(0))
        .unwrap();
    assert_eq!(payment_count, 2);
}

#[test]
fn exam_marks_roll_up_into_a_correct_report_card() {
    let mut conn = fresh_db();
    let student_id = enroll_student(&mut conn, "Ishaan");
    let academic_session_id: String = conn
        .query_row("SELECT id FROM academic_sessions LIMIT 1", [], |r| r.get(0))
        .unwrap();
    let class_id: String = conn.query_row("SELECT id FROM classes LIMIT 1", [], |r| r.get(0)).unwrap();

    let math = create_subject_impl(
        &mut conn,
        NewSubjectInput { branch_id: DEMO_BRANCH_ID.to_string(), name: "Mathematics".to_string(), code: None },
    )
    .unwrap();
    let science = create_subject_impl(
        &mut conn,
        NewSubjectInput { branch_id: DEMO_BRANCH_ID.to_string(), name: "Science".to_string(), code: None },
    )
    .unwrap();

    let exam = create_exam_impl(
        &mut conn,
        NewExamInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            academic_session_id,
            class_id,
            name: "Mid-Term".to_string(),
            exam_date: Some("2026-09-01".to_string()),
        },
    )
    .unwrap();

    save_marks_impl(
        &mut conn,
        SaveMarksInput {
            exam_id: exam.id.clone(),
            subject_id: math.id,
            entries: vec![SaveMarksEntry {
                student_id: student_id.clone(),
                max_marks: 100,
                marks_obtained: Some(85.0),
                is_absent: false,
            }],
        },
    )
    .unwrap();

    save_marks_impl(
        &mut conn,
        SaveMarksInput {
            exam_id: exam.id.clone(),
            subject_id: science.id,
            entries: vec![SaveMarksEntry {
                student_id: student_id.clone(),
                max_marks: 100,
                marks_obtained: None,
                is_absent: true,
            }],
        },
    )
    .unwrap();

    let report_card = get_report_card_impl(&conn, student_id, exam.id).expect("report card should build");

    assert_eq!(report_card.rows.len(), 2);
    assert_eq!(report_card.total_max, 200);
    // Only the Mathematics score counts toward total_obtained; Science was absent.
    assert_eq!(report_card.total_obtained, 85.0);
    assert_eq!(report_card.percentage, 42.5);
}
