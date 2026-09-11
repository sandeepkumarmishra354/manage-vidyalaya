//! End-to-end sync verification: two independent local SQLite databases
//! ("device A" and "device B") both talking to a real running cloud-api,
//! proving that a record created offline on one device reaches the other
//! purely through the sync engine (push from A, pull into B).
//!
//! Requires a live cloud-api at VIDYALAYA_CLOUD_API_URL (default
//! http://localhost:3001) seeded via `pnpm --filter @vidyalaya/cloud-api
//! prisma:seed`. Not run by default `cargo test` since it depends on that
//! external process; run explicitly with:
//!   cargo test --test sync_integration -- --ignored --nocapture

use desktop_lib::commands::branches::create_class_impl;
use desktop_lib::commands::students::create_admission_impl;
use desktop_lib::models::{NewAdmissionInput, NewClassInput};
use desktop_lib::seed::{seed_demo_data_if_empty, DEMO_BRANCH_ID, DEMO_TENANT_ID};
use desktop_lib::state::AppState;
use desktop_lib::{db, sync};

const DEMO_EMAIL: &str = "admin@demo.vidyalaya.in";
const DEMO_PASSWORD: &str = "vidyalaya-demo";

fn base_url() -> String {
    std::env::var("VIDYALAYA_CLOUD_API_URL").unwrap_or_else(|_| "http://localhost:3001".to_string())
}

async fn device_with_session(name: &str) -> AppState {
    let dir = std::env::temp_dir().join(format!("vidyalaya-sync-it-{name}-{}", uuid::Uuid::new_v4()));
    let db_path = dir.join("device.sqlite3");
    let mut conn = db::open_db(&db_path).expect("open db");
    seed_demo_data_if_empty(&mut conn).expect("seed demo data");

    let state = AppState::new(conn);

    let login_resp: serde_json::Value = state
        .http
        .post(format!("{}/auth/login", state.cloud_api_base_url))
        .json(&serde_json::json!({ "email": DEMO_EMAIL, "password": DEMO_PASSWORD }))
        .send()
        .await
        .expect("login request should reach cloud-api (is it running?)")
        .json()
        .await
        .expect("login response should be JSON");

    let access_token = login_resp["access_token"].as_str().expect("access_token in response");

    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO app_settings (key, value) VALUES ('access_token', ?1)",
        [access_token],
    )
    .unwrap();
    drop(db);

    state
}

#[tokio::test]
#[ignore]
async fn admission_created_offline_on_one_device_reaches_another_via_sync() {
    let device_a = device_with_session("a").await;
    let device_b = device_with_session("b").await;

    assert_eq!(device_a.cloud_api_base_url, base_url());

    let admission = {
        let mut conn = device_a.db.lock().unwrap();
        let academic_session_id: String = conn
            .query_row("SELECT id FROM academic_sessions LIMIT 1", [], |r| r.get(0))
            .expect("demo seed should have created an academic session");
        create_admission_impl(
            &mut conn,
            NewAdmissionInput {
                branch_id: DEMO_BRANCH_ID.to_string(),
                academic_session_id,
                applied_class_id: None,
                first_name: "Aarav".to_string(),
                last_name: Some("Sharma".to_string()),
                date_of_birth: None,
                gender: None,
                address: None,
                guardian_name: "Rohan Sharma".to_string(),
                guardian_relation: "father".to_string(),
                guardian_phone: Some("9876543210".to_string()),
                guardian_email: None,
            },
        )
        .expect("create_admission_impl should succeed offline")
    };

    // Sanity: local write is visible immediately, before any sync happens.
    {
        let conn = device_a.db.lock().unwrap();
        let name: String = conn
            .query_row(
                "SELECT first_name FROM students WHERE id = ?1",
                [&admission.student_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "Aarav");
    }

    sync::run_sync_cycle(&device_a)
        .await
        .expect("device A push should succeed against a running cloud-api");

    // Outbox should now be fully drained on device A.
    {
        let conn = device_a.db.lock().unwrap();
        let pending: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pending, 0, "device A outbox should be drained after a successful push");
    }

    sync::run_sync_cycle(&device_b)
        .await
        .expect("device B pull should succeed against a running cloud-api");

    let (name, tenant_id, branch_id): (String, String, String) = {
        let conn = device_b.db.lock().unwrap();
        conn.query_row(
            "SELECT first_name, tenant_id, branch_id FROM students WHERE id = ?1",
            [&admission.student_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("device B should have pulled the student created on device A")
    };

    assert_eq!(name, "Aarav");
    assert_eq!(tenant_id, DEMO_TENANT_ID);
    assert_eq!(branch_id, DEMO_BRANCH_ID);
}

/// Regression test for the academic-structure sync gap: classes (and, by
/// the same code path, sections and academic sessions) previously never
/// left the device that created them. This proves a class created on
/// device A -- beyond the one both devices seed identically on first run --
/// reaches device B through the ordinary sync cycle, the same as a student
/// or admission does.
#[tokio::test]
#[ignore]
async fn class_created_on_one_device_reaches_another_via_sync() {
    let device_a = device_with_session("class-a").await;
    let device_b = device_with_session("class-b").await;

    let (new_class_id, academic_session_id) = {
        let mut conn = device_a.db.lock().unwrap();
        let academic_session_id: String = conn
            .query_row("SELECT id FROM academic_sessions LIMIT 1", [], |r| r.get(0))
            .expect("demo seed should have created an academic session");

        let class = create_class_impl(
            &mut conn,
            NewClassInput {
                branch_id: DEMO_BRANCH_ID.to_string(),
                academic_session_id: academic_session_id.clone(),
                name: "Class 9".to_string(),
                sort_order: 9,
            },
        )
        .expect("create_class_impl should succeed offline");

        (class.id, academic_session_id)
    };

    sync::run_sync_cycle(&device_a)
        .await
        .expect("device A push should succeed against a running cloud-api");
    sync::run_sync_cycle(&device_b)
        .await
        .expect("device B pull should succeed against a running cloud-api");

    let (name, sort_order): (String, i64) = {
        let conn = device_b.db.lock().unwrap();
        conn.query_row(
            "SELECT name, sort_order FROM classes WHERE id = ?1",
            [&new_class_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("device B should have pulled the class created on device A")
    };

    assert_eq!(name, "Class 9");
    assert_eq!(sort_order, 9);

    // Both devices independently seeded the same fixed-id demo class/session
    // on first run -- confirm that didn't get corrupted or duplicated by
    // this device's own seed-time outbox push.
    let seeded_class_count: i64 = {
        let conn = device_b.db.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM classes WHERE academic_session_id = ?1",
            [&academic_session_id],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_eq!(seeded_class_count, 2, "the seeded demo class plus the newly synced one, no duplicates");
}
