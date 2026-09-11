use std::path::PathBuf;

use rusqlite::Connection;

const CORE_SCHEMA: &str = include_str!("../../../../packages/db-schema/migrations/0001_core.sql");
const ATTENDANCE_SCHEMA: &str =
    include_str!("../../../../packages/db-schema/migrations/0002_attendance.sql");
const FEES_SCHEMA: &str = include_str!("../../../../packages/db-schema/migrations/0003_fees.sql");
const EXAMS_SCHEMA: &str = include_str!("../../../../packages/db-schema/migrations/0004_exams.sql");
const MODULE_SETTINGS_SCHEMA: &str =
    include_str!("../../../../packages/db-schema/migrations/0005_module_settings.sql");
const HOUSES_SCHEMA: &str = include_str!("../../../../packages/db-schema/migrations/0006_houses.sql");
const LIBRARY_SCHEMA: &str = include_str!("../../../../packages/db-schema/migrations/0007_library.sql");
const TRANSPORT_SCHEMA: &str =
    include_str!("../../../../packages/db-schema/migrations/0008_transport.sql");
const LOCAL_APP_SETTINGS_SCHEMA: &str = include_str!("../migrations/local_0001_app_settings.sql");

/// Opens (creating if needed) the local SQLite database and applies migrations.
/// WAL mode is used so the sync background task can read while the UI writes.
pub fn open_db(db_path: &PathBuf) -> anyhow::Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    run_migrations(&conn)?;

    Ok(conn)
}

fn run_migrations(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )",
    )?;

    // Shared schema (packages/db-schema/migrations) -- applied in order, must
    // match what apps/cloud-api/prisma/schema.prisma models on the server
    // side for the tables that need to be queryable there too.
    apply_if_pending(conn, "0001_core", CORE_SCHEMA)?;
    apply_if_pending(conn, "0002_attendance", ATTENDANCE_SCHEMA)?;
    apply_if_pending(conn, "0003_fees", FEES_SCHEMA)?;
    apply_if_pending(conn, "0004_exams", EXAMS_SCHEMA)?;
    apply_if_pending(conn, "0005_module_settings", MODULE_SETTINGS_SCHEMA)?;
    apply_if_pending(conn, "0006_houses", HOUSES_SCHEMA)?;
    apply_if_pending(conn, "0007_library", LIBRARY_SCHEMA)?;
    apply_if_pending(conn, "0008_transport", TRANSPORT_SCHEMA)?;

    // Local-only (desktop-specific, never synced) schema.
    apply_if_pending(conn, "local_0001_app_settings", LOCAL_APP_SETTINGS_SCHEMA)?;

    Ok(())
}

fn apply_if_pending(conn: &Connection, name: &str, sql: &str) -> anyhow::Result<()> {
    let already_applied: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = ?1)",
        [name],
        |row| row.get(0),
    )?;

    if already_applied {
        return Ok(());
    }

    conn.execute_batch(sql)?;
    conn.execute(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?1, ?2)",
        rusqlite::params![name, chrono::Utc::now().to_rfc3339()],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_apply_cleanly_and_are_idempotent() {
        let dir = std::env::temp_dir().join(format!("vidyalaya-test-{}", uuid::Uuid::new_v4()));
        let db_path = dir.join("test.sqlite3");

        let conn = open_db(&db_path).expect("first open should apply migrations");
        // Re-opening (simulating app restart) must not error on already-applied migrations.
        drop(conn);
        let conn2 = open_db(&db_path).expect("second open should be a no-op migration-wise");

        for table in [
            "students",
            "attendance_records",
            "fee_invoices",
            "exam_marks",
            "module_settings",
            "houses",
            "house_point_events",
            "library_books",
            "library_issues",
            "transport_routes",
            "student_transport",
        ] {
            let table_count: i64 = conn2
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(table_count, 1, "expected table {table} to exist");
        }

        std::fs::remove_dir_all(&dir).ok();
    }
}
