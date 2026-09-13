use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    FeeInvoiceListItem, FeePayment, FeeStructure, NewFeeStructureInput, RecordPaymentInput,
    ReversePaymentInput, StudentFeeSummary, UpdateFeeStructureInput, VoidInvoiceInput,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn create_fee_structure(
    state: State<AppState>,
    input: NewFeeStructureInput,
) -> Result<FeeStructure, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.manage")?;
    create_fee_structure_impl(&mut conn, input)
}

#[tauri::command]
pub fn update_fee_structure(state: State<AppState>, input: UpdateFeeStructureInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE fee_structures SET name = ?1, amount = ?2, frequency = ?3, updated_at = ?4, version = version + 1 WHERE id = ?5",
        params![input.name, input.amount, input.frequency, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_structures", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "fee_structures", &input.id, "update", &format!("Updated fee structure '{}'", input.name))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_fee_structure_impl(
    conn: &mut rusqlite::Connection,
    input: NewFeeStructureInput,
) -> Result<FeeStructure, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO fee_structures (
            id, tenant_id, branch_id, academic_session_id, class_id, name, amount, frequency, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
        params![
            id,
            tenant_id,
            input.branch_id,
            input.academic_session_id,
            input.class_id,
            input.name,
            input.amount,
            input.frequency,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    enqueue_outbox_from_row(&tx, "fee_structures", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(FeeStructure {
        id,
        branch_id: input.branch_id,
        academic_session_id: input.academic_session_id,
        class_id: input.class_id,
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
    })
}

#[tauri::command]
pub fn list_fee_structures(state: State<AppState>, branch_id: String) -> Result<Vec<FeeStructure>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, academic_session_id, class_id, name, amount, frequency
             FROM fee_structures WHERE branch_id = ?1 AND deleted_at IS NULL ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(FeeStructure {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                academic_session_id: row.get(2)?,
                class_id: row.get(3)?,
                name: row.get(4)?,
                amount: row.get(5)?,
                frequency: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Creates one invoice per student covered by the fee structure (its class,
/// or every class in the branch if the structure has no class_id), skipping
/// students who already have an invoice for it. Returns how many were created.
#[tauri::command]
pub fn generate_invoices(state: State<AppState>, fee_structure_id: String) -> Result<i64, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.manage")?;
    generate_invoices_impl(&mut conn, fee_structure_id)
}

/// Voids an invoice with a required reason (e.g. issued in error, waived by
/// policy) rather than deleting it outright -- the invoice stays visible
/// with a `voided` status so the audit trail and any already-recorded
/// payments against it remain intact.
#[tauri::command]
pub fn void_invoice(state: State<AppState>, input: VoidInvoiceInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE fee_invoices SET status = 'voided', updated_at = ?1, version = version + 1 WHERE id = ?2",
        params![now, input.invoice_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_invoices", &input.invoice_id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "fee_invoices", &input.invoice_id, "update", &format!("Voided invoice: {}", input.reason))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn generate_invoices_impl(conn: &mut rusqlite::Connection, fee_structure_id: String) -> Result<i64, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let (branch_id, academic_session_id, class_id, amount): (String, String, Option<String>, i64) = conn
        .query_row(
            "SELECT branch_id, academic_session_id, class_id, amount FROM fee_structures WHERE id = ?1",
            [&fee_structure_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("fee structure not found: {e}"))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let student_ids: Vec<String> = {
        let mut stmt = tx
            .prepare(
                "SELECT id FROM students
                 WHERE branch_id = ?1 AND deleted_at IS NULL AND status = 'enrolled'
                   AND (?2 IS NULL OR current_class_id = ?2)",
            )
            .map_err(|e| e.to_string())?;
        let ids = stmt
            .query_map(params![branch_id, class_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        ids
    };

    let mut created = 0i64;
    for student_id in student_ids {
        let already_invoiced: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM fee_invoices WHERE student_id = ?1 AND fee_structure_id = ?2)",
                params![student_id, fee_structure_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if already_invoiced {
            continue;
        }

        let invoice_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO fee_invoices (
                id, tenant_id, branch_id, student_id, fee_structure_id, academic_session_id,
                amount_due, amount_paid, status, updated_at, version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 'pending', ?8, 1)",
            params![
                invoice_id,
                tenant_id,
                branch_id,
                student_id,
                fee_structure_id,
                academic_session_id,
                amount,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        enqueue_outbox_from_row(&tx, "fee_invoices", &invoice_id, "insert").map_err(|e| e.to_string())?;
        created += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(created)
}

#[tauri::command]
pub fn list_invoices(
    state: State<AppState>,
    branch_id: String,
    status: Option<String>,
) -> Result<Vec<FeeInvoiceListItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.student_id, s.first_name || ' ' || coalesce(s.last_name, ''), fs.name,
                    i.amount_due, i.amount_paid, i.due_date, i.status
             FROM fee_invoices i
             JOIN students s ON s.id = i.student_id
             JOIN fee_structures fs ON fs.id = i.fee_structure_id
             WHERE i.branch_id = ?1 AND i.deleted_at IS NULL
               AND (?2 IS NULL OR i.status = ?2)
             ORDER BY i.due_date IS NULL, i.due_date, s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![branch_id, status], |row| {
            Ok(FeeInvoiceListItem {
                id: row.get(0)?,
                student_id: row.get(1)?,
                student_name: row.get(2)?,
                fee_structure_name: row.get(3)?,
                amount_due: row.get(4)?,
                amount_paid: row.get(5)?,
                due_date: row.get(6)?,
                status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_student_fee_summary(state: State<AppState>, student_id: String) -> Result<StudentFeeSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.view")?;

    let mut inv_stmt = conn
        .prepare(
            "SELECT i.id, i.student_id, s.first_name || ' ' || coalesce(s.last_name, ''), fs.name,
                    i.amount_due, i.amount_paid, i.due_date, i.status
             FROM fee_invoices i
             JOIN students s ON s.id = i.student_id
             JOIN fee_structures fs ON fs.id = i.fee_structure_id
             WHERE i.student_id = ?1 AND i.deleted_at IS NULL
             ORDER BY i.due_date IS NULL, i.due_date",
        )
        .map_err(|e| e.to_string())?;

    let invoices: Vec<FeeInvoiceListItem> = inv_stmt
        .query_map([&student_id], |row| {
            Ok(FeeInvoiceListItem {
                id: row.get(0)?,
                student_id: row.get(1)?,
                student_name: row.get(2)?,
                fee_structure_name: row.get(3)?,
                amount_due: row.get(4)?,
                amount_paid: row.get(5)?,
                due_date: row.get(6)?,
                status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut pay_stmt = conn
        .prepare(
            "SELECT p.id, p.invoice_id, p.amount, p.payment_method, p.payment_date, p.receipt_number
             FROM fee_payments p
             JOIN fee_invoices i ON i.id = p.invoice_id
             WHERE i.student_id = ?1 AND p.deleted_at IS NULL
             ORDER BY p.payment_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let payments: Vec<FeePayment> = pay_stmt
        .query_map([&student_id], |row| {
            Ok(FeePayment {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                amount: row.get(2)?,
                payment_method: row.get(3)?,
                payment_date: row.get(4)?,
                receipt_number: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let total_due: i64 = invoices.iter().map(|i| i.amount_due).sum();
    let total_paid: i64 = invoices.iter().map(|i| i.amount_paid).sum();

    Ok(StudentFeeSummary { invoices, payments, total_due, total_paid })
}

/// Records a payment against an invoice and updates the invoice's
/// amount_paid/status accordingly, in one transaction.
#[tauri::command]
pub fn record_payment(state: State<AppState>, input: RecordPaymentInput) -> Result<FeePayment, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.record_payment")?;
    record_payment_impl(&mut conn, input)
}

/// Reverses a payment by inserting a negative-amount `fee_payments` row
/// (rather than deleting the original) and recomputing the invoice's
/// amount_paid/status -- keeps the full payment history/audit trail intact
/// instead of erasing a mistaken or bounced payment.
#[tauri::command]
pub fn reverse_payment(state: State<AppState>, input: ReversePaymentInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "fees.record_payment")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let (invoice_id, amount, payment_method): (String, i64, String) = conn
        .query_row(
            "SELECT invoice_id, amount, payment_method FROM fee_payments WHERE id = ?1 AND deleted_at IS NULL",
            [&input.payment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("payment not found: {e}"))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let reversal_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO fee_payments (id, tenant_id, invoice_id, amount, payment_method, payment_date, remarks, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)",
        params![reversal_id, tenant_id, invoice_id, -amount, payment_method, now, format!("Reversal: {}", input.reason), now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_payments", &reversal_id, "insert").map_err(|e| e.to_string())?;

    let (amount_due, amount_paid): (i64, i64) = tx
        .query_row("SELECT amount_due, amount_paid FROM fee_invoices WHERE id = ?1", [&invoice_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?;
    let new_paid = amount_paid - amount;
    let new_status = if new_paid >= amount_due { "paid" } else if new_paid > 0 { "partial" } else { "pending" };

    tx.execute(
        "UPDATE fee_invoices SET amount_paid = ?1, status = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4",
        params![new_paid, new_status, now, invoice_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_invoices", &invoice_id, "update").map_err(|e| e.to_string())?;

    record_audit(&tx, &tenant_id, None, "fee_payments", &input.payment_id, "update", &format!("Reversed payment: {}", input.reason))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_payment_impl(
    conn: &mut rusqlite::Connection,
    input: RecordPaymentInput,
) -> Result<FeePayment, String> {
    let tenant_id = current_tenant_id(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let payment_id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO fee_payments (
            id, tenant_id, invoice_id, amount, payment_method, payment_date, receipt_number, remarks, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
        params![
            payment_id,
            tenant_id,
            input.invoice_id,
            input.amount,
            input.payment_method,
            input.payment_date,
            input.receipt_number,
            input.remarks,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_payments", &payment_id, "insert").map_err(|e| e.to_string())?;

    let (amount_due, amount_paid): (i64, i64) = tx
        .query_row(
            "SELECT amount_due, amount_paid FROM fee_invoices WHERE id = ?1",
            [&input.invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let new_paid = amount_paid + input.amount;
    let new_status = if new_paid >= amount_due {
        "paid"
    } else if new_paid > 0 {
        "partial"
    } else {
        "pending"
    };

    tx.execute(
        "UPDATE fee_invoices SET amount_paid = ?1, status = ?2, updated_at = ?3, version = version + 1
         WHERE id = ?4",
        params![new_paid, new_status, now, input.invoice_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "fee_invoices", &input.invoice_id, "update").map_err(|e| e.to_string())?;

    record_audit(&tx, &tenant_id, None, "fee_payments", &payment_id, "create", &format!("Recorded payment of {} paise", input.amount))
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(FeePayment {
        id: payment_id,
        invoice_id: input.invoice_id,
        amount: input.amount,
        payment_method: input.payment_method,
        payment_date: input.payment_date,
        receipt_number: input.receipt_number,
    })
}
