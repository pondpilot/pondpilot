// Connection Handler for DuckDB
// 
// SECURITY NOTE: Parameter binding is currently limited in the DuckDB Rust bindings
// when using Arrow queries. As a mitigation:
// 1. All SQL identifiers (table names, column names) are sanitized in engine.rs
// 2. File paths are validated and canonicalized in engine.rs
// 3. Parameters in queries should be escaped at the application level
//
// TODO: Implement full parameter binding when DuckDB Rust bindings add support

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, mpsc, oneshot};
use duckdb::Connection;
use crate::errors::{Result, DuckDBError};
use crate::database::sql_classifier::ClassifiedSqlStatement;
use crate::database::sql_sanitizer;
use crate::database::types::{QueryResult, ColumnInfo};
use serde_json;
use tracing::debug;

/// Commands that can be sent to a connection thread
#[derive(Debug)]
enum ConnectionCommand {
    Execute {
        sql: String,
        params: Vec<serde_json::Value>,
        response: oneshot::Sender<Result<QueryResult>>,
    },
    Close {
        response: oneshot::Sender<Result<()>>,
    },
}

/// Handles a single DuckDB connection in its own dedicated thread
struct ConnectionHandler {
    receiver: mpsc::Receiver<ConnectionCommand>,
    connection: Connection,
}

impl ConnectionHandler {
    fn new(connection: Connection, receiver: mpsc::Receiver<ConnectionCommand>) -> Self {
        Self { connection, receiver }
    }

    /// Run the connection handler loop in the current thread
    fn run(mut self) {
        while let Some(command) = self.receiver.blocking_recv() {
            match command {
                ConnectionCommand::Execute { sql, params, response } => {
                    let result = self.execute_sql(&sql, &params);
                    let _ = response.send(result);
                }
                ConnectionCommand::Close { response } => {
                    // Connection will be dropped when this function returns
                    let _ = response.send(Ok(()));
                    break;
                }
            }
        }
    }

    /// Apply MotherDuck settings in a secure way
    fn apply_motherduck_settings(&mut self) {
        // Only apply settings if token is present
        if let Ok(token) = std::env::var("MOTHERDUCK_TOKEN") {
            // Validate token format (basic check for obviously malicious content)
            if token.len() > 1000 || token.contains('\0') {
                debug!("Skipping MotherDuck token - suspicious format detected");
                return;
            }
            
            // Escape the token properly to prevent injection
            let escaped = token.replace('\'', "''");
            
            // Try to load the extension (idempotent); ignore errors if not installed
            let _ = self.connection.execute("LOAD motherduck", []);
            
            // Set the token securely
            let _ = self
                .connection
                .execute(&format!("SET motherduck_token='{}'", escaped), []);
            let _ = self
                .connection
                .execute(&format!("SET motherduck_secret='{}'", escaped), []);
        }
    }

