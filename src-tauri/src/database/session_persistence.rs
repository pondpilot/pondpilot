use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::persistence::PersistenceState;
use crate::errors::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub attached_databases: Vec<AttachedDatabase>,
    pub loaded_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachedDatabase {
    pub path: String,
    pub alias: String,
    pub read_only: bool,
}

const SESSION_KEY: &str = "default_session";

impl SessionState {
    pub fn new() -> Self {
        Self {
            attached_databases: Vec::new(),
            loaded_extensions: Vec::new(),
        }
    }
    
    pub async fn load(persistence: &PersistenceState) -> Result<Self> {
        let conn = persistence.connection.lock()
            .map_err(|e| crate::errors::DuckDBError::PersistenceError {
                message: format!("Failed to lock connection: {}", e),
            })?;
        
        let query = "SELECT data FROM duckdb_session WHERE key = ?1";
        let result: std::result::Result<String, _> = conn.query_row(
            query, 
            rusqlite::params![SESSION_KEY], 
            |row| row.get(0)
        );
        
        match result {
            Ok(data) => {
                let state: SessionState = serde_json::from_str(&data)
                    .map_err(|e| crate::errors::DuckDBError::SerializationError {
                        message: format!("Failed to deserialize session state: {}", e),
                    })?;
                Ok(state)
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // No saved state, return empty
                Ok(Self::new())
            }
            Err(e) => Err(crate::errors::DuckDBError::PersistenceError {
                message: format!("Failed to load session state: {}", e),
            }),
        }
    }
    
    pub async fn save(&self, persistence: &PersistenceState) -> Result<()> {
        let data = serde_json::to_string(self)
            .map_err(|e| crate::errors::DuckDBError::SerializationError {
                message: format!("Failed to serialize session state: {}", e),
            })?;
        
        let conn = persistence.connection.lock()
            .map_err(|e| crate::errors::DuckDBError::PersistenceError {
                message: format!("Failed to lock connection: {}", e),
            })?;
        
        conn.execute(
            "INSERT OR REPLACE INTO duckdb_session (key, data) VALUES (?1, ?2)",
            rusqlite::params![SESSION_KEY, data],
        ).map_err(|e| crate::errors::DuckDBError::PersistenceError {
            message: format!("Failed to save session state: {}", e),
        })?;
        
        Ok(())
    }
}