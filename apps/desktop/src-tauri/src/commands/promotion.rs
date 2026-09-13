use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    ClassMappingSuggestion, CreatePromotionBatchInput, PromotionBatch, PromotionBatchItem,
    SetPromotionDecisionInput,
};
use crate::state::{current_actor_user_id, current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

/// Suggests a target class for each source class by matching sort_order + 1
/// (i.e. "the next class up") rather than by name, since promotion moves a
/// student to a higher class, not the same-named one. Classes with no match
/// (typically the school's highest class, whose students graduate) come
/// back with `suggested_to_class_id: None` for the admin to resolve
/// manually (e.g. mark those students "withdraw" instead of "promote").
#[tauri::command]
pub fn suggest_class_mapping(
    state: State<AppState>,
    branch_id: String,
    from_session_id: String,
    to_session_id: String,
) -> Result<Vec<ClassMappingSuggestion>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "academic_setup.promote")?;

    let from_classes: Vec<(String, String, i64)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, sort_order FROM classes
                 WHERE branch_id = ?1 AND academic_session_id = ?2 AND deleted_at IS NULL ORDER BY sort_order",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![branch_id, from_session_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let to_classes: Vec<(String, i64)> = {
        let mut stmt = conn
            .prepare("SELECT id, sort_order FROM classes WHERE branch_id = ?1 AND academic_session_id = ?2 AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![branch_id, to_session_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(from_classes
        .into_iter()
        .map(|(from_class_id, from_class_name, sort_order)| {
            let suggested_to_class_id =
                to_classes.iter().find(|(_, s)| *s == sort_order + 1).map(|(id, _)| id.clone());
            ClassMappingSuggestion { from_class_id, from_class_name, suggested_to_class_id }
        })
        .collect())
}

