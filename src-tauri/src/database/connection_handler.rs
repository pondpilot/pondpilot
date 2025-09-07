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
// Arrow array types used for value downcasting
use duckdb::arrow::array::{
    Array, BinaryArray, BooleanArray, Date32Array, Date64Array, Decimal128Array, Float32Array,
    Float64Array, Int16Array, Int32Array, Int64Array, Int8Array, LargeBinaryArray,
    LargeStringArray, StringArray, TimestampMicrosecondArray, TimestampMillisecondArray,
    TimestampNanosecondArray, UInt16Array, UInt32Array, UInt64Array, UInt8Array,
};
use tracing::debug;
use chrono::{NaiveDate, NaiveDateTime, Duration as ChronoDuration, Utc, TimeZone};
use base64::Engine;

/// Commands that can be sent to a connection thread
#[derive(Debug)]
enum ConnectionCommand {
    Execute {
        sql: String,
        params: Vec<serde_json::Value>,
        response: oneshot::Sender<Result<QueryResult>>,
        timeout_ms: Option<u64>,
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
                ConnectionCommand::Execute { sql, params, response, timeout_ms } => {
                    let result = if let Some(timeout) = timeout_ms {
                        self.execute_sql_with_timeout(&sql, &params, timeout)
                    } else {
                        self.execute_sql(&sql, &params)
                    };
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
    
    /// Execute SQL with a timeout using a separate thread
    fn execute_sql_with_timeout(&mut self, sql: &str, params: &[serde_json::Value], timeout_ms: u64) -> Result<QueryResult> {
        use std::time::Duration;
        
        // Clone what we need for the thread
        let sql_owned = sql.to_string();
        let params_owned = params.to_vec();
        
        // We can't move the connection to another thread, so we need to execute inline
        // and use a timeout on receiving the result. This is a limitation of DuckDB's
        // connection not being Send.
        
        // For now, we'll execute synchronously but with a warning if it takes too long
        let start = std::time::Instant::now();
        let result = self.execute_sql(&sql_owned, &params_owned);
        let elapsed = start.elapsed();
        
        if elapsed > Duration::from_millis(timeout_ms) {
            debug!("[ConnectionHandler] Query exceeded timeout of {}ms (took {}ms) but couldn't be cancelled", 
                   timeout_ms, elapsed.as_millis());
            // In the future, we could integrate with DuckDB's interrupt mechanism
            // For now, we return the result even if it took too long
        }
        
        result
    }

    /// Apply MotherDuck settings in a secure way
    fn apply_motherduck_settings(&mut self) {
        // Only apply settings if token is present
        if let Ok(token) = std::env::var("MOTHERDUCK_TOKEN") {
            debug!("[MotherDuck] Token found in environment");
            
            // Validate token format
            if !Self::is_valid_token(&token) {
                debug!("[MotherDuck] Skipping token - invalid format detected");
                return;
            }
            
            // Try to load the extension (idempotent); ignore errors if not installed
            if let Err(e) = self.connection.execute("LOAD motherduck", []) {
                debug!("[MotherDuck] Failed to load extension: {}", e);
            } else {
                debug!("[MotherDuck] Extension loaded successfully");
            }
            
            // Rely on MOTHERDUCK_TOKEN env var; some versions require the token
            // to be set at initialization and reject SET after init.
            // The extension reads the environment token when needed.
            debug!("[MotherDuck] Using environment token (no SET)");
        } else {
            debug!("[MotherDuck] No MOTHERDUCK_TOKEN found in environment");
        }
    }
    
    /// Validate token format to prevent injection attempts
    fn is_valid_token(token: &str) -> bool {
        // Check basic constraints
        if token.is_empty() || token.len() > 1000 {
            return false;
        }
        
        // Check for null bytes or control characters
        if token.chars().any(|c| c.is_control() || c == '\0') {
            return false;
        }
        
        // MotherDuck tokens typically follow a specific format
        // They should only contain alphanumeric chars, hyphens, underscores, and dots
        token.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    }
    
    /// Set MotherDuck token using the safest available method
    fn set_motherduck_token(&mut self, token: &str) -> std::result::Result<(), Box<dyn std::error::Error>> {
        // First, clear any existing token to ensure we're not using a cached value
        let _ = self.connection.execute("RESET motherduck_token", []);

        // Double-escape single quotes as a last resort safety measure
        // This is still not ideal, but combined with validation it's safer
        let escaped = token.replace('\'', "''");

        // Modern MotherDuck extension uses `motherduck_token`.
        // Older aliases like `motherduck_secret` may not exist; avoid setting them to prevent errors.
        // If setting fails (unexpected), return an error so caller can log debug info.
        self.connection
            .execute(&format!("SET motherduck_token='{}'", escaped), [])?;

        Ok(())
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
                        let schema = batch.schema();
                        let field = schema.field(col_idx);
                        let col_name = field.name().to_string();
                        let dtype_owned = field.data_type().clone();

                        // Special-case TIME first to avoid incorrect null bitmaps
                        let json_value = match dtype_owned {
                            duckdb::arrow::datatypes::DataType::Time32(duckdb::arrow::datatypes::TimeUnit::Second) => {
                                if column.is_null(row_idx) {
                                    serde_json::Value::Null
                                } else if let Some(arr) = column.as_any().downcast_ref::<Int32Array>() {
                                    if !arr.is_null(row_idx) {
                                        let secs = arr.value(row_idx) as i64;
                                        serde_json::Value::String(format_time_hhmmss(secs, 0))
                                    } else {
                                        serde_json::Value::Null
                                    }
                                } else {
                                    serde_json::Value::String("".to_string())
                                }
                            }
                            duckdb::arrow::datatypes::DataType::Time32(duckdb::arrow::datatypes::TimeUnit::Millisecond) => {
                                if column.is_null(row_idx) {
                                    serde_json::Value::Null
                                } else if let Some(arr) = column.as_any().downcast_ref::<Int32Array>() {
                                    if !arr.is_null(row_idx) {
                                        let ms = arr.value(row_idx) as i64;
                                        serde_json::Value::String(format_time_from_frac(ms, 1_000))
                                    } else {
                                        serde_json::Value::Null
                                    }
                                } else {
                                    serde_json::Value::String("".to_string())
                                }
                            }
                            duckdb::arrow::datatypes::DataType::Time64(duckdb::arrow::datatypes::TimeUnit::Microsecond) => {
                                if column.is_null(row_idx) {
                                    serde_json::Value::Null
                                } else if let Some(arr) = column.as_any().downcast_ref::<Int64Array>() {
                                    if !arr.is_null(row_idx) {
                                        let us = arr.value(row_idx);
                                        serde_json::Value::String(format_time_from_frac(us, 1_000_000))
                                    } else {
                                        serde_json::Value::Null
                                    }
                                } else {
                                    serde_json::Value::String("".to_string())
                                }
                            }
                            duckdb::arrow::datatypes::DataType::Time64(duckdb::arrow::datatypes::TimeUnit::Nanosecond) => {
                                if column.is_null(row_idx) {
                                    serde_json::Value::Null
                                } else if let Some(arr) = column.as_any().downcast_ref::<Int64Array>() {
                                    if !arr.is_null(row_idx) {
                                        let ns = arr.value(row_idx);
                                        serde_json::Value::String(format_time_from_frac(ns, 1_000_000_000))
                                    } else {
                                        serde_json::Value::Null
                                    }
                                } else {
                                    serde_json::Value::String("".to_string())
                                }
                            }
                            _ => {
                                // Convert Arrow value to JSON
                                if column.is_null(row_idx) {
                                    serde_json::Value::Null
                                } else {
                                    // Use Arrow array downcasts for robust conversion of common types
                            
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
                                // Remaining logical types
                                if let Some(arr) = column.as_any().downcast_ref::<LargeStringArray>() {
                                    serde_json::Value::String(arr.value(row_idx).to_string())
                                } else if let Some(arr) = column.as_any().downcast_ref::<Date32Array>() {
                                    // days since epoch
                                    let days = arr.value(row_idx);
                                    serde_json::Value::String(format_date_from_days(days))
                                } else if let Some(arr) = column.as_any().downcast_ref::<Date64Array>() {
                                    // ms since epoch -> date
                                    let ms = arr.value(row_idx);
                                    serde_json::Value::String(format_date_from_millis(ms))
                                } else if let Some(arr) = column.as_any().downcast_ref::<TimestampMillisecondArray>() {
                                    let v = arr.value(row_idx);
                                    serde_json::Value::String(format_timestamp_millis(v))
                                } else if let Some(arr) = column.as_any().downcast_ref::<TimestampMicrosecondArray>() {
                                    let v = arr.value(row_idx);
                                    serde_json::Value::String(format_timestamp_micros(v))
                                } else if let Some(arr) = column.as_any().downcast_ref::<TimestampNanosecondArray>() {
                                    let v = arr.value(row_idx);
                                    serde_json::Value::String(format_timestamp_nanos(v))
                                } else if let Some(arr) = column.as_any().downcast_ref::<BinaryArray>() {
                                    let bytes = arr.value(row_idx);
                                    serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(bytes))
                                } else if let Some(arr) = column.as_any().downcast_ref::<LargeBinaryArray>() {
                                    let bytes = arr.value(row_idx);
                                    serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(bytes))
                                } else if let Some(arr) = column.as_any().downcast_ref::<Decimal128Array>() {
                                    // Format decimal according to scale from schema
                                    let schema2 = batch.schema();
                                    let field2 = schema2.field(col_idx);
                                    let dtype2 = field2.data_type();
                                    let (_p, scale) = match dtype2 {
                                        duckdb::arrow::datatypes::DataType::Decimal128(p, s) => (*p, *s),
                                        _ => (38, 0),
                                    };
                                    let raw = arr.value(row_idx);
                                    let s = format_decimal_128(raw, scale as i32);
                                    serde_json::Value::String(s)
                                } else {
                                    // Fallback: mark unsupported logical type
                                    serde_json::Value::String("unsupported_type".to_string())
                                }
                            }
                        }}};
                        
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

