use rusqlite::Connection;

/// Fixed well-known ids shared with apps/cloud-api/prisma/seed.ts, so a local
/// dev install and a local dev cloud-api agree on the same tenant/branch and
/// can be used together to manually verify the sync engine end to end.
/// Production tenants are created with random UUIDs by the (future) school
/// signup/provisioning flow and pulled down on first login instead.
pub const DEMO_TENANT_ID: &str = "00000000-0000-0000-0000-000000000001";
pub const DEMO_BRANCH_ID: &str = "00000000-0000-0000-0000-000000000002";
/// Also fixed (rather than random) for the same reason. Classes/sections and
/// academic sessions aren't pushed through the sync engine yet (see plan doc:
/// only tenants/branches are cloud-relational in v1, everything else syncs
/// via the generic outbox/event-log). Fixing these ids means every locally
/// seeded install agrees on them regardless, so admissions created on one
/// device that reference them don't produce a dangling foreign key on
/// another device pulling those admissions down. Real per-school academic
/// structure provisioning (with real, distinct ids, pushed through the
/// outbox like everything else) is part of the Fees/Attendance/Exams
/// build-out, not this milestone.
pub const DEMO_ACADEMIC_SESSION_ID: &str = "00000000-0000-0000-0000-000000000003";
pub const DEMO_CLASS_ID: &str = "00000000-0000-0000-0000-000000000004";
pub const DEMO_SECTION_ID: &str = "00000000-0000-0000-0000-000000000005";

/// First-run bootstrap: creates a demo tenant/branch/academic session/class/section
/// so the app is usable immediately after install, before cloud provisioning exists.
/// In production this tenant/branch data instead arrives via the first sync pull
/// once the school signs up through the (not-yet-built) provisioning flow.
pub fn seed_demo_data_if_empty(conn: &Connection) -> anyhow::Result<()> {
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

    conn.execute(
        "INSERT INTO tenants (id, name, subscription_status, created_at, updated_at)
         VALUES (?1, ?2, 'trial', ?3, ?3)",
        rusqlite::params![tenant_id, "Demo Vidyalaya School", now],
    )?;

    conn.execute(
        "INSERT INTO branches (id, tenant_id, name, code, city, is_active, updated_at, version)
         VALUES (?1, ?2, 'Main Campus', 'MAIN', 'New Delhi', 1, ?3, 1)",
        rusqlite::params![branch_id, tenant_id, now],
    )?;

    conn.execute(
        "INSERT INTO academic_sessions (id, tenant_id, name, start_date, end_date, is_current, updated_at, version)
         VALUES (?1, ?2, '2026-2027', '2026-04-01', '2027-03-31', 1, ?3, 1)",
        rusqlite::params![session_id, tenant_id, now],
    )?;

    conn.execute(
        "INSERT INTO classes (id, tenant_id, branch_id, academic_session_id, name, sort_order, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, 'Class 6', 6, ?5, 1)",
        rusqlite::params![class_id, tenant_id, branch_id, session_id, now],
    )?;

    conn.execute(
        "INSERT INTO sections (id, tenant_id, class_id, name, updated_at, version)
         VALUES (?1, ?2, ?3, 'A', ?4, 1)",
        rusqlite::params![section_id, tenant_id, class_id, now],
    )?;

    Ok(())
}