fn load_batch_items(conn: &rusqlite::Connection, batch_id: &str) -> Result<Vec<PromotionBatchItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.student_id, s.first_name || ' ' || coalesce(s.last_name, ''),
                    fc.name, i.to_class_id, tc.name, i.to_section_id, i.decision
             FROM promotion_batch_items i
             JOIN students s ON s.id = i.student_id
             LEFT JOIN classes fc ON fc.id = i.from_class_id
             LEFT JOIN classes tc ON tc.id = i.to_class_id
             WHERE i.promotion_batch_id = ?1
             ORDER BY s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([batch_id], |row| {
            Ok(PromotionBatchItem {
                id: row.get(0)?,
                student_id: row.get(1)?,
                student_name: row.get(2)?,
                from_class_name: row.get(3)?,
                to_class_id: row.get(4)?,
                to_class_name: row.get(5)?,
                to_section_id: row.get(6)?,
                decision: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_promotion_batch(state: State<AppState>, input: CreatePromotionBatchInput) -> Result<PromotionBatch, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "academic_setup.promote")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let batch_id = uuid::Uuid::new_v4().to_string();

    let class_mapping_json = serde_json::to_string(&input.class_mapping).map_err(|e| e.to_string())?;
    let from_class_ids: Vec<String> = input.class_mapping.keys().cloned().collect();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO promotion_batches (id, tenant_id, branch_id, from_session_id, to_session_id, class_mapping_json, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7)",
        params![batch_id, tenant_id, input.branch_id, input.from_session_id, input.to_session_id, class_mapping_json, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "promotion_batches", &batch_id, "insert").map_err(|e| e.to_string())?;

    let placeholders = from_class_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT id, current_class_id, current_section_id FROM students
         WHERE branch_id = ? AND status = 'enrolled' AND deleted_at IS NULL AND current_class_id IN ({placeholders})"
    );
    let students: Vec<(String, Option<String>, Option<String>)> = {
        let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
        let mut bind_params: Vec<&dyn rusqlite::ToSql> = vec![&input.branch_id];
        bind_params.extend(from_class_ids.iter().map(|id| id as &dyn rusqlite::ToSql));
        let rows = stmt
            .query_map(bind_params.as_slice(), |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    for (student_id, from_class_id, from_section_id) in students {
        let to_class_id = from_class_id.as_ref().and_then(|c| input.class_mapping.get(c)).cloned();
        let item_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO promotion_batch_items (id, tenant_id, promotion_batch_id, student_id, from_class_id, from_section_id, to_class_id, to_section_id, decision)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 'promote')",
            params![item_id, tenant_id, batch_id, student_id, from_class_id, from_section_id, to_class_id],
        )
        .map_err(|e| e.to_string())?;
        enqueue_outbox_from_row(&tx, "promotion_batch_items", &item_id, "insert").map_err(|e| e.to_string())?;
    }

    record_audit(
        &tx,
        &tenant_id,
        Some(&input.branch_id),
        "promotion_batches",
        &batch_id,
        "create",
        "Created promotion batch (draft)",
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let items = load_batch_items(&conn, &batch_id)?;
    Ok(PromotionBatch {
        id: batch_id,
        branch_id: input.branch_id,
        from_session_id: input.from_session_id,
        to_session_id: input.to_session_id,
        status: "draft".to_string(),
        items,
    })
}

#[tauri::command]
pub fn get_promotion_batch(state: State<AppState>, batch_id: String) -> Result<PromotionBatch, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "academic_setup.promote")?;

    let (branch_id, from_session_id, to_session_id, status) = conn
        .query_row(
            "SELECT branch_id, from_session_id, to_session_id, status FROM promotion_batches WHERE id = ?1",
            [&batch_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let items = load_batch_items(&conn, &batch_id)?;
    Ok(PromotionBatch { id: batch_id, branch_id, from_session_id, to_session_id, status, items })
}

#[tauri::command]
pub fn set_promotion_decision(state: State<AppState>, input: SetPromotionDecisionInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "academic_setup.promote")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE promotion_batch_items SET decision = ?1, to_class_id = ?2, to_section_id = ?3 WHERE id = ?4",
        params![input.decision, input.to_class_id, input.to_section_id, input.batch_item_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "promotion_batch_items", &input.batch_item_id, "update").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Applies every item's decision transactionally: `promote` inserts a
/// `student_enrollments` row for the new session and moves the student's
/// current class/section pointer; `retain` inserts an enrollment row back
/// into the *same* class (repeating the year) and leaves the pointer as-is;
/// `withdraw` marks the student withdrawn and writes no new-session
/// enrollment row at all. One audit_log row covers the whole batch rather
/// than one per student, to keep the trail scannable.
#[tauri::command]
pub fn execute_promotion_batch(state: State<AppState>, batch_id: String) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "academic_setup.promote")?;
    let tenant_id = current_tenant_id(&conn)?;
    let actor = current_actor_user_id(&conn);
    let now = chrono::Utc::now().to_rfc3339();

    let (branch_id, to_session_id, status): (String, String, String) = conn
        .query_row(
            "SELECT branch_id, to_session_id, status FROM promotion_batches WHERE id = ?1",
            [&batch_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    if status == "completed" {
        return Err("promotion batch already executed".to_string());
    }

    let items: Vec<(String, String, Option<String>, Option<String>, Option<String>, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, student_id, from_section_id, to_class_id, to_section_id, decision
                 FROM promotion_batch_items WHERE promotion_batch_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&batch_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (_item_id, student_id, from_section_id, to_class_id, to_section_id, decision) in &items {
        match decision.as_str() {
            "promote" => {
                let Some(class_id) = to_class_id else { continue }; // no target class chosen -- skip, admin must resolve
                let enrollment_id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO student_enrollments (id, tenant_id, branch_id, student_id, academic_session_id, class_id, section_id, status, updated_at, version)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'promoted', ?8, 1)
                     ON CONFLICT(student_id, academic_session_id) DO UPDATE SET
                        class_id = excluded.class_id, section_id = excluded.section_id, status = excluded.status,
                        updated_at = excluded.updated_at, version = student_enrollments.version + 1",
                    params![enrollment_id, tenant_id, branch_id, student_id, to_session_id, class_id, to_section_id, now],
                )
                .map_err(|e| e.to_string())?;
                let row_id: String = tx
                    .query_row(
                        "SELECT id FROM student_enrollments WHERE student_id = ?1 AND academic_session_id = ?2",
                        params![student_id, to_session_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                enqueue_outbox_from_row(&tx, "student_enrollments", &row_id, "insert").map_err(|e| e.to_string())?;

                tx.execute(
                    "UPDATE students SET current_class_id = ?1, current_section_id = ?2, updated_at = ?3, version = version + 1 WHERE id = ?4",
                    params![class_id, to_section_id, now, student_id],
                )
                .map_err(|e| e.to_string())?;
                enqueue_outbox_from_row(&tx, "students", student_id, "update").map_err(|e| e.to_string())?;
            }
            "retain" => {
                let from_class_id: Option<String> = tx
                    .query_row("SELECT current_class_id FROM students WHERE id = ?1", [student_id], |row| row.get(0))
                    .map_err(|e| e.to_string())?;
                let Some(class_id) = from_class_id else { continue };
                let enrollment_id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO student_enrollments (id, tenant_id, branch_id, student_id, academic_session_id, class_id, section_id, status, updated_at, version)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'retained', ?8, 1)
                     ON CONFLICT(student_id, academic_session_id) DO UPDATE SET
                        class_id = excluded.class_id, section_id = excluded.section_id, status = excluded.status,
                        updated_at = excluded.updated_at, version = student_enrollments.version + 1",
                    params![enrollment_id, tenant_id, branch_id, student_id, to_session_id, class_id, from_section_id, now],
                )
                .map_err(|e| e.to_string())?;
                let row_id: String = tx
                    .query_row(
                        "SELECT id FROM student_enrollments WHERE student_id = ?1 AND academic_session_id = ?2",
                        params![student_id, to_session_id],
                        |row| row.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                enqueue_outbox_from_row(&tx, "student_enrollments", &row_id, "insert").map_err(|e| e.to_string())?;
            }
            "withdraw" => {
                tx.execute(
                    "UPDATE students SET status = 'withdrawn', updated_at = ?1, version = version + 1 WHERE id = ?2",
                    params![now, student_id],
                )
                .map_err(|e| e.to_string())?;
                enqueue_outbox_from_row(&tx, "students", student_id, "update").map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }

    tx.execute(
        "UPDATE promotion_batches SET status = 'completed', executed_at = ?1, executed_by = ?2 WHERE id = ?3",
        params![now, actor, batch_id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "promotion_batches", &batch_id, "update").map_err(|e| e.to_string())?;

    record_audit(
        &tx,
        &tenant_id,
        Some(&branch_id),
        "promotion_batches",
        &batch_id,
        "update",
        &format!("Executed promotion batch ({} students)", items.len()),
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
