use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http: reqwest::Client,
    pub cloud_api_base_url: String,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        let cloud_api_base_url = std::env::var("VIDYALAYA_CLOUD_API_URL")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());

        Self {
            db: Mutex::new(db),
            http: reqwest::Client::new(),
            cloud_api_base_url,
        }
    }
}

/// Inserts a row into the local `sync_outbox` table. Must be called inside the
/// same rusqlite transaction as the mutation it describes, so a crash between
/// the data write and the outbox write is impossible.
pub fn enqueue_outbox(
    tx: &rusqlite::Transaction,
    entity_table: &str,
    entity_id: &str,
    op: &str,
    payload_json: &str,
) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO sync_outbox (id, entity_table, entity_id, op, payload_json, client_ts, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            entity_table,
            entity_id,
            op,
            payload_json,
            chrono::Utc::now().to_rfc3339(),
        ],
    )?;
    Ok(())
}
