//! Exercises `state::require_permission` (the enforcement check every
//! sensitive command calls) against a real local SQLite database seeded
//! with the default roles/permissions (see seed::seed_demo_data_if_empty),
//! simulating a logged-in session the same way `commands::auth::login`
//! caches one (an `app_settings` "user" row with an `id` and `roles` array).

use desktop_lib::db;
use desktop_lib::seed::seed_demo_data_if_empty;
use desktop_lib::state::require_permission;

fn fresh_db() -> rusqlite::Connection {
    let dir = std::env::temp_dir().join(format!("vidyalaya-rbac-it-{}", uuid::Uuid::new_v4()));
    let db_path = dir.join("device.sqlite3");
    let mut conn = db::open_db(&db_path).expect("open db");
    seed_demo_data_if_empty(&mut conn).expect("seed demo data");
    conn
}

fn cache_session_with_roles(conn: &rusqlite::Connection, roles: &[&str]) {
    let user_json = serde_json::json!({
        "id": "test-user",
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "full_name": "Test User",
        "email": "test@example.com",
        "roles": roles,
    });
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('user', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [user_json.to_string()],
    )
    .unwrap();
}

#[test]
fn no_session_is_denied_every_permission() {
    let conn = fresh_db();
    let result = require_permission(&conn, "students.view");
    assert!(result.is_err(), "a command with no cached session should be denied");
}

#[test]
fn super_admin_role_has_every_seeded_permission() {
    let conn = fresh_db();
    cache_session_with_roles(&conn, &["super_admin"]);

    for key in [
        "students.view", "students.edit", "staff.manage", "payroll.generate",
        "roles.manage", "users.manage", "audit.view", "academic_setup.promote",
    ] {
        assert!(
            require_permission(&conn, key).is_ok(),
            "super_admin should be granted '{key}'"
        );
    }
}

#[test]
fn teacher_role_is_scoped_to_its_seeded_permissions() {
    let conn = fresh_db();
    cache_session_with_roles(&conn, &["teacher"]);

    assert!(require_permission(&conn, "attendance.mark").is_ok(), "teacher can mark attendance");
    assert!(require_permission(&conn, "exams.enter_marks").is_ok(), "teacher can enter marks");

    assert!(
        require_permission(&conn, "roles.manage").is_err(),
        "teacher must not be able to manage roles"
    );
    assert!(
        require_permission(&conn, "payroll.generate").is_err(),
        "teacher must not be able to generate payroll"
    );
}

#[test]
fn a_role_with_no_permission_grant_is_denied() {
    let conn = fresh_db();
    cache_session_with_roles(&conn, &["front_desk"]);

    assert!(
        require_permission(&conn, "staff.manage").is_err(),
        "front_desk was not granted staff.manage in the seeded default set"
    );
}
