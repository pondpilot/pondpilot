use rusqlite::{Connection, Result, params};
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
    pub fn new(db_path: PathBuf) -> Result<Self> {
        // Use the provided path directly
        println!("SQLite persistence path: {:?}", db_path);
        
        let conn = Connection::open(db_path)?;
        
        // Create tables if they don't exist
        // Note: Table names must match TypeScript constants (hyphenated)
        conn.execute_batch(
            r#"
            -- Data sources table
            CREATE TABLE IF NOT EXISTS "data-source" (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- Local file/folder entries
            CREATE TABLE IF NOT EXISTS "local-entry" (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- SQL scripts
            CREATE TABLE IF NOT EXISTS "sql-script" (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );

            -- Tabs
            CREATE TABLE IF NOT EXISTS "tab" (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );
            
            -- Content view (for storing active tab, tab order, etc.)
            CREATE TABLE IF NOT EXISTS "content-view" (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL -- JSON serialized data
            );
            "#
        )?;
        
        Ok(Self {
            connection: Arc::new(Mutex::new(conn)),
        })
    }
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

// Helper function to extract ID from JSON value
fn extract_id(value: &Value, key: Option<&str>) -> Result<String, String> {
    if let Some(k) = key {
        return Ok(k.to_string());
    }
    
    // Try to extract id from the value
    if let Some(id) = value.get("id").and_then(|v| v.as_str()) {
        return Ok(id.to_string());
    }
    
    Err("No ID provided and couldn't extract from value".to_string())
}

#[tauri::command]
pub async fn sqlite_get(
    state: State<'_, PersistenceState>,
    table: String,
    key: String,
) -> Result<Option<Value>, String> {
    let conn = state.connection.lock().map_err(|e| e.to_string())?;
    
    // Build query with proper table name (using quotes for hyphenated names)
    let query = format!("SELECT data FROM '{}' WHERE id = ?1", table);
    
    let result: Result<String, _> = conn.query_row(&query, params![key], |row| {
        row.get(0)
    });
    
    match result {
        Ok(data) => {
            let value: Value = serde_json::from_str(&data)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;
            Ok(Some(value))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

#[tauri::command]
pub async fn sqlite_put(
    state: State<'_, PersistenceState>,
    table: String,
    value: Value,
    key: Option<String>,
) -> Result<(), String> {
    let conn = state.connection.lock().map_err(|e| e.to_string())?;
    
    let id = extract_id(&value, key.as_deref())?;
    let data = serde_json::to_string(&value)
        .map_err(|e| format!("Failed to serialize value: {}", e))?;
    
    // Simple insert with just id and data (JSON blob)
    let query = format!("INSERT OR REPLACE INTO '{}' (id, data) VALUES (?1, ?2)", table);
    
    conn.execute(&query, params![id, data])
        .map_err(|e| format!("Failed to insert into {}: {}", table, e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn sqlite_delete(
    state: State<'_, PersistenceState>,
    table: String,
    key: String,
) -> Result<(), String> {
    let conn = state.connection.lock().map_err(|e| e.to_string())?;
    
    let query = format!("DELETE FROM '{}' WHERE id = ?1", table);
    
    conn.execute(&query, params![key])
        .map_err(|e| format!("Failed to delete: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn sqlite_clear(
    state: State<'_, PersistenceState>,
    table: String,
) -> Result<(), String> {
    let conn = state.connection.lock().map_err(|e| e.to_string())?;
    
    let query = format!("DELETE FROM '{}'", table);
    
    conn.execute(&query, [])
        .map_err(|e| format!("Failed to clear table: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn sqlite_get_all(
    state: State<'_, PersistenceState>,
    table: String,
) -> Result<Vec<Value>, String> {
    let conn = state.connection.lock().map_err(|e| e.to_string())?;
    
    let query = format!("SELECT data FROM '{}'", table);
    
    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;
    
    let values: Result<Vec<Value>, _> = stmt.query_map([], |row| {
        let data: String = row.get(0)?;
        serde_json::from_str(&data)
            .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                0, 
                rusqlite::types::Type::Text, 
                Box::new(e)
            ))
    })
    .map_err(|e| format!("Failed to query: {}", e))?
    .collect();
    
    values.map_err(|e| format!("Failed to collect results: {}", e))
}