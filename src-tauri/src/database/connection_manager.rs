use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use duckdb::Connection;
use crate::errors::{Result, DuckDBError};

/// Manages persistent DuckDB connections for a session
#[derive(Debug)]
pub struct ConnectionManager {
    connections: Arc<Mutex<HashMap<String, Arc<Mutex<Connection>>>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a new connection with the given ID
    pub async fn create_connection(&self, connection_id: String, conn: Connection) -> Result<()> {
        let mut connections = self.connections.lock().await;
        if connections.contains_key(&connection_id) {
            return Err(DuckDBError::ConnectionError {
                message: format!("Connection {} already exists", connection_id),
            });
        }
        connections.insert(connection_id, Arc::new(Mutex::new(conn)));
        Ok(())
    }

    /// Get a connection by ID
    pub async fn get_connection(&self, connection_id: &str) -> Result<Arc<Mutex<Connection>>> {
        let connections = self.connections.lock().await;
        connections.get(connection_id)
            .cloned()
            .ok_or_else(|| DuckDBError::ConnectionError {
                message: format!("Connection {} not found", connection_id),
            })
    }

    /// Remove and close a connection
    pub async fn close_connection(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.lock().await;
        connections.remove(connection_id)
            .ok_or_else(|| DuckDBError::ConnectionError {
                message: format!("Connection {} not found", connection_id),
            })?;
        Ok(())
    }

    /// Check if a connection exists
    pub async fn has_connection(&self, connection_id: &str) -> bool {
        let connections = self.connections.lock().await;
        connections.contains_key(connection_id)
    }

    /// Get the number of active connections
    pub async fn connection_count(&self) -> usize {
        let connections = self.connections.lock().await;
        connections.len()
    }

    /// Clear all connections
    pub async fn clear_all(&self) {
        let mut connections = self.connections.lock().await;
        connections.clear();
    }
}