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

            let mut conn = db::open_db(&db_path)?;
            seed::seed_demo_data_if_empty(&mut conn)?;

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
            commands::branches::create_class,
            commands::branches::list_sections,
            commands::branches::create_section,
            commands::branches::list_academic_sessions,
            commands::branches::create_academic_session,
            commands::branches::current_academic_session_id,
            commands::students::list_students,
            commands::students::list_students_in_class,
            commands::students::get_student,
            commands::students::create_admission,
            commands::attendance::get_attendance_roster,
            commands::attendance::mark_attendance,
            commands::attendance::get_student_attendance_history,
            commands::fees::create_fee_structure,
            commands::fees::list_fee_structures,
            commands::fees::generate_invoices,
            commands::fees::list_invoices,
            commands::fees::get_student_fee_summary,
            commands::fees::record_payment,
            commands::exams::create_subject,
            commands::exams::list_subjects,
            commands::exams::create_exam,
            commands::exams::list_exams,
            commands::exams::get_marks_roster,
            commands::exams::save_marks,
            commands::exams::get_report_card,
            commands::sync::sync_now,
            commands::sync::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
