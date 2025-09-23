use crate::errors::DuckDBError;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Debug, Clone)]
pub struct PersistenceState {
    pub connection: Arc<Mutex<Connection>>,
}

impl PersistenceState {
    pub fn new(db_path: PathBuf) -> Result<Self, DuckDBError> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| DuckDBError::FileAccess {
                    message: format!("Failed to create persistence directory: {}", e),
                    path: Some(parent.to_string_lossy().to_string()),
                })?;
                tracing::info!("[Persistence] Created persistence directory: {:?}", parent);
            }
        }

        // Use the provided path directly
        tracing::info!("[Persistence] SQLite persistence path: {:?}", db_path);

        let conn = Connection::open(&db_path)?;

        // Create tables if they don't exist
        // Using underscore names for SQLite/Tauri (different from IndexedDB hyphenated names)
        conn.execute_batch(
            r#"
            -- Data sources table
            CREATE TABLE IF NOT EXISTS data_sources (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- Local file/folder entries
            CREATE TABLE IF NOT EXISTS local_entries (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- SQL scripts
            CREATE TABLE IF NOT EXISTS sql_scripts (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- Tabs
            CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- Content view (for storing active tab, tab order, etc.)
            CREATE TABLE IF NOT EXISTS content_view (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- DuckDB session state (attached databases, loaded extensions)
            CREATE TABLE IF NOT EXISTS duckdb_session (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );
            "#,
        )?;

        // Best-effort in-place schema alignment for early dev builds where content_view/duckdb_session
        // may have been created with 'key' as the PK column. If found, rename to 'id'.
        // Ignore errors here to avoid impacting startup if table does not exist or rename not needed.
        let _ = align_pk_column_to_id(&conn, "content_view");
        let _ = align_pk_column_to_id(&conn, "duckdb_session");

        Ok(Self {
            connection: Arc::new(Mutex::new(conn)),
        })
    }
}

// Helper: check table_info and rename 'key' column to 'id' if present
fn align_pk_column_to_id(
    conn: &rusqlite::Connection,
    table: &str,
) -> std::result::Result<(), rusqlite::Error> {
    // See if there is a column named 'key'
    let has_key: bool = conn
        .query_row(
            &format!(
                "SELECT COUNT(1) FROM pragma_table_info('{}') WHERE name = 'key'",
                table
            ),
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    // And if there is already a column named 'id'
    let has_id: bool = conn
        .query_row(
            &format!(
                "SELECT COUNT(1) FROM pragma_table_info('{}') WHERE name = 'id'",
                table
            ),
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if has_key && !has_id {
        let sql = format!("ALTER TABLE {} RENAME COLUMN key TO id", table);
        let _ = conn.execute(&sql, []);
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetRequest {
    table: String,
    key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutRequest {
    table: String,
    value: Value,
    key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteRequest {
    table: String,
    key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearRequest {
    table: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAllRequest {
    table: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutAllItem {
    key: String,
    value: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutAllRequest {
    table: String,
    items: Vec<PutAllItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteAllRequest {
    table: String,
    keys: Vec<String>,
}

// Helper function to map from hyphenated to underscore table names
fn map_table_name(table: &str) -> Result<&'static str, DuckDBError> {
    match table {
        "data-source" => Ok("data_sources"),
        "local-entry" => Ok("local_entries"),
        "sql-script" => Ok("sql_scripts"),
        "tab" => Ok("tabs"),
        "content-view" => Ok("content_view"),
        "duckdb-session" => Ok("duckdb_session"),
        _ => Err(DuckDBError::InvalidOperation {
            message: format!("Unknown persistence table: {}", table),
            operation: Some("map_table_name".to_string()),
        }),
    }
}

// Helper function to extract ID from JSON value
fn extract_id(value: &Value, key: Option<&str>) -> Result<String, DuckDBError> {
    if let Some(k) = key {
        return Ok(k.to_string());
    }

    // Try to extract id from the value
    if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
        return Ok(id.to_string());
    }

    Err(DuckDBError::InvalidOperation {
        message: "No ID provided and couldn't extract from value".to_string(),
        operation: Some("extract_id".to_string()),
    })
}

#[tauri::command]
pub async fn sqlite_get(
    state: State<'_, PersistenceState>,
    table: String,
    key: String,
) -> Result<Option<Value>, DuckDBError> {
    let conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    // Map hyphenated table name to underscore version
    let mapped_table = map_table_name(&table)?;
    let query = format!("SELECT data FROM {} WHERE id = ?1", mapped_table);

    let result: Result<String, _> = conn.query_row(&query, params![key], |row| row.get(0));

    match result {
        Ok(data) => {
            let value: Value = serde_json::from_str(&data)?;
            Ok(Some(value))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub async fn sqlite_put(
    state: State<'_, PersistenceState>,
    table: String,
    value: Value,
    key: Option<String>,
) -> Result<(), DuckDBError> {
    let conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    let id = extract_id(&value, key.as_deref())?;
    let data = serde_json::to_string(&value)?;

    // Map hyphenated table name to underscore version
    let mapped_table = map_table_name(&table)?;
    let query = format!(
        "INSERT OR REPLACE INTO {} (id, data) VALUES (?1, ?2)",
        mapped_table
    );

    conn.execute(&query, params![id, data])?;

    Ok(())
}

#[tauri::command]
pub async fn sqlite_delete(
    state: State<'_, PersistenceState>,
    table: String,
    key: String,
) -> Result<(), DuckDBError> {
    let conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    // Map hyphenated table name to underscore version
    let mapped_table = map_table_name(&table)?;
    let query = format!("DELETE FROM {} WHERE id = ?1", mapped_table);

    conn.execute(&query, params![key])?;

    Ok(())
}

#[tauri::command]
pub async fn sqlite_clear(
    state: State<'_, PersistenceState>,
    table: String,
) -> Result<(), DuckDBError> {
    let conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    // Map hyphenated table name to underscore version
    let mapped_table = map_table_name(&table)?;
    let query = format!("DELETE FROM {}", mapped_table);

    conn.execute(&query, [])?;

    Ok(())
}

#[tauri::command]
pub async fn sqlite_get_all(
    state: State<'_, PersistenceState>,
    table: String,
) -> Result<Vec<Value>, DuckDBError> {
    let conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    // Map hyphenated table name to underscore version
    let mapped_table = map_table_name(&table)?;
    let query = format!("SELECT data FROM {}", mapped_table);

    let mut stmt = conn.prepare(&query)?;

    let values = stmt
        .query_map([], |row| {
            let data: String = row.get(0)?;
            serde_json::from_str(&data).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(values)
}

#[tauri::command]
pub async fn sqlite_put_all(
    state: State<'_, PersistenceState>,
    table: String,
    items: Vec<PutAllItem>,
) -> Result<(), DuckDBError> {
    let mut conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    let mapped_table = map_table_name(&table)?;
    let tx = conn.transaction()?;
    let sql = format!(
        "INSERT OR REPLACE INTO {} (id, data) VALUES (?1, ?2)",
        mapped_table
    );
    {
        let mut stmt = tx.prepare(&sql)?;
        for item in items {
            let data = serde_json::to_string(&item.value)?;
            stmt.execute(params![item.key, data])?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn sqlite_delete_all(
    state: State<'_, PersistenceState>,
    table: String,
    keys: Vec<String>,
) -> Result<(), DuckDBError> {
    let mut conn = state
        .connection
        .lock()
        .map_err(|_| DuckDBError::PersistenceError {
            message: "Failed to acquire connection lock".to_string(),
            operation: None,
        })?;

    let mapped_table = map_table_name(&table)?;
    let tx = conn.transaction()?;
    let sql = format!("DELETE FROM {} WHERE id = ?1", mapped_table);
    {
        let mut stmt = tx.prepare(&sql)?;
        for key in keys {
            stmt.execute(params![key])?;
        }
    }
    tx.commit()?;
    Ok(())
}
