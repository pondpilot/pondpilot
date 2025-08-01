use crate::database::{DuckDBEngine, EngineConfig, QueryResult, CatalogInfo, DatabaseInfo, TableInfo, ColumnInfo, FileRegistration, FileInfo};
use std::sync::Arc;
use tauri::{State, AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

type EngineState<'r> = State<'r, Arc<Mutex<DuckDBEngine>>>;

// Store for active streaming sessions
// type StreamingSessions = Arc<Mutex<HashMap<String, bool>>>;

#[tauri::command]
pub async fn initialize_duckdb(
    engine: EngineState<'_>,
    config: EngineConfig,
) -> Result<(), String> {
    engine
        .lock()
        .await
        .initialize(config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_query(
    engine: EngineState<'_>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult, String> {
    engine
        .lock()
        .await
        .execute_query(&sql, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_catalog(engine: EngineState<'_>) -> Result<CatalogInfo, String> {
    engine
        .lock()
        .await
        .get_catalog()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_databases(engine: EngineState<'_>) -> Result<Vec<DatabaseInfo>, String> {
    engine
        .lock()
        .await
        .get_databases()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tables(
    engine: EngineState<'_>,
    database: String,
) -> Result<Vec<TableInfo>, String> {
    engine
        .lock()
        .await
        .get_tables(&database)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_columns(
    engine: EngineState<'_>,
    database: String,
    table: String,
) -> Result<Vec<ColumnInfo>, String> {
    engine
        .lock()
        .await
        .get_columns(&database, &table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn register_file(
    engine: EngineState<'_>,
    options: FileRegistration,
) -> Result<(), String> {
    engine
        .lock()
        .await
        .register_file(options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_file(engine: EngineState<'_>, name: String) -> Result<(), String> {
    engine
        .lock()
        .await
        .drop_file(&name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_files(engine: EngineState<'_>) -> Result<Vec<FileInfo>, String> {
    engine
        .lock()
        .await
        .list_files()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_xlsx_sheet_names(engine: EngineState<'_>, filePath: String) -> Result<Vec<String>, String> {
    engine
        .lock()
        .await
        .get_xlsx_sheet_names(&filePath)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_connection(_engine: EngineState<'_>) -> Result<String, String> {
    // For now, return a UUID that represents a connection
    // In a real implementation, this would create a connection from the pool
    Ok(Uuid::new_v4().to_string())
}

#[tauri::command]
pub async fn connection_execute(
    engine: EngineState<'_>,
    _connection_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult, String> {
    // For now, just execute directly
    // In a real implementation, this would use the specific connection
    engine
        .lock()
        .await
        .execute_query(&sql, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connection_close(
    _engine: EngineState<'_>,
    _connection_id: String,
) -> Result<(), String> {
    // In a real implementation, this would return the connection to the pool
    Ok(())
}

#[tauri::command]
pub async fn shutdown_duckdb(_engine: EngineState<'_>) -> Result<(), String> {
    // DuckDB shutdown is handled automatically when the engine is dropped
    Ok(())
}

#[tauri::command]
pub async fn stream_query(
    app: AppHandle,
    engine: EngineState<'_>,
    stream_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<(), String> {
    // Execute query and stream results
    let engine = engine.lock().await;
    
    // For now, execute the full query and send results in chunks
    let result = engine
        .execute_query(&sql, params)
        .await
        .map_err(|e| e.to_string())?;
    
    // Send results in chunks of 100 rows
    let chunk_size = 100;
    for chunk in result.rows.chunks(chunk_size) {
        app.emit(&format!("stream-{}", stream_id), chunk)
            .map_err(|e| e.to_string())?;
    }
    
    // Signal end of stream
    app.emit(&format!("stream-{}-end", stream_id), ())
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn prepare_statement(
    _engine: EngineState<'_>,
    _sql: String,
) -> Result<String, String> {
    // Return a unique ID for the prepared statement
    // In a real implementation, this would prepare the statement in DuckDB
    Ok(Uuid::new_v4().to_string())
}

#[tauri::command]
pub async fn prepared_statement_execute(
    engine: EngineState<'_>,
    _statement_id: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult, String> {
    // For now, just execute as a regular query
    // In a real implementation, this would use the prepared statement
    let sql = "SELECT 1"; // Placeholder
    engine
        .lock()
        .await
        .execute_query(sql, params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepared_statement_close(
    _engine: EngineState<'_>,
    _statement_id: String,
) -> Result<(), String> {
    // In a real implementation, this would close the prepared statement
    Ok(())
}

#[tauri::command]
pub async fn checkpoint(_engine: EngineState<'_>) -> Result<(), String> {
    // DuckDB handles checkpointing automatically
    // Could force a WAL checkpoint here if using persistent storage
    Ok(())
}

#[tauri::command]
pub async fn export_database(
    _engine: EngineState<'_>,
    _format: String,
) -> Result<Vec<u8>, String> {
    // For now, return empty data
    // In a real implementation, this would export the database
    Ok(Vec::new())
}

#[tauri::command]
pub async fn import_database(
    _engine: EngineState<'_>,
    _data: Vec<u8>,
    _format: String,
) -> Result<(), String> {
    // In a real implementation, this would import data into the database
    Ok(())
}

#[tauri::command]
pub async fn load_extension(
    engine: EngineState<'_>,
    _name: String,
    _options: Option<serde_json::Value>,
) -> Result<(), String> {
    // Load extension in DuckDB
    let _pool = engine.lock().await;
    // Extension loading would be implemented here
    Ok(())
}

#[tauri::command]
pub async fn list_extensions(_engine: EngineState<'_>) -> Result<Vec<String>, String> {
    // Return list of loaded extensions
    // In a real implementation, query DuckDB for loaded extensions
    Ok(vec![])
}