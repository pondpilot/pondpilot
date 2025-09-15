pub mod stream;
pub mod utils;

use crate::database::{DuckDBEngine, EngineConfig, QueryResult, CatalogInfo, DatabaseInfo, TableInfo, ColumnInfo, FileRegistration, FileInfo};
use crate::errors::Result;
use serde::Serialize;
use crate::database::extensions::ALLOWED_EXTENSIONS;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// Note: DuckDBEngine is now stored directly without Mutex since it's thread-safe internally
pub type EngineState<'r> = State<'r, Arc<DuckDBEngine>>;

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
    tracing::debug!("[COMMAND] execute_query called (sql_len={} chars)", sql.len());
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
    #[allow(non_snake_case)]
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
    
    #[cfg(debug_assertions)]
    eprintln!("[CREATE_CONNECTION] Created persistent connection: {}", connection_id);
    Ok(connection_id)
}

#[tauri::command]
pub async fn connection_execute(
    engine: EngineState<'_>,
    connection_id: String,
    sql: String,
    params: Vec<serde_json::Value>,
    #[allow(non_snake_case)] timeoutMs: Option<u64>,
) -> Result<QueryResult> {
    // Use the specific connection to execute the query
    #[cfg(debug_assertions)]
    eprintln!(
        "[CONNECTION_EXECUTE] Using connection {} for SQL (len={} chars)",
        connection_id,
        sql.len()
    );
    // Debug: If this is an ATTACH statement, validate and log file diagnostics to help troubleshoot crashes
    #[cfg(debug_assertions)]
    if sql.trim_start().to_uppercase().starts_with("ATTACH ") {
        // Best-effort parse to extract the path between quotes: ATTACH 'path' AS name or ATTACH "path" AS name
        let (quote, start_idx) = if let Some(idx) = sql.find('\'') { ('\'', idx) } else if let Some(idx) = sql.find('"') { ('"', idx) } else { ('\'', usize::MAX) };
        if start_idx != usize::MAX {
            if let Some(end_rel) = sql[start_idx + 1..].find(quote) {
                let end_idx = start_idx + 1 + end_rel;
                let path_str = &sql[start_idx + 1..end_idx];
                
                // Validate the path for security
                if let Err(e) = crate::security::validate_attach_path(path_str) {
                    tracing::warn!("[ATTACH_DEBUG] Path validation failed: {}", e);
                    // In debug mode, just warn but continue (production would reject)
                }
                
                tracing::debug!("[ATTACH_DEBUG] Requested path: {}", path_str);
                // Try to canonicalize and fetch metadata
                match std::fs::canonicalize(path_str) {
                    Ok(canon) => {
                        tracing::debug!("[ATTACH_DEBUG] Canonical path: {:?}", canon);
                        match std::fs::metadata(&canon) {
                            Ok(meta) => {
                                tracing::debug!(
                                    "[ATTACH_DEBUG] File size: {} bytes, readonly: {}",
                                    meta.len(),
                                    meta.permissions().readonly()
                                );
                            }
                            Err(e) => {
                                tracing::debug!("[ATTACH_DEBUG] Failed to get metadata: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::debug!("[ATTACH_DEBUG] Canonicalize failed: {}", e);
                    }
                }

                // Additional MotherDuck diagnostics
                if path_str.starts_with("md:") {
                    let token_present = std::env::var("MOTHERDUCK_TOKEN").ok().map(|t| !t.is_empty()).unwrap_or(false);
                    tracing::debug!("[ATTACH_DEBUG] MotherDuck URL detected; env token present: {}", token_present);
                    // Try to check extension load state on this connection
                    match engine.execute_on_connection(&connection_id, "SELECT extension_name, loaded, installed FROM duckdb_extensions() WHERE extension_name='motherduck'", vec![]).await {
                        Ok(info) => {
                            if info.rows.is_empty() {
                                tracing::debug!("[ATTACH_DEBUG] motherduck extension not reported by duckdb_extensions()");
                            } else {
                                let row = &info.rows[0];
                                let loaded = row.get("loaded").and_then(|v| v.as_bool()).unwrap_or(false);
                                let installed = row.get("installed").and_then(|v| v.as_bool()).unwrap_or(false);
                                tracing::debug!("[ATTACH_DEBUG] motherduck extension status - loaded: {}, installed: {}", loaded, installed);
                            }
                        }
                        Err(e) => {
                            tracing::debug!("[ATTACH_DEBUG] Failed to read duckdb_extensions(): {}", e);
                        }
                    }
                }
            }
        }
    }
    // Execute with optional timeout to allow backend to interrupt
    let result = engine.execute_on_connection_with_timeout(&connection_id, &sql, params, timeoutMs).await;
    // If ATTACH succeeded, register it for future connections
    if result.is_ok() {
        let upper = sql.trim_start().to_uppercase();
        if upper.starts_with("ATTACH ") {
            // Try to extract alias and read-only
            // Pattern: ATTACH 'url' AS alias (READ_ONLY)
            let alias = sql.split_whitespace()
                .skip_while(|s| s.to_uppercase() != "AS")
                .nth(1)
                .map(|s| s.trim_matches(|c: char| c == '"' || c == '\'' || c == ';'))
                .map(|s| s.to_string());
            let read_only = sql.to_uppercase().contains("READ_ONLY");
            if let Some(alias) = alias {
                // Extract URL/path between first quotes
                if let Some(s) = sql.find('\'') {
                    if let Some(e_rel) = sql[s+1..].find('\'') {
                        let e = s + 1 + e_rel;
                        let url = sql[s+1..e].to_string();
                    // Register as PLAIN attach for future connections
                        engine.register_plain_attachment(alias, url, read_only).await;
                    }
                }
            }
        }
    }
    result
}

#[tauri::command]
pub async fn connection_close(
    engine: EngineState<'_>,
    connection_id: String,
) -> Result<()> {
    // Close and remove the connection from the manager
    #[cfg(debug_assertions)]
    tracing::debug!("[CONNECTION_CLOSE] Closing connection: {}", connection_id);
    engine.close_connection(&connection_id).await
}

#[tauri::command]
pub async fn reset_all_connections(
    engine: EngineState<'_>,
) -> Result<()> {
    #[cfg(debug_assertions)]
    tracing::debug!("[RESET_CONNECTIONS] Resetting all connections for MotherDuck account switch");
    engine.reset_all_connections().await
}

#[tauri::command]
pub async fn shutdown_duckdb(_engine: EngineState<'_>) -> Result<()> {
    // DuckDB shutdown is handled automatically when the engine is dropped
    Ok(())
}

#[tauri::command]
pub async fn checkpoint(_engine: EngineState<'_>) -> Result<()> {
    // DuckDB handles checkpointing automatically
    // Could force a WAL checkpoint here if using persistent storage
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
pub async fn prepare_statement(
    engine: EngineState<'_>,
    sql: String,
) -> Result<String> {
    engine.prepare_statement(&sql).await
}

#[tauri::command]
pub async fn prepared_statement_execute(
    engine: EngineState<'_>,
    // Support both snake_case and camelCase arg names for compatibility
    statement_id: Option<String>,
    #[allow(non_snake_case)] statementId: Option<String>,
    params: Vec<serde_json::Value>,
) -> Result<QueryResult> {
    let statement_id = crate::commands::utils::coalesce_param_opt(statement_id, statementId, "statement_id", "prepared_statement_execute")?;
    engine.execute_prepared_statement(&statement_id, params).await
}

#[tauri::command]
pub async fn prepared_statement_close(
    engine: EngineState<'_>,
    // Support both snake_case and camelCase arg names for compatibility
    statement_id: Option<String>,
    #[allow(non_snake_case)] statementId: Option<String>,
) -> Result<()> {
    let statement_id = crate::commands::utils::coalesce_param_opt(statement_id, statementId, "statement_id", "prepared_statement_close")?;
    engine.close_prepared_statement(&statement_id).await
}

#[tauri::command]
pub async fn set_extensions(
    engine: EngineState<'_>,
    extensions: Vec<crate::database::types::ExtensionInfoForLoad>,
) -> Result<()> {
    // Update the extension set and reset connections so new config applies everywhere
    engine.set_extensions(extensions).await?;
    engine.reset_all_connections().await?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct ExtensionInfo {
    pub name: String,
    pub loaded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub installed: bool,
}

#[tauri::command]
pub async fn list_extensions(engine: EngineState<'_>) -> Result<Vec<ExtensionInfo>> {
    let sql = "SELECT extension_name, loaded, installed, extension_version FROM duckdb_extensions()";
    let result = engine.execute_query(sql, vec![]).await?;
    let mut out = Vec::new();
    for row in result.rows {
        let name = row.get("extension_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        // Filter to allowed extensions only
        if !ALLOWED_EXTENSIONS.contains(&name.as_str()) {
            continue;
        }
        let loaded = row.get("loaded").and_then(|v| v.as_bool()).unwrap_or(false);
        let installed = row.get("installed").and_then(|v| v.as_bool()).unwrap_or(false);
        let version = row.get("extension_version").and_then(|v| v.as_str()).map(|s| s.to_string());
        out.push(ExtensionInfo { name, loaded, version, installed });
    }
    Ok(out)
}

// Note: export/import database API intentionally not exposed.
