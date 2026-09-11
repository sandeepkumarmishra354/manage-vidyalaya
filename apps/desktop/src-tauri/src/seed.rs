use rusqlite::Connection;

use crate::state::enqueue_outbox_from_row;

/// Fixed well-known ids shared with apps/cloud-api/prisma/seed.ts, so a local
/// dev install and a local dev cloud-api agree on the same tenant/branch and
/// can be used together to manually verify the sync engine end to end.
/// Production tenants are created with random UUIDs by the (future) school
/// signup/provisioning flow and pulled down on first login instead.
///
/// These stay fixed (rather than random) deliberately, for a second reason
/// beyond matching the cloud-api seed: `seed_demo_data_if_empty` runs
/// independently on every device's first launch, before that device has
/// ever logged in or synced. If each device generated its own random ids
/// for "Main Campus" / the default class / section, two devices for the
/// same (real, future) school would each push their own copy through the
/// outbox and the tenant would end up with duplicate branches. Fixed ids
/// mean every device's bootstrap produces byte-identical rows, so no
/// duplication happens even without a real provisioning flow yet. Once
/// that flow exists (see docs/production-readiness.md), a device's first
/// run should pull its tenant's real branch/academic structure from the
/// server on login instead of self-seeding at all, and this function
/// becomes a pure offline-demo/dev convenience rather than something a real
/// deployment relies on.
pub const DEMO_TENANT_ID: &str = "00000000-0000-0000-0000-000000000001";
pub const DEMO_BRANCH_ID: &str = "00000000-0000-0000-0000-000000000002";
pub const DEMO_ACADEMIC_SESSION_ID: &str = "00000000-0000-0000-0000-000000000003";
pub const DEMO_CLASS_ID: &str = "00000000-0000-0000-0000-000000000004";
pub const DEMO_SECTION_ID: &str = "00000000-0000-0000-0000-000000000005";

/// First-run bootstrap: creates a demo tenant/branch/academic session/class/
/// section so the app is usable immediately after install, before cloud
/// provisioning exists.
///
/// Every row below the tenant (which is deliberately local-only -- see
/// SYNCABLE_TABLES) is written the same way a real command's mutation is:
/// inside a transaction, with a matching `sync_outbox` entry. Previously
/// only the tenant/branch rows were seeded this way; academic sessions,
/// classes, and sections were inserted with no outbox entry at all, so they
/// silently never reached the cloud or a second device. That's what this
/// function fixes -- combined with `create_academic_session`/`create_class`/
/// `create_section` (apps/desktop/src-tauri/src/commands/branches.rs) now
/// existing at all, so a school can add more than the one seeded class.
pub fn seed_demo_data_if_empty(conn: &mut Connection) -> anyhow::Result<()> {
    let tenant_count: i64 = conn.query_row("SELECT COUNT(*) FROM tenants", [], |r| r.get(0))?;
    if tenant_count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let tenant_id = DEMO_TENANT_ID.to_string();
    let branch_id = DEMO_BRANCH_ID.to_string();
    let session_id = DEMO_ACADEMIC_SESSION_ID.to_string();
    let class_id = DEMO_CLASS_ID.to_string();
    let section_id = DEMO_SECTION_ID.to_string();

    // Tenants aren't synced through the outbox (see packages/db-schema
    // design note / SYNCABLE_TABLES) -- tenant provisioning is a cloud-side
    // concern. This local row exists purely so the desktop app is usable
    // offline before that provisioning flow exists.
    conn.execute(
        "INSERT INTO tenants (id, name, subscription_status, created_at, updated_at)
         VALUES (?1, ?2, 'trial', ?3, ?3)",
        rusqlite::params![tenant_id, "Demo Vidyalaya School", now],
    )?;

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO branches (id, tenant_id, name, code, city, is_active, updated_at, version)
         VALUES (?1, ?2, 'Main Campus', 'MAIN', 'New Delhi', 1, ?3, 1)",
        rusqlite::params![branch_id, tenant_id, now],
    )?;
    enqueue_outbox_from_row(&tx, "branches", &branch_id, "insert")?;

    tx.execute(
        "INSERT INTO academic_sessions (id, tenant_id, name, start_date, end_date, is_current, updated_at, version)
         VALUES (?1, ?2, '2026-2027', '2026-04-01', '2027-03-31', 1, ?3, 1)",
        rusqlite::params![session_id, tenant_id, now],
    )?;
    enqueue_outbox_from_row(&tx, "academic_sessions", &session_id, "insert")?;

    tx.execute(
        "INSERT INTO classes (id, tenant_id, branch_id, academic_session_id, name, sort_order, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, 'Class 6', 6, ?5, 1)",
        rusqlite::params![class_id, tenant_id, branch_id, session_id, now],
    )?;
    enqueue_outbox_from_row(&tx, "classes", &class_id, "insert")?;

    tx.execute(
        "INSERT INTO sections (id, tenant_id, class_id, name, updated_at, version)
         VALUES (?1, ?2, ?3, 'A', ?4, 1)",
        rusqlite::params![section_id, tenant_id, class_id, now],
    )?;
    enqueue_outbox_from_row(&tx, "sections", &section_id, "insert")?;

    tx.commit()?;

    Ok(())
}
