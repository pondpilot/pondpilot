pub mod stream;

use crate::database::{DuckDBEngine, EngineConfig, QueryResult, CatalogInfo, DatabaseInfo, TableInfo, ColumnInfo, FileRegistration, FileInfo};
use crate::errors::Result;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// Note: DuckDBEngine is now stored directly without Mutex since it's thread-safe internally
pub type EngineState<'r> = State<'r, Arc<DuckDBEngine>>;

// Store for active streaming sessions
// type StreamingSessions = Arc<Mutex<HashMap<String, bool>>>;

#[tauri::command]
pub async fn initialize_duckdb(
    engine: EngineState<'_>,
    config: EngineConfig,
) -> Result<()> {
    // No lock needed - initialize is thread-safe
    engine.initialize(config).await
}

#[tauri::command]
pub async fn execute_query(
    engine: EngineState<'_>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult> {
    tracing::debug!("[COMMAND] execute_query called with SQL: {}", sql);
    // No lock needed - execute_query is thread-safe via the pool
    engine.execute_query(&sql, params).await
}

#[tauri::command]
pub async fn get_catalog(engine: EngineState<'_>) -> Result<CatalogInfo> {
    // No lock needed - read-only operation
    engine.get_catalog().await
}

#[tauri::command]
pub async fn get_databases(engine: EngineState<'_>) -> Result<Vec<DatabaseInfo>> {
    // No lock needed - read-only operation
    engine.get_databases().await
}

#[tauri::command]
pub async fn get_tables(
    engine: EngineState<'_>,
    database: String,
) -> Result<Vec<TableInfo>> {
    // No lock needed - read-only operation
    engine.get_tables(&database).await
}

#[tauri::command]
pub async fn get_columns(
    engine: EngineState<'_>,
    database: String,
    table: String,
) -> Result<Vec<ColumnInfo>> {
    // No lock needed - read-only operation
    engine.get_columns(&database, &table).await
}

#[tauri::command]
pub async fn register_file(
    engine: EngineState<'_>,
    options: FileRegistration,
) -> Result<()> {
    // Note: register_file modifies internal state (registered_files map)
    // The lock is handled internally by the engine
    engine.register_file(options).await
}

#[tauri::command]
pub async fn drop_file(engine: EngineState<'_>, name: String) -> Result<()> {
    // Note: drop_file modifies internal state (registered_files map)
    // The lock is handled internally by the engine
    engine.drop_file(&name).await
}

#[tauri::command]
pub async fn list_files(engine: EngineState<'_>) -> Result<Vec<FileInfo>> {
    // No lock needed - list_files handles its own synchronization
    engine.list_files().await
}

#[tauri::command]
pub async fn get_xlsx_sheet_names(
    engine: EngineState<'_>,
    file_path: Option<String>,
    filePath: Option<String>,
    
) -> Result<Vec<String>> {
    // Support both snake_case and camelCase arg names for compatibility
    let path = file_path.or(filePath).ok_or_else(|| crate::errors::DuckDBError::InvalidOperation {
        message: "Missing required parameter 'file_path'".to_string(),
        operation: Some("get_xlsx_sheet_names".to_string()),
    })?;
    engine.get_xlsx_sheet_names(&path).await
}

#[tauri::command]
pub async fn create_connection(engine: EngineState<'_>) -> Result<String> {
    // Generate a unique connection ID
    let connection_id = Uuid::new_v4().to_string();
    
    // Create and store the connection
    engine.create_connection(connection_id.clone()).await?;
    
    eprintln!("[CREATE_CONNECTION] Created persistent connection: {}", connection_id);
    Ok(connection_id)
}