    /// Helper to format time from seconds and nanoseconds as HH:MM:SS[.fraction]
    fn format_time_parts(hours: i64, minutes: i64, seconds: i64, nanos: i64) -> String {
        if nanos > 0 {
            // Trim trailing zeros from fractional seconds
            let frac = format!("{:09}", nanos).trim_end_matches('0').to_string();
            format!("{:02}:{:02}:{:02}.{}", hours, minutes, seconds, frac)
        } else {
            format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
        }
    }
}

/// Format time given total seconds and nanoseconds since midnight
fn format_time_hhmmss(total_seconds: i64, nanos: i64) -> String {
    let secs_in_day = 24 * 3600;
    let total_seconds = total_seconds % secs_in_day;
    let h = total_seconds / 3600;
    let m = (total_seconds % 3600) / 60;
    let s = total_seconds % 60;
    ConnectionHandler::format_time_parts(h, m, s, nanos)
}

/// Format time from a fractional count since midnight with given denominator
/// For example, ms with denom=1000, us with denom=1_000_000, ns with denom=1_000_000_000
fn format_time_from_frac(value: i64, denom: i64) -> String {
    // Add bounds checking to prevent overflow
    const MAX_SECONDS_IN_DAY: i64 = 24 * 3600;
    
    let secs = value / denom;
    let remainder = value % denom;
    
    // Ensure we're within a valid day range
    let normalized_secs = secs % MAX_SECONDS_IN_DAY;
    
    // Ensure remainder is positive for proper nanosecond calculation
    let abs_remainder = remainder.abs();
    // Convert remainder to nanoseconds with overflow protection
    let nanos = match denom {
        1_000 => abs_remainder.saturating_mul(1_000_000),
        1_000_000 => abs_remainder.saturating_mul(1_000),
        1_000_000_000 => abs_remainder,
        _ => 0,
    };
    format_time_hhmmss(normalized_secs, nanos)
}