    fn execute_sql(&mut self, sql: &str, params: &[serde_json::Value]) -> Result<QueryResult> {
        // Ensure MotherDuck session settings are applied if token is present in the environment.
        // We do this per execute to cover all connections; errors are ignored to avoid noise
        // if the extension is not loaded or the setting is unknown.
        self.apply_motherduck_settings();

        // Build the final SQL with escaped parameters if any are provided
        let final_sql = if !params.is_empty() {
            sql_sanitizer::build_parameterized_query(sql, params)?
        } else {
            sql.to_string()
        };

        // Classify the SQL statement
        let classified = ClassifiedSqlStatement::classify(&final_sql);
        
        if !classified.returns_result_set {
            // For DDL/DML that don't return results
            // Note: final_sql already has parameters escaped
            self.connection.execute(&final_sql, []).map_err(|e| {
                crate::errors::DuckDBError::QueryError {
                    message: e.to_string(),
                    sql: Some(sql.to_string()), // Return original SQL for error reporting
                    error_code: None,
                    line_number: None,
                }
            })?;
            
            // Return empty result
            Ok(QueryResult {
                rows: vec![],
                columns: vec![],
                row_count: 0,
                execution_time_ms: 0,
            })
        } else {
            // For queries that return results
            // Use prepare_arrow for Arrow interface
            use duckdb::arrow::array::Array;
            
            // Note: final_sql already has parameters escaped
            let mut stmt = self.connection.prepare(&final_sql).map_err(|e| {
                crate::errors::DuckDBError::QueryError {
                    message: e.to_string(),
                    sql: Some(sql.to_string()), // Return original SQL for error reporting
                    error_code: None,
                    line_number: None,
                }
            })?;
            
            // Use query_arrow on the prepared statement
            // Parameters are already escaped in final_sql
            let arrow_result = stmt.query_arrow([]).map_err(|e| {
                crate::errors::DuckDBError::QueryError {
                    message: e.to_string(),
                    sql: Some(sql.to_string()), // Return original SQL for error reporting
                    error_code: None,
                    line_number: None,
                }
            })?;
            
            let mut all_rows = Vec::new();
            let mut columns_info = Vec::new();
            let mut first_batch = true;
            
            for batch in arrow_result {
                // batch is already a RecordBatch, not a Result
                
                // Get column info from the first batch
                if first_batch {
                    let schema = batch.schema();
                    for field in schema.fields() {
                        columns_info.push(ColumnInfo {
                            name: field.name().to_string(),
                            type_name: format!("{:?}", field.data_type()),
                            nullable: field.is_nullable(),
                        });
                    }
                    first_batch = false;
                }
                
                // Convert each row in the batch
                for row_idx in 0..batch.num_rows() {
                    let mut row_map = HashMap::new();
                    
                    for (col_idx, column) in batch.columns().iter().enumerate() {
                        let col_name = batch.schema().field(col_idx).name().to_string();
                        
                        // Convert Arrow value to JSON
                        let json_value = if column.is_null(row_idx) {
                            serde_json::Value::Null
                        } else {
                            // Use Arrow's Display trait for simple conversion
                            // This is a simplified approach - in production you'd handle each type properly
                            use duckdb::arrow::array::{
                                StringArray, Int32Array, Int64Array, Float32Array, Float64Array, BooleanArray,
                                Int8Array, Int16Array, UInt8Array, UInt16Array, UInt32Array, UInt64Array
                            };
                            
                            if let Some(arr) = column.as_any().downcast_ref::<StringArray>() {
                                serde_json::Value::String(arr.value(row_idx).to_string())
                            } else if let Some(arr) = column.as_any().downcast_ref::<BooleanArray>() {
                                serde_json::Value::Bool(arr.value(row_idx))
                            } else if let Some(arr) = column.as_any().downcast_ref::<Int8Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<Int16Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<Int32Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<Int64Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<UInt8Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<UInt16Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<UInt32Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<UInt64Array>() {
                                serde_json::Value::Number(arr.value(row_idx).into())
                            } else if let Some(arr) = column.as_any().downcast_ref::<Float32Array>() {
                                serde_json::json!(arr.value(row_idx))
                            } else if let Some(arr) = column.as_any().downcast_ref::<Float64Array>() {
                                serde_json::json!(arr.value(row_idx))
                            } else {
                                // Fallback: use debug representation
                                serde_json::Value::String(format!("unsupported_type"))
                            }
                        };
                        
                        row_map.insert(col_name, json_value);
                    }
                    
                    all_rows.push(row_map);
                }
            }
            
            let row_count = all_rows.len();
            
            Ok(QueryResult {
                rows: all_rows,
                columns: columns_info,
                row_count,
                execution_time_ms: 0,
            })
        }
    }
}

/// Handle to communicate with a connection thread
#[derive(Clone, Debug)]
pub struct ConnectionHandle {
    sender: mpsc::Sender<ConnectionCommand>,
    last_activity: Arc<Mutex<Instant>>,
}

impl ConnectionHandle {
    /// Execute SQL on this connection with optional parameters
    pub async fn execute(&self, sql: String, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        // Update last activity time
        {
            let mut last_activity = self.last_activity.lock().await;
            *last_activity = Instant::now();
        }
        
        let (response_tx, response_rx) = oneshot::channel();
        
        self.sender.send(ConnectionCommand::Execute {
            sql,
            params,
            response: response_tx,
        }).await.map_err(|_| DuckDBError::ConnectionError {
            message: "Connection thread has terminated".to_string(),
            context: None,
        })?;
        
        response_rx.await.map_err(|_| DuckDBError::ConnectionError {
            message: "Failed to receive response from connection thread".to_string(),
            context: None,
        })?
    }
    
