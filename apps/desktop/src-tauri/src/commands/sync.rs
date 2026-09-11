use tauri::State;

use crate::models::SyncStatus;
use crate::state::AppState;
use crate::sync::{run_sync_cycle, sync_status};

#[tauri::command]
pub async fn sync_now(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    match run_sync_cycle(&state).await {
        Ok(()) => {
            let mut status = sync_status(&state)?;
            status.is_online = true;
            Ok(status)
        }
        Err(e) => {
            let mut status = sync_status(&state)?;
            status.is_online = false;
            eprintln!("sync cycle failed: {e}");
            Ok(status)
        }
    }
}

#[tauri::command]
pub fn get_sync_status(state: State<AppState>) -> Result<SyncStatus, String> {
    sync_status(&state)
}
