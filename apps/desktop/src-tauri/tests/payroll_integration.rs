//! Exercises payroll generation end to end against a real local SQLite
//! database: a staff member with a salary structure (fixed basic + one
//! fixed earning + one percent-of-basic deduction) and a month of
//! attendance records, asserting the loss-of-pay and net-pay math computed
//! by `generate_payroll_run_impl` matches hand-calculated expectations.

use rusqlite::params;

use desktop_lib::commands::payroll::generate_payroll_run_impl;
use desktop_lib::db;
use desktop_lib::models::GeneratePayrollRunInput;
use desktop_lib::seed::{seed_demo_data_if_empty, DEMO_BRANCH_ID, DEMO_TENANT_ID};

fn fresh_db() -> rusqlite::Connection {
    let dir = std::env::temp_dir().join(format!("vidyalaya-payroll-it-{}", uuid::Uuid::new_v4()));
    let db_path = dir.join("device.sqlite3");
    let mut conn = db::open_db(&db_path).expect("open db");
    seed_demo_data_if_empty(&mut conn).expect("seed demo data");
    conn
}

fn create_staff(conn: &rusqlite::Connection, employee_code: &str) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO staff (id, tenant_id, branch_id, employee_code, first_name, designation, employment_type, date_of_joining, status, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, 'Test', 'Teacher', 'full_time', '2020-01-01', 'active', ?5, 1)",
        params![id, DEMO_TENANT_ID, DEMO_BRANCH_ID, employee_code, now],
    )
    .unwrap();
    id
}

/// basic = Rs 30,000; HRA = Rs 5,000 fixed earning; PF = 12% of basic deduction.
fn create_salary_structure(conn: &rusqlite::Connection, staff_id: &str) {
    let structure_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO salary_structures (id, tenant_id, branch_id, staff_id, effective_from, basic_amount, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, '2020-01-01', 3000000, ?5, 1)",
        params![structure_id, DEMO_TENANT_ID, DEMO_BRANCH_ID, staff_id, now],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO salary_components (id, tenant_id, salary_structure_id, component_name, component_type, calculation_type, amount, percent, updated_at, version)
         VALUES (?1, ?2, ?3, 'HRA', 'earning', 'fixed', 500000, NULL, ?4, 1)",
        params![uuid::Uuid::new_v4().to_string(), DEMO_TENANT_ID, structure_id, now],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO salary_components (id, tenant_id, salary_structure_id, component_name, component_type, calculation_type, amount, percent, updated_at, version)
         VALUES (?1, ?2, ?3, 'PF', 'deduction', 'percent_of_basic', NULL, 12.0, ?4, 1)",
        params![uuid::Uuid::new_v4().to_string(), DEMO_TENANT_ID, structure_id, now],
    )
    .unwrap();
}

fn mark_attendance(conn: &rusqlite::Connection, staff_id: &str, date: &str, status: &str) {
    conn.execute(
        "INSERT INTO staff_attendance (id, tenant_id, branch_id, staff_id, attendance_date, status, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        params![
            uuid::Uuid::new_v4().to_string(),
            DEMO_TENANT_ID,
            DEMO_BRANCH_ID,
            staff_id,
            date,
            status,
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .unwrap();
}

#[test]
fn generate_payroll_run_computes_loss_of_pay_and_net_pay_correctly() {
    let mut conn = fresh_db();
    let staff_id = create_staff(&conn, "EMP-001");
    create_salary_structure(&conn, &staff_id);

    // April 2026 has 30 days. 25 present, 3 absent, 2 half-day.
    for day in 1..=25 {
        mark_attendance(&conn, &staff_id, &format!("2026-04-{day:02}"), "present");
    }
    for day in 26..=28 {
        mark_attendance(&conn, &staff_id, &format!("2026-04-{day:02}"), "absent");
    }
    for day in 29..=30 {
        mark_attendance(&conn, &staff_id, &format!("2026-04-{day:02}"), "half_day");
    }

    let detail = generate_payroll_run_impl(
        &mut conn,
        GeneratePayrollRunInput { branch_id: DEMO_BRANCH_ID.to_string(), period_month: 4, period_year: 2026 },
    )
    .expect("generate_payroll_run_impl should succeed");

    assert_eq!(detail.payslips.len(), 1, "one payslip for the one staff member with a salary structure");
    let payslip = &detail.payslips[0];

    assert_eq!(payslip.days_in_month, 30);
    assert_eq!(payslip.days_present, 26.0, "25 full present days + 2 half days");
    assert_eq!(payslip.days_lop, 4.0, "3 absent days + 2 half days");

    // gross_before_lop = 3,000,000 (basic) + 500,000 (HRA) = 3,500,000
    // lop_amount = round(3,500,000 / 30 * 4) = 466,667
    // gross_earnings = 3,500,000 - 466,667 = 3,033,333
    assert_eq!(payslip.gross_earnings, 3_033_333);

    // PF = 12% of basic (3,000,000) = 360,000 -- not reduced by LOP.
    assert_eq!(payslip.total_deductions, 360_000);

    assert_eq!(payslip.net_pay, 3_033_333 - 360_000);

    let lop_line = payslip.line_items.iter().find(|li| li.component_name == "Loss of Pay");
    assert!(lop_line.is_some(), "a Loss of Pay deduction line item should be recorded for transparency");
    assert_eq!(lop_line.unwrap().amount, 466_667);
}

#[test]
fn generate_payroll_run_skips_staff_without_a_salary_structure() {
    let mut conn = fresh_db();
    create_staff(&conn, "EMP-002"); // no salary structure configured

    let detail = generate_payroll_run_impl(
        &mut conn,
        GeneratePayrollRunInput { branch_id: DEMO_BRANCH_ID.to_string(), period_month: 5, period_year: 2026 },
    )
    .expect("generate_payroll_run_impl should succeed even with nothing payable");

    assert_eq!(detail.payslips.len(), 0);
}