fn format_date_from_days(days_since_epoch: i32) -> String {
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
    let date = epoch + ChronoDuration::days(days_since_epoch as i64);
    date.format("%Y-%m-%d").to_string()
}

fn format_date_from_millis(ms_since_epoch: i64) -> String {
    // Compute date portion from milliseconds since epoch (UTC)
    if let Some(ndt) = NaiveDateTime::from_timestamp_millis(ms_since_epoch) {
        ndt.date().format("%Y-%m-%d").to_string()
    } else {
        "1970-01-01".to_string()
    }
}

fn format_timestamp_millis(ms_since_epoch: i64) -> String {
    if let Some(ndt) = NaiveDateTime::from_timestamp_millis(ms_since_epoch) {
        let dt = Utc.from_utc_datetime(&ndt);
        dt.format("%Y-%m-%dT%H:%M:%S%.fZ").to_string()
    } else {
        "1970-01-01T00:00:00Z".to_string()
    }
}

fn format_timestamp_micros(us_since_epoch: i64) -> String {
    let secs = us_since_epoch / 1_000_000;
    let micros = us_since_epoch % 1_000_000;
    // Ensure micros is positive before conversion
    let abs_micros = micros.abs() as u32;
    let nanos = abs_micros * 1_000; // convert to ns
    if let Some(ndt) = NaiveDateTime::from_timestamp_opt(secs, nanos) {
        let dt = Utc.from_utc_datetime(&ndt);
        dt.format("%Y-%m-%dT%H:%M:%S%.fZ").to_string()
    } else {
        "1970-01-01T00:00:00Z".to_string()
    }
}