#[tauri::command]
pub async fn connection_execute(
    engine: EngineState<'_>,
    connection_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult> {
    // Use the specific connection to execute the query
    eprintln!("[CONNECTION_EXECUTE] Using connection {} for SQL: {}", connection_id, sql);
    // Debug: If this is an ATTACH statement, log file diagnostics to help troubleshoot crashes
    if sql.trim_start().to_uppercase().starts_with("ATTACH ") {
        // Simple parse to extract the path between single quotes: ATTACH 'path' AS name
        if let Some(start_idx) = sql.find('\'') {
            if let Some(end_idx) = sql[start_idx + 1..].find('\'') {
                let path_str = &sql[start_idx + 1..start_idx + 1 + end_idx];
                eprintln!("[ATTACH_DEBUG] Requested path: {}", path_str);
                // Try to canonicalize and fetch metadata
                match std::fs::canonicalize(path_str) {
                    Ok(canon) => {
                        eprintln!("[ATTACH_DEBUG] Canonical path: {:?}", canon);
                        match std::fs::metadata(&canon) {
                            Ok(meta) => {
                                eprintln!(
                                    "[ATTACH_DEBUG] File size: {} bytes, readonly: {}",
                                    meta.len(),
                                    meta.permissions().readonly()
                                );
                            }
                            Err(e) => {
                                eprintln!("[ATTACH_DEBUG] Failed to get metadata: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[ATTACH_DEBUG] Canonicalize failed: {}", e);
                    }
                }

                // Additional MotherDuck diagnostics
                if path_str.starts_with("md:") {
                    let token_present = std::env::var("MOTHERDUCK_TOKEN").ok().map(|t| !t.is_empty()).unwrap_or(false);
                    eprintln!("[ATTACH_DEBUG] MotherDuck URL detected; env token present: {}", token_present);
                    // Try to check extension load state on this connection
                    match engine.execute_on_connection(&connection_id, "SELECT extension_name, loaded, installed FROM duckdb_extensions() WHERE extension_name='motherduck'", vec![]).await {
                        Ok(info) => {
                            if info.rows.is_empty() {
                                eprintln!("[ATTACH_DEBUG] motherduck extension not reported by duckdb_extensions()");
                            } else {
                                let row = &info.rows[0];
                                let loaded = row.get("loaded").and_then(|v| v.as_bool()).unwrap_or(false);
                                let installed = row.get("installed").and_then(|v| v.as_bool()).unwrap_or(false);
                                eprintln!("[ATTACH_DEBUG] motherduck extension status - loaded: {}, installed: {}", loaded, installed);
                            }
                        }
                        Err(e) => {
                            eprintln!("[ATTACH_DEBUG] Failed to read duckdb_extensions(): {}", e);
                        }
                    }
                }
            }
        }
    }
    engine.execute_on_connection(&connection_id, &sql, params).await
}

#[tauri::command]
pub async fn connection_close(
    engine: EngineState<'_>,
    connection_id: String,
) -> Result<()> {
    // Close and remove the connection from the manager
    eprintln!("[CONNECTION_CLOSE] Closing connection: {}", connection_id);
    engine.close_connection(&connection_id).await
}

#[tauri::command]
pub async fn shutdown_duckdb(_engine: EngineState<'_>) -> Result<()> {
    // DuckDB shutdown is handled automatically when the engine is dropped
    Ok(())
}


#[tauri::command]
pub async fn prepare_statement(
    _engine: EngineState<'_>,
    _sql: String,
) -> Result<String> {
    // Return a unique ID for the prepared statement
    // In a real implementation, this would prepare the statement in DuckDB
    Ok(Uuid::new_v4().to_string())
}

#[tauri::command]
pub async fn prepared_statement_execute(
    engine: EngineState<'_>,
    _statement_id: String,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult> {
    // For now, just execute as a regular query
    // In a real implementation, this would use the prepared statement
    let sql = "SELECT 1"; // Placeholder
    // No lock needed - execute_query is thread-safe
    engine.execute_query(sql, params).await
}

#[tauri::command]
pub async fn prepared_statement_close(
    _engine: EngineState<'_>,
    _statement_id: String,
) -> Result<()> {
    // In a real implementation, this would close the prepared statement
    Ok(())
}

#[tauri::command]
pub async fn checkpoint(_engine: EngineState<'_>) -> Result<()> {
    // DuckDB handles checkpointing automatically
    // Could force a WAL checkpoint here if using persistent storage
    Ok(())
}

#[tauri::command]
pub async fn export_database(
    _engine: EngineState<'_>,
    _format: String,
) -> Result<Vec<u8>> {
    // For now, return empty data
    // In a real implementation, this would export the database
    Ok(Vec::new())
}

#[tauri::command]
pub async fn import_database(
    _engine: EngineState<'_>,
    _data: Vec<u8>,
    _format: String,
) -> Result<()> {
    // In a real implementation, this would import data into the database
    Ok(())
}

#[tauri::command]
pub async fn load_extension(
    engine: EngineState<'_>,
    name: String,
    _options: Option<serde_json::Value>,
) -> Result<()> {
    // No lock needed - load_extension is thread-safe
    engine.load_extension(&name).await
}

#[tauri::command]
pub async fn list_extensions(_engine: EngineState<'_>) -> Result<Vec<String>> {
    // Return list of loaded extensions
    // In a real implementation, query DuckDB for loaded extensions
    Ok(vec![])
}
