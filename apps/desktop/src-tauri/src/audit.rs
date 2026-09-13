use rusqlite::params;

use crate::state::current_actor_user_id;

/// Writes one row to the append-only `audit_log` table, inside the same
/// transaction as the mutation it describes (same "impossible to lose" shape
/// as `state::enqueue_outbox`). `audit_log` is itself a syncable table (see
/// `SYNCABLE_TABLES`), so the trail is visible across every device once
/// synced, not just the one that made the change.
pub fn record_audit(
    tx: &rusqlite::Transaction,
    tenant_id: &str,
    branch_id: Option<&str>,
    entity_table: &str,
    entity_id: &str,
    action: &str,
    summary: &str,
) -> rusqlite::Result<()> {
    let actor_user_id = current_actor_user_id(tx);

    tx.execute(
        "INSERT INTO audit_log (id, tenant_id, branch_id, actor_user_id, entity_table, entity_id, action, summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            uuid::Uuid::new_v4().to_string(),
            tenant_id,
            branch_id,
            actor_user_id,
            entity_table,
            entity_id,
            action,
            summary,
            chrono::Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}