fn format_timestamp_nanos(ns_since_epoch: i64) -> String {
    let secs = ns_since_epoch / 1_000_000_000;
    let nanos = ns_since_epoch % 1_000_000_000;
    // Ensure nanos is positive (must be in range [0, 999_999_999])
    let abs_nanos = nanos.abs() as u32;
    if let Some(ndt) = NaiveDateTime::from_timestamp_opt(secs, abs_nanos) {
        let dt = Utc.from_utc_datetime(&ndt);
        dt.format("%Y-%m-%dT%H:%M:%S%.fZ").to_string()
    } else {
        "1970-01-01T00:00:00Z".to_string()
    }
}

fn format_decimal_128(value: i128, scale: i32) -> String {
    if scale <= 0 {
        return value.to_string();
    }
    
    // Add bounds checking for scale to prevent panic
    // DuckDB max decimal scale is 38
    const MAX_SCALE: i32 = 38;
    let safe_scale = scale.min(MAX_SCALE);
    
    let negative = value < 0;
    let abs = if negative { 
        // Handle i128::MIN edge case
        value.checked_neg().unwrap_or(i128::MAX)
    } else { 
        value 
    };
    
    // Use checked_pow to prevent panic on large scale values
    let denom = match 10_i128.checked_pow(safe_scale as u32) {
        Some(d) => d,
        None => {
            // Scale too large, fallback to string representation
            return value.to_string();
        }
    };
    
    let int_part = abs / denom;
    let frac_part = (abs % denom) as i128;
    let mut frac_str = format!("{:0width$}", frac_part, width = safe_scale as usize);
    // Trim trailing zeros for readability
    while frac_str.ends_with('0') && frac_str.len() > 1 {
        frac_str.pop();
    }
    format!("{}{}.{}", if negative { "-" } else { "" }, int_part, frac_str)
}

// Note: Removed unused interval/duration formatting functions
// These were not being called anywhere in the codebase

/// Handle to communicate with a connection thread
#[derive(Clone, Debug)]
pub struct ConnectionHandle {
    sender: mpsc::Sender<ConnectionCommand>,
    last_activity: Arc<Mutex<Instant>>,
}

impl ConnectionHandle {
    /// Execute SQL on this connection with optional parameters
    pub async fn execute(&self, sql: String, params: Vec<serde_json::Value>) -> Result<QueryResult> {
        self.execute_with_timeout(sql, params, None).await
    }
    
    /// Execute SQL on this connection with optional parameters and timeout
    pub async fn execute_with_timeout(&self, sql: String, params: Vec<serde_json::Value>, timeout_ms: Option<u64>) -> Result<QueryResult> {
        // Update last activity time
        {
            let mut last_activity = self.last_activity.lock().await;
            *last_activity = Instant::now();
        }
        
        let (response_tx, response_rx) = oneshot::channel();
        
        let sql_clone = sql.clone();
        self.sender.send(ConnectionCommand::Execute {
            sql,
            params,
            response: response_tx,
            timeout_ms,
        }).await.map_err(|_| DuckDBError::ConnectionError {
            message: "Connection thread has terminated".to_string(),
            context: None,
        })?;
        
        // Apply timeout on the response channel if specified
        if let Some(timeout) = timeout_ms {
            match tokio::time::timeout(Duration::from_millis(timeout), response_rx).await {
                Ok(Ok(result)) => result,
                Ok(Err(_)) => Err(DuckDBError::ConnectionError {
                    message: "Failed to receive response from connection thread".to_string(),
                    context: None,
                }),
                Err(_) => Err(DuckDBError::QueryError {
                    message: format!("Query execution timed out after {}ms", timeout),
                    sql: Some(sql_clone),
                    error_code: Some("TIMEOUT".to_string()),
                    line_number: None,
                }),
            }
        } else {
            response_rx.await.map_err(|_| DuckDBError::ConnectionError {
                message: "Failed to receive response from connection thread".to_string(),
                context: None,
            })?
        }
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
    
    /// Get all connection handles (used for applying attachments to all connections)
    pub async fn get_all_connections(&self) -> Vec<(String, ConnectionHandle)> {
        let connections = self.connections.lock().await;
        connections.iter().map(|(id, handle)| (id.clone(), handle.clone())).collect()
    }
    
    /// Reset all connections (closes and removes all existing connections)
    pub async fn reset_all_connections(&self) -> Result<()> {
        let mut connections = self.connections.lock().await;
        
        // Collect all connection IDs and handles
        let all_handles: Vec<(String, ConnectionHandle)> = connections
            .drain()
            .collect();
        
        drop(connections);
        
        // Close all connections
        for (id, handle) in all_handles {
            debug!("Closing connection {} during reset", id);
            if let Err(e) = handle.close().await {
                debug!("Failed to close connection {}: {:?}", id, e);
                // Continue closing other connections even if one fails
            }
        }
        
        debug!("All connections have been reset");
        Ok(())
    }
}
