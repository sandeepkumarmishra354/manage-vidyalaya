pub mod commands;
pub mod db;
pub mod models;
pub mod seed;
pub mod state;
pub mod sync;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let db_path = app_data_dir.join("vidyalaya.sqlite3");

            let conn = db::open_db(&db_path)?;
            seed::seed_demo_data_if_empty(&conn)?;

            app.manage(AppState::new(conn));

            // Background sync loop: pushes the outbox and pulls new changes
            // every 30s, and (best-effort) once shortly after startup. All
            // failures are swallowed here -- being offline is expected, not
            // an error; `get_sync_status` / `sync_now` surface state to the UI.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
                loop {
                    interval.tick().await;
                    let state = handle.state::<AppState>();
                    if let Err(e) = sync::run_sync_cycle(&state).await {
                        eprintln!("background sync failed (will retry): {e}");
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::get_session,
            commands::auth::logout,
            commands::branches::list_branches,
            commands::branches::list_classes,
            commands::branches::list_sections,
            commands::branches::current_academic_session_id,
            commands::students::list_students,
            commands::students::get_student,
            commands::students::create_admission,
            commands::sync::sync_now,
            commands::sync::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