    /// Check if this connection has been idle for longer than the timeout
    pub async fn is_idle(&self, timeout: Duration) -> bool {
        let last_activity = self.last_activity.lock().await;
        last_activity.elapsed() > timeout
    }
    
    /// Close this connection
    pub async fn close(self) -> Result<()> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.sender.send(ConnectionCommand::Close {
            response: response_tx,
        }).await.map_err(|_| DuckDBError::ConnectionError {
            message: "Connection thread has already terminated".to_string(),
            context: None,
        })?;
        
        response_rx.await.map_err(|_| DuckDBError::ConnectionError {
            message: "Failed to receive close confirmation".to_string(),
            context: None,
        })?
    }
}

/// Manages persistent DuckDB connections, each in their own thread
#[derive(Debug)]
pub struct ThreadSafeConnectionManager {
    connections: Arc<Mutex<HashMap<String, ConnectionHandle>>>,
    #[allow(dead_code)]
    cleanup_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl ThreadSafeConnectionManager {
    pub fn new() -> Self {
        let manager = Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            cleanup_handle: Arc::new(Mutex::new(None)),
        };
        
        // Start the cleanup task
        manager.start_cleanup_task();
        manager
    }
    
    /// Start a background task to clean up idle connections
    fn start_cleanup_task(&self) {
        let connections = self.connections.clone();
        let cleanup_handle = self.cleanup_handle.clone();
        
        let handle = tokio::spawn(async move {
            let idle_timeout = Duration::from_secs(300); // 5 minute idle timeout
            let check_interval = Duration::from_secs(60); // Check every minute
            
            loop {
                tokio::time::sleep(check_interval).await;
                
                let mut conns = connections.lock().await;
                let mut to_remove = Vec::new();
                
                // Check for idle connections
                for (id, handle) in conns.iter() {
                    if handle.is_idle(idle_timeout).await {
                        to_remove.push(id.clone());
                    }
                }
                
                // Remove and close idle connections
                for id in to_remove {
                    if let Some(handle) = conns.remove(&id) {
                        let _ = handle.close().await;
                    }
                }
            }
        });
        
        // Store the cleanup handle - must use async lock here
        tokio::spawn(async move {
            let mut cleanup = cleanup_handle.lock().await;
            *cleanup = Some(handle);
        });
    }

    /// Create a new connection with the given ID, running in its own thread
    pub async fn create_connection(&self, connection_id: String, conn: Connection) -> Result<()> {
        let (tx, rx) = mpsc::channel(10);
        let handle = ConnectionHandle { 
            sender: tx,
            last_activity: Arc::new(Mutex::new(Instant::now())),
        };
        
        // Store the handle
        let mut connections = self.connections.lock().await;
        if connections.contains_key(&connection_id) {
            return Err(DuckDBError::ConnectionError {
                message: format!("Connection {} already exists", connection_id),
                context: None,
            });
        }
        connections.insert(connection_id.clone(), handle);
        drop(connections);
        
        // Spawn a dedicated thread for this connection
        std::thread::spawn(move || {
            debug!("Starting thread for connection {}", connection_id);
            let handler = ConnectionHandler::new(conn, rx);
            handler.run();
            debug!("Thread for connection {} terminated", connection_id);
        });
        
        Ok(())
    }

    /// Get a connection handle by ID
    pub async fn get_connection(&self, connection_id: &str) -> Result<ConnectionHandle> {
        let connections = self.connections.lock().await;
        connections.get(connection_id)
            .cloned()
            .ok_or_else(|| DuckDBError::ConnectionError {
                message: format!("Connection {} not found", connection_id),
                context: None,
            })
    }

    /// Remove and close a connection
    pub async fn close_connection(&self, connection_id: &str) -> Result<()> {
        let mut connections = self.connections.lock().await;
        let handle = connections.remove(connection_id)
            .ok_or_else(|| DuckDBError::ConnectionError {
                message: format!("Connection {} not found", connection_id),
                context: None,
            })?;
        
        drop(connections);
        handle.close().await
    }
}
