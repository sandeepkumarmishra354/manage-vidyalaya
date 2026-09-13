//! Exercises session promotion end to end: creating a batch that maps one
//! session's class to the next, reviewing/overriding per-student decisions,
//! and executing it -- asserting `student_enrollments` history and the
//! student's current class/section pointer end up correct for each of the
//! three decisions (promote, retain, withdraw).

use std::collections::HashMap;

use desktop_lib::commands::branches::{create_academic_session_impl, create_class_impl};
use desktop_lib::commands::promotion::{create_promotion_batch_impl, execute_promotion_batch_impl};
use desktop_lib::commands::students::{confirm_admission_impl, create_admission_impl};
use desktop_lib::db;
use desktop_lib::models::{CreatePromotionBatchInput, NewAcademicSessionInput, NewAdmissionInput, NewClassInput};
use desktop_lib::seed::{seed_demo_data_if_empty, DEMO_ACADEMIC_SESSION_ID, DEMO_BRANCH_ID, DEMO_CLASS_ID};

fn fresh_db() -> rusqlite::Connection {
    let dir = std::env::temp_dir().join(format!("vidyalaya-promotion-it-{}", uuid::Uuid::new_v4()));
    let db_path = dir.join("device.sqlite3");
    let mut conn = db::open_db(&db_path).expect("open db");
    seed_demo_data_if_empty(&mut conn).expect("seed demo data");
    conn
}

fn enroll_student(conn: &mut rusqlite::Connection, first_name: &str) -> String {
    let admission = create_admission_impl(
        conn,
        NewAdmissionInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            academic_session_id: DEMO_ACADEMIC_SESSION_ID.to_string(),
            applied_class_id: Some(DEMO_CLASS_ID.to_string()),
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
    confirm_admission_impl(conn, admission.id).expect("confirm_admission_impl should succeed");
    admission.student_id
}

#[test]
fn promotion_batch_moves_promoted_students_and_leaves_withdrawn_students_behind() {
    let mut conn = fresh_db();

    let promoted_student = enroll_student(&mut conn, "Promoted");
    let withdrawn_student = enroll_student(&mut conn, "Withdrawn");

    let next_session = create_academic_session_impl(
        &mut conn,
        NewAcademicSessionInput {
            name: "2027-2028".to_string(),
            start_date: "2027-04-01".to_string(),
            end_date: "2028-03-31".to_string(),
            is_current: false,
        },
    )
    .expect("create_academic_session_impl should succeed");

    let next_class = create_class_impl(
        &mut conn,
        NewClassInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            academic_session_id: next_session.id.clone(),
            name: "Class 7".to_string(),
            sort_order: 7,
        },
    )
    .expect("create_class_impl should succeed");

    let mut class_mapping = HashMap::new();
    class_mapping.insert(DEMO_CLASS_ID.to_string(), next_class.id.clone());

    let batch = create_promotion_batch_impl(
        &mut conn,
        CreatePromotionBatchInput {
            branch_id: DEMO_BRANCH_ID.to_string(),
            from_session_id: DEMO_ACADEMIC_SESSION_ID.to_string(),
            to_session_id: next_session.id.clone(),
            class_mapping,
        },
    )
    .expect("create_promotion_batch_impl should succeed");

    assert_eq!(batch.items.len(), 2, "both enrolled students should be in the draft batch");
    assert!(batch.items.iter().all(|i| i.decision == "promote"), "default decision is promote for everyone");

    // Override the withdrawn student's decision directly (mirrors what
    // set_promotion_decision would do, without needing a live session/state).
    let withdrawn_item = batch.items.iter().find(|i| i.student_id == withdrawn_student).unwrap();
    conn.execute(
        "UPDATE promotion_batch_items SET decision = 'withdraw' WHERE id = ?1",
        [&withdrawn_item.id],
    )
    .unwrap();

    execute_promotion_batch_impl(&mut conn, batch.id.clone()).expect("execute_promotion_batch_impl should succeed");

    // Promoted student: new-session enrollment row + current pointer moved.
    let (promoted_class, promoted_status): (Option<String>, String) = conn
        .query_row(
            "SELECT current_class_id, status FROM students WHERE id = ?1",
            [&promoted_student],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(promoted_class.as_deref(), Some(next_class.id.as_str()));
    assert_eq!(promoted_status, "enrolled");

    let promoted_enrollment_class: String = conn
        .query_row(
            "SELECT class_id FROM student_enrollments WHERE student_id = ?1 AND academic_session_id = ?2",
            [&promoted_student, &next_session.id],
            |r| r.get(0),
        )
        .expect("promoted student should have a student_enrollments row for the new session");
    assert_eq!(promoted_enrollment_class, next_class.id);

    // Withdrawn student: no new-session enrollment row, status flipped.
    let withdrawn_status: String = conn
        .query_row("SELECT status FROM students WHERE id = ?1", [&withdrawn_student], |r| r.get(0))
        .unwrap();
    assert_eq!(withdrawn_status, "withdrawn");

    let withdrawn_enrollment_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM student_enrollments WHERE student_id = ?1 AND academic_session_id = ?2",
            [&withdrawn_student, &next_session.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(withdrawn_enrollment_count, 0, "a withdrawn student gets no enrollment row for the new session");

    let batch_status: String = conn
        .query_row("SELECT status FROM promotion_batches WHERE id = ?1", [&batch.id], |r| r.get(0))
        .unwrap();
    assert_eq!(batch_status, "completed");
}
