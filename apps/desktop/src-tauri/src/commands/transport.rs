use rusqlite::params;
use tauri::State;

use crate::audit::record_audit;
use crate::models::{
    AssignTransportInput, NewTransportRouteInput, NewTransportStopInput, StudentTransportInfo,
    TransportRoute, TransportRosterEntry, TransportStop, UpdateTransportRouteInput, UpdateTransportStopInput,
};
use crate::state::{current_tenant_id, enqueue_outbox_from_row, require_permission, AppState};

#[tauri::command]
pub fn create_route(state: State<AppState>, input: NewTransportRouteInput) -> Result<TransportRoute, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO transport_routes (
            id, tenant_id, branch_id, name, vehicle_number, driver_name, driver_phone, capacity, updated_at, version
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
        params![
            id,
            tenant_id,
            input.branch_id,
            input.name,
            input.vehicle_number,
            input.driver_name,
            input.driver_phone,
            input.capacity,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "transport_routes", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(TransportRoute {
        id,
        branch_id: input.branch_id,
        name: input.name,
        vehicle_number: input.vehicle_number,
        driver_name: input.driver_name,
        driver_phone: input.driver_phone,
        capacity: input.capacity,
    })
}

#[tauri::command]
pub fn update_route(state: State<AppState>, input: UpdateTransportRouteInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE transport_routes SET name = ?1, vehicle_number = ?2, driver_name = ?3, driver_phone = ?4, capacity = ?5, updated_at = ?6, version = version + 1 WHERE id = ?7",
        params![input.name, input.vehicle_number, input.driver_name, input.driver_phone, input.capacity, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "transport_routes", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "transport_routes", &input.id, "update", &format!("Updated route '{}'", input.name))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_routes(state: State<AppState>, branch_id: String) -> Result<Vec<TransportRoute>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, branch_id, name, vehicle_number, driver_name, driver_phone, capacity
             FROM transport_routes WHERE branch_id = ?1 AND deleted_at IS NULL ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([branch_id], |row| {
            Ok(TransportRoute {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                name: row.get(2)?,
                vehicle_number: row.get(3)?,
                driver_name: row.get(4)?,
                driver_phone: row.get(5)?,
                capacity: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_stop(state: State<AppState>, input: NewTransportStopInput) -> Result<TransportStop, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO transport_stops (id, tenant_id, route_id, name, sequence, pickup_time, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
        params![id, tenant_id, input.route_id, input.name, input.sequence, input.pickup_time, now],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "transport_stops", &id, "insert").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(TransportStop {
        id,
        route_id: input.route_id,
        name: input.name,
        sequence: input.sequence,
        pickup_time: input.pickup_time,
    })
}

#[tauri::command]
pub fn update_stop(state: State<AppState>, input: UpdateTransportStopInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE transport_stops SET name = ?1, sequence = ?2, pickup_time = ?3, updated_at = ?4, version = version + 1 WHERE id = ?5",
        params![input.name, input.sequence, input.pickup_time, now, input.id],
    )
    .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "transport_stops", &input.id, "update").map_err(|e| e.to_string())?;
    record_audit(&tx, &tenant_id, None, "transport_stops", &input.id, "update", &format!("Updated stop '{}'", input.name))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_stops(state: State<AppState>, route_id: String) -> Result<Vec<TransportStop>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, route_id, name, sequence, pickup_time FROM transport_stops
             WHERE route_id = ?1 AND deleted_at IS NULL ORDER BY sequence",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([route_id], |row| {
            Ok(TransportStop {
                id: row.get(0)?,
                route_id: row.get(1)?,
                name: row.get(2)?,
                sequence: row.get(3)?,
                pickup_time: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Assigns a student to a route/stop, replacing any previous assignment.
#[tauri::command]
pub fn assign_student_transport(state: State<AppState>, input: AssignTransportInput) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.manage")?;
    let tenant_id = current_tenant_id(&conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO student_transport (id, tenant_id, student_id, route_id, stop_id, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
         ON CONFLICT(student_id) DO UPDATE SET
             route_id = excluded.route_id,
             stop_id = excluded.stop_id,
             updated_at = excluded.updated_at,
             version = student_transport.version + 1",
        params![id, tenant_id, input.student_id, input.route_id, input.stop_id, now],
    )
    .map_err(|e| e.to_string())?;

    let row_id: String = tx
        .query_row(
            "SELECT id FROM student_transport WHERE student_id = ?1",
            [&input.student_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    enqueue_outbox_from_row(&tx, "student_transport", &row_id, "update").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_student_transport(
    state: State<AppState>,
    student_id: String,
) -> Result<Option<StudentTransportInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.view")?;
    conn.query_row(
        "SELECT r.name, st.name, st.pickup_time
         FROM student_transport t
         JOIN transport_routes r ON r.id = t.route_id
         JOIN transport_stops st ON st.id = t.stop_id
         WHERE t.student_id = ?1 AND t.deleted_at IS NULL",
        [&student_id],
        |row| {
            Ok(StudentTransportInfo {
                route_name: row.get(0)?,
                stop_name: row.get(1)?,
                pickup_time: row.get(2)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(e.to_string())
        }
    })
}

#[tauri::command]
pub fn list_route_roster(state: State<AppState>, route_id: String) -> Result<Vec<TransportRosterEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    require_permission(&conn, "transport.view")?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.first_name, s.last_name, st.name
             FROM student_transport t
             JOIN students s ON s.id = t.student_id
             JOIN transport_stops st ON st.id = t.stop_id
             WHERE t.route_id = ?1 AND t.deleted_at IS NULL AND s.deleted_at IS NULL
             ORDER BY st.sequence, s.first_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([route_id], |row| {
            Ok(TransportRosterEntry {
                student_id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                stop_name: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
