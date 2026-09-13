use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    AdjustPayslipLineItemInput, GeneratePayrollRunInput, Payslip, PayslipLineItem, PayrollRun,
    PayrollRunDetail, SalaryComponent, SalaryStructure, SetSalaryStructureInput,
};
use crate::state::{current_actor_user_id, current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn get_salary_structure(state: State<AppState>, staff_id: String) -> Result<Option<SalaryStructure>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.view")?;
    load_salary_structure(&conn, &staff_id)
}

fn load_salary_structure(conn: &rusqlite::Connection, staff_id: &str) -> Result<Option<SalaryStructure>, String> {
    let structure = conn
        .query_row(
            "SELECT id, staff_id, effective_from, basic_amount FROM salary_structures
             WHERE staff_id = ?1 AND deleted_at IS NULL ORDER BY effective_from DESC LIMIT 1",
            [staff_id],
            |row| {
                Ok(SalaryStructure {
                    id: row.get(0)?,
                    staff_id: row.get(1)?,
                    effective_from: row.get(2)?,
                    basic_amount: row.get(3)?,
                    components: Vec::new(),
                })
            },
        )
        .map(Some)
        .or_else(|e| if matches!(e, rusqlite::Error::QueryReturnedNoRows) { Ok(None) } else { Err(e.to_string()) })?;

    let Some(mut structure) = structure else { return Ok(None) };

    let mut stmt = conn
        .prepare(
            "SELECT id, component_name, component_type, calculation_type, amount, percent
             FROM salary_components WHERE salary_structure_id = ?1 AND deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let components = stmt
        .query_map([&structure.id], |row| {
            Ok(SalaryComponent {
                id: row.get(0)?,
                component_name: row.get(1)?,
                component_type: row.get(2)?,
                calculation_type: row.get(3)?,
                amount: row.get(4)?,
                percent: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    structure.components = components;

    Ok(Some(structure))
}

/// Replaces a staff member's salary structure wholesale: soft-deletes any
/// prior structure/components and inserts a fresh set. Simpler and safer to
/// reason about for a "salary structure editor" UI that always submits the
/// full set than diffing components one at a time.
#[tauri::command]
pub fn set_salary_structure(state: State<AppState>, input: SetSalaryStructureInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.generate")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let prior_ids: Vec<String> = {
        let mut stmt = tx
            .prepare("SELECT id FROM salary_structures WHERE staff_id = ?1 AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&input.staff_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    for prior_id in &prior_ids {
        tx.execute(
            "UPDATE salary_structures SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2",
            params![now, prior_id],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "salary_structures", prior_id, "delete").map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE salary_components SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE salary_structure_id = ?2",
            params![now, prior_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let structure_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO salary_structures (id, tenant_id, branch_id, staff_id, effective_from, basic_amount, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        params![structure_id, tenant_id, input.branch_id, input.staff_id, input.effective_from, input.basic_amount, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "salary_structures", &structure_id, "insert").map_err(|e| e.to_string())?;

    for component in &input.components {
        let component_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO salary_components (id, tenant_id, salary_structure_id, component_name, component_type, calculation_type, amount, percent, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
            params![
                component_id, tenant_id, structure_id, component.component_name, component.component_type,
                component.calculation_type, component.amount, component.percent, now,
            ],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "salary_components", &component_id, "insert").map_err(|e| e.to_string())?;
    }

    record_audit(&tx, &tenant_id, Some(&input.branch_id), "salary_structures", &structure_id, "create", "Set salary structure")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn component_amount(basic_amount: i64, component: &SalaryComponent) -> i64 {
    match component.calculation_type.as_str() {
        "percent_of_basic" => {
            let pct = component.percent.unwrap_or(0.0);
            ((basic_amount as f64) * pct / 100.0).round() as i64
        }
        _ => component.amount.unwrap_or(0),
    }
}

/// Generates one payroll run for a branch/month, with one payslip per active
/// staff member who has a salary structure. Loss-of-pay days are derived
/// from `staff_attendance` for the period (see the per-status accounting
/// note below) -- per the explicit scope decision, PF/ESI/Professional-Tax/
/// TDS are whatever the salary structure's deduction components say
/// (manually configured), not computed against government slabs.
#[tauri::command]
pub fn generate_payroll_run(state: State<AppState>, input: GeneratePayrollRunInput) -> Result<PayrollRunDetail, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.generate")?;
    generate_payroll_run_impl(&mut conn, input)
}

/// Core logic behind `generate_payroll_run`, factored out so it can be
/// exercised directly from integration tests against a plain
/// `rusqlite::Connection` (see commands::students::create_admission_impl for
/// the same pattern).
pub fn generate_payroll_run_impl(
    conn: &mut rusqlite::Connection,
    input: GeneratePayrollRunInput,
) -> Result<PayrollRunDetail, String> {
    let tenant_id = current_tenant_id(conn)?;
    let actor = current_actor_user_id(conn);
    let now = chrono::Utc::now().to_rfc3339();
    let run_id = uuid::Uuid::new_v4().to_string();

    let days_in_month = days_in_month(input.period_year, input.period_month)?;
    let period_prefix = format!("{:04}-{:02}", input.period_year, input.period_month);

    let staff_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM staff WHERE branch_id = ?1 AND status = 'active' AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&input.branch_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO payroll_runs (id, tenant_id, branch_id, period_month, period_year, status, generated_at, generated_by, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?6, 1)",
        params![run_id, tenant_id, input.branch_id, input.period_month, input.period_year, now, actor],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "payroll_runs", &run_id, "insert").map_err(|e| e.to_string())?;

    let mut payslips = Vec::new();

    for staff_id in &staff_ids {
        let Some(structure) = load_salary_structure(&tx, staff_id)? else {
            continue; // no salary structure configured -- nothing to pay out yet
        };

        // present: full paid day. half_day: half paid, half LOP. absent: full
        // LOP. leave/holiday: paid, not counted against attendance at all.
        // Days with no attendance record are assumed unmarked-but-worked
        // (not penalized) -- schools that want strict LOP for unmarked days
        // should mark every working day explicitly.
        let (present_rows, half_day_rows, absent_rows): (f64, f64, f64) = {
            let mut stmt = tx
                .prepare(
                    "SELECT
                        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END),
                        SUM(CASE WHEN status = 'half_day' THEN 1 ELSE 0 END),
                        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END)
                     FROM staff_attendance
                     WHERE staff_id = ?1 AND deleted_at IS NULL AND attendance_date LIKE ?2",
                )
                .map_err(|e| e.to_string())?;
            stmt.query_row(params![staff_id, format!("{period_prefix}%")], |row| {
                Ok((
                    row.get::<_, Option<f64>>(0)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                ))
            })
            .map_err(|e| e.to_string())?
        };

        let days_present = present_rows + half_day_rows * 0.5;
        let days_lop = absent_rows + half_day_rows * 0.5;

        let earning_components: i64 = structure
            .components
            .iter()
            .filter(|c| c.component_type == "earning")
            .map(|c| component_amount(structure.basic_amount, c))
            .sum();
        let deduction_components: i64 = structure
            .components
            .iter()
            .filter(|c| c.component_type == "deduction")
            .map(|c| component_amount(structure.basic_amount, c))
            .sum();

        let gross_before_lop = structure.basic_amount + earning_components;
        let lop_amount = if days_in_month > 0 {
            ((gross_before_lop as f64) / (days_in_month as f64) * days_lop).round() as i64
        } else {
            0
        };
        let gross_earnings = (gross_before_lop - lop_amount).max(0);
        let net_pay = (gross_earnings - deduction_components).max(0);

        let payslip_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO payslips (
                id, tenant_id, payroll_run_id, staff_id, days_in_month, days_present, days_lop,
                gross_earnings, total_deductions, net_pay, status, updated_at, version
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'draft',?11,1)",
            params![
                payslip_id, tenant_id, run_id, staff_id, days_in_month, days_present, days_lop,
                gross_earnings, deduction_components, net_pay, now,
            ],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "payslips", &payslip_id, "insert").map_err(|e| e.to_string())?;

        let mut line_items = Vec::new();
        let mut insert_line_item = |name: &str, ctype: &str, amount: i64, tx: &rusqlite::Transaction| -> Result<(), String> {
            let li_id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO payslip_line_items (id, tenant_id, payslip_id, component_name, component_type, amount, updated_at, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
                params![li_id, tenant_id, payslip_id, name, ctype, amount, now],
            )
            .map_err(|e| e.to_string())?;
            enqueue_outbox_from_row(tx, "payslip_line_items", &li_id, "insert").map_err(|e| e.to_string())?;
            line_items.push(PayslipLineItem { id: li_id, component_name: name.to_string(), component_type: ctype.to_string(), amount });
            Ok(())
        };

        insert_line_item("Basic", "earning", structure.basic_amount, &tx)?;
        for c in structure.components.iter().filter(|c| c.component_type == "earning") {
            insert_line_item(&c.component_name, "earning", component_amount(structure.basic_amount, c), &tx)?;
        }
        if lop_amount > 0 {
            insert_line_item("Loss of Pay", "deduction", lop_amount, &tx)?;
        }
        for c in structure.components.iter().filter(|c| c.component_type == "deduction") {
            insert_line_item(&c.component_name, "deduction", component_amount(structure.basic_amount, c), &tx)?;
        }

        let staff_name: String = tx
            .query_row(
                "SELECT first_name || ' ' || coalesce(last_name, '') FROM staff WHERE id = ?1",
                [staff_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        payslips.push(Payslip {
            id: payslip_id,
            payroll_run_id: run_id.clone(),
            staff_id: staff_id.clone(),
            staff_name,
            days_in_month,
            days_present,
            days_lop,
            gross_earnings,
            total_deductions: deduction_components,
            net_pay,
            status: "draft".to_string(),
            paid_on: None,
            line_items,
        });
    }

    record_audit(
        &tx,
        &tenant_id,
        Some(&input.branch_id),
        "payroll_runs",
        &run_id,
        "create",
        &format!("Generated payroll run for {}-{:02} ({} payslips)", input.period_year, input.period_month, payslips.len()),
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(PayrollRunDetail {
        run: PayrollRun {
            id: run_id,
            branch_id: input.branch_id,
            period_month: input.period_month,
            period_year: input.period_year,
            status: "draft".to_string(),
            generated_at: now,
        },
        payslips,
    })
}

fn days_in_month(year: i64, month: i64) -> Result<i64, String> {
    if !(1..=12).contains(&month) {
        return Err("month must be between 1 and 12".to_string());
    }
    let (next_year, next_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let first_of_this = chrono::NaiveDate::from_ymd_opt(year as i32, month as u32, 1)
        .ok_or_else(|| "invalid year/month".to_string())?;
    let first_of_next = chrono::NaiveDate::from_ymd_opt(next_year as i32, next_month as u32, 1)
        .ok_or_else(|| "invalid year/month".to_string())?;
    Ok((first_of_next - first_of_this).num_days())
}

#[tauri::command]
pub fn list_payroll_runs(state: State<AppState>, branch_id: String) -> Result<Vec<PayrollRun>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, period_month, period_year, status, generated_at
             FROM payroll_runs WHERE branch_id = ?1 AND deleted_at IS NULL
             ORDER BY period_year DESC, period_month DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(PayrollRun {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                period_month: row.get(2)?,
                period_year: row.get(3)?,
                status: row.get(4)?,
                generated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_payroll_run(state: State<AppState>, run_id: String) -> Result<PayrollRunDetail, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.view")?;

    let run = conn
        .query_row(
            "SELECT id, branch_id, period_month, period_year, status, generated_at FROM payroll_runs WHERE id = ?1",
            [&run_id],
            |row| {
                Ok(PayrollRun {
                    id: row.get(0)?,
                    branch_id: row.get(1)?,
                    period_month: row.get(2)?,
                    period_year: row.get(3)?,
                    status: row.get(4)?,
                    generated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut ps_stmt = conn
        .prepare(
            "SELECT p.id, p.staff_id, st.first_name || ' ' || coalesce(st.last_name, ''), p.days_in_month,
                    p.days_present, p.days_lop, p.gross_earnings, p.total_deductions, p.net_pay, p.status, p.paid_on
             FROM payslips p JOIN staff st ON st.id = p.staff_id
             WHERE p.payroll_run_id = ?1 AND p.deleted_at IS NULL ORDER BY st.first_name",
        )
        .map_err(|e| e.to_string())?;

    let mut payslips: Vec<Payslip> = ps_stmt
        .query_map([&run_id], |row| {
            Ok(Payslip {
                id: row.get(0)?,
                payroll_run_id: run_id.clone(),
                staff_id: row.get(1)?,
                staff_name: row.get(2)?,
                days_in_month: row.get(3)?,
                days_present: row.get(4)?,
                days_lop: row.get(5)?,
                gross_earnings: row.get(6)?,
                total_deductions: row.get(7)?,
                net_pay: row.get(8)?,
                status: row.get(9)?,
                paid_on: row.get(10)?,
                line_items: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for payslip in &mut payslips {
        let mut li_stmt = conn
            .prepare(
                "SELECT id, component_name, component_type, amount FROM payslip_line_items
                 WHERE payslip_id = ?1 AND deleted_at IS NULL",
            )
            .map_err(|e| e.to_string())?;
        payslip.line_items = li_stmt
            .query_map([&payslip.id], |row| {
                Ok(PayslipLineItem { id: row.get(0)?, component_name: row.get(1)?, component_type: row.get(2)?, amount: row.get(3)? })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    }

    Ok(PayrollRunDetail { run, payslips })
}

#[tauri::command]
pub fn finalize_payroll_run(state: State<AppState>, run_id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.finalize")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE payroll_runs SET status = 'finalized', updated_at = ?1, version = version + 1 WHERE id = ?2",
        params![now, run_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "payroll_runs", &run_id, "update").map_err(|e| e.to_string())?;

    let payslip_ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT id FROM payslips WHERE payroll_run_id = ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&run_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    for id in &payslip_ids {
        tx.execute(
            "UPDATE payslips SET status = 'finalized', updated_at = ?1, version = version + 1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "payslips", id, "update").map_err(|e| e.to_string())?;
    }

    record_audit(&tx, &tenant_id, None, "payroll_runs", &run_id, "update", "Finalized payroll run")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mark_payslip_paid(state: State<AppState>, payslip_id: String, paid_on: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.finalize")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE payslips SET status = 'paid', paid_on = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3",
        params![paid_on, now, payslip_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "payslips", &payslip_id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "payslips", &payslip_id, "update", "Marked payslip paid")
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Adds or updates a manual line item on a still-draft payslip (e.g. an
/// ad-hoc bonus or deduction), then recomputes the payslip's totals from the
/// full set of line items so gross/net stay consistent with what's shown.
#[tauri::command]
pub fn adjust_payslip_line_item(state: State<AppState>, input: AdjustPayslipLineItemInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "payroll.generate")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let status: String = conn
        .query_row("SELECT status FROM payslips WHERE id = ?1", [&input.payslip_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if status != "draft" {
        return Err("only draft payslips can be adjusted".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let existing_id: Option<String> = tx
        .query_row(
            "SELECT id FROM payslip_line_items WHERE payslip_id = ?1 AND component_name = ?2 AND deleted_at IS NULL",
            params![input.payslip_id, input.component_name],
            |row| row.get(0),
        )
        .ok();

    if let Some(li_id) = existing_id {
        tx.execute(
            "UPDATE payslip_line_items SET amount = ?1, component_type = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4",
            params![input.amount, input.component_type, now, li_id],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "payslip_line_items", &li_id, "update").map_err(|e| e.to_string())?;
    } else {
        let li_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO payslip_line_items (id, tenant_id, payslip_id, component_name, component_type, amount, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
            params![li_id, tenant_id, input.payslip_id, input.component_name, input.component_type, input.amount, now],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "payslip_line_items", &li_id, "insert").map_err(|e| e.to_string())?;
    }

    let (gross, deductions): (i64, i64) = {
        let mut stmt = tx
            .prepare("SELECT component_type, amount FROM payslip_line_items WHERE payslip_id = ?1 AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let items: Vec<(String, i64)> = stmt
            .query_map([&input.payslip_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let gross: i64 = items.iter().filter(|(t, _)| t == "earning").map(|(_, a)| a).sum();
        let deductions: i64 = items.iter().filter(|(t, _)| t == "deduction").map(|(_, a)| a).sum();
        (gross, deductions)
    };
    let net_pay = (gross - deductions).max(0);

    tx.execute(
        "UPDATE payslips SET gross_earnings = ?1, total_deductions = ?2, net_pay = ?3, updated_at = ?4, version = version + 1 WHERE id = ?5",
        params![gross, deductions, net_pay, now, input.payslip_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "payslips", &input.payslip_id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "payslips", &input.payslip_id, "update", &format!("Adjusted line item '{}'", input.component_name))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
