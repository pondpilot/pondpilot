use crate::errors::{DuckDBError, Result};
use duckdb::Connection;
use std::sync::{Arc, Mutex};
use tokio::sync::{Semaphore, Mutex as TokioMutex};
use std::path::PathBuf;
use std::fs;
use std::collections::{HashMap, VecDeque};
use std::time::Instant;

// Wrapper that ensures connections are returned to the pool
pub struct PooledConnection {
    conn: Option<Connection>,
    pool: Arc<TokioMutex<VecDeque<Connection>>>,
}

impl PooledConnection {
    pub fn new(conn: Connection, pool: Arc<TokioMutex<VecDeque<Connection>>>) -> Self {
        Self {
            conn: Some(conn),
            pool,
        }
    }
    
    pub fn take(mut self) -> Connection {
        self.conn.take().expect("Connection already taken")
    }
}

impl Drop for PooledConnection {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            eprintln!("[POOL] PooledConnection dropped, returning connection to pool");
            let pool = self.pool.clone();
            // We can't do async in drop, so spawn a task
            tokio::spawn(async move {
                let mut available = pool.lock().await;
                available.push_back(conn);
                eprintln!("[POOL] Connection returned to pool ({} now available)", available.len());
            });
        }
    }
}

#[derive(Clone)]
struct AttachInfo {
    path: String,
    alias: String,
    read_only: bool,
    attached_at: Instant,
}

pub struct ConnectionPool {
    // Primary connection protected by standard Mutex (DuckDB Connection is not Send)
    connection: Arc<Mutex<Connection>>,
    
    // Pool of reusable connections
    available_connections: Arc<TokioMutex<VecDeque<Connection>>>,
    
    // Maximum number of connections
    max_connections: usize,
    
    // Current number of connections (including borrowed ones)
    current_connections: Arc<TokioMutex<usize>>,
    
    // Semaphore to limit concurrent queries (prevent starvation)
    query_semaphore: Arc<Semaphore>,
    
    // Semaphore to limit concurrent streaming connections
    streaming_semaphore: Arc<Semaphore>,
    
    // Track connection state
    is_healthy: Arc<Mutex<bool>>,
    
    // Track attached databases for recovery
    attached_databases: Arc<Mutex<HashMap<String, AttachInfo>>>,
    
    // Track loaded extensions for recovery
    loaded_extensions: Arc<Mutex<Vec<String>>>,
    
    // Connection configuration
    db_path: PathBuf,
}

impl ConnectionPool {
    pub fn new(size: u32, db_path: PathBuf) -> Result<Self> {
        // Ensure the parent directory exists
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }
        
        let conn = Connection::open(&db_path)?;
        
        // Configure connection for better performance
        conn.execute_batch("
            PRAGMA threads=4;
            PRAGMA memory_limit='4GB';
            PRAGMA enable_progress_bar=true;
        ").ok(); // Ignore errors for pragmas that might not be available
        
        // Pre-create some connections for the pool
        let mut available_connections = VecDeque::new();
        let max_connections = size.max(10) as usize; // Increase to 10 connections minimum
        
        eprintln!("[POOL] Creating connection pool with max {} connections", max_connections);
        
        // Pre-create more connections to avoid creation overhead
        let pre_create_count = 5; // Pre-create 5 connections
        for i in 0..pre_create_count {
            eprintln!("[POOL] Pre-creating connection {}/{}", i + 1, pre_create_count);
            match Connection::open(&db_path) {
                Ok(new_conn) => {
                    new_conn.execute_batch("
                        PRAGMA threads=2;
                        PRAGMA memory_limit='1GB';
                    ").ok();
                    available_connections.push_back(new_conn);
                    eprintln!("[POOL] Connection {} created successfully", i + 1);
                },
                Err(e) => {
                    eprintln!("[POOL] Failed to create connection {}: {}", i + 1, e);
                }
            }
        }
        
        let actual_pre_created = available_connections.len();
        eprintln!("[POOL] Pre-created {} connections", actual_pre_created);
        
        Ok(Self {
            connection: Arc::new(Mutex::new(conn)),
            available_connections: Arc::new(TokioMutex::new(available_connections)),
            max_connections,
            current_connections: Arc::new(TokioMutex::new(actual_pre_created + 1)), // +1 for primary
            query_semaphore: Arc::new(Semaphore::new(10)), // Allow up to 10 concurrent queries
            streaming_semaphore: Arc::new(Semaphore::new(4)), // Limit to 4 concurrent streaming connections
            is_healthy: Arc::new(Mutex::new(true)),
            attached_databases: Arc::new(Mutex::new(HashMap::new())),
            loaded_extensions: Arc::new(Mutex::new(Vec::new())),
            db_path,
        })
    }

    pub async fn get_pooled_connection(&self) -> Result<Connection> {
        eprintln!("[POOL] Getting connection from pool...");
        
        // First try to get an available connection
        {
            let mut available = self.available_connections.lock().await;
            if let Some(conn) = available.pop_front() {
                eprintln!("[POOL] Reusing existing connection from pool ({} remaining)", available.len());
                return Ok(conn);
            }
        }
        
        // Check if we can create a new connection
        let current_count = {
            let count = self.current_connections.lock().await;
            *count
        };
        
        if current_count < self.max_connections {
            eprintln!("[POOL] No available connections, creating new one (current: {}, max: {})", 
                     current_count, self.max_connections);
            
            let new_conn = Connection::open(&self.db_path)
                .map_err(|e| DuckDBError::ConnectionError {
                    message: format!("Failed to create new connection: {}", e),
                })?;
                
            // Configure the new connection
            new_conn.execute_batch("
                PRAGMA threads=2;
                PRAGMA memory_limit='1GB';
            ").ok();
            
            // Replicate attached databases
            {
                let attached_dbs = self.attached_databases.lock().unwrap();
                for (_, attach_info) in attached_dbs.iter() {
                    let read_only_flag = if attach_info.read_only { " (READ_ONLY)" } else { "" };
                    let attach_sql = format!(
                        "ATTACH '{}' AS {}{}", 
                        attach_info.path, 
                        attach_info.alias, 
                        read_only_flag
                    );
                    new_conn.execute(&attach_sql, []).ok();
                }
            }
            
            // Replicate loaded extensions
            {
                let loaded_exts = self.loaded_extensions.lock().unwrap();
                for ext in loaded_exts.iter() {
                    new_conn.execute(&format!("LOAD {}", ext), []).ok();
                }
            }
            
            // Increment the count AFTER successful creation
            {
                let mut count = self.current_connections.lock().await;
                *count += 1;
                eprintln!("[POOL] New connection created successfully (total connections: {})", *count);
            }
            
            return Ok(new_conn);
        }
        
        // Wait for a connection to become available with timeout
        eprintln!("[POOL] Pool exhausted, waiting for connection...");
        let wait_start = Instant::now();
        loop {
            // Check every 100ms
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            let mut available = self.available_connections.lock().await;
            if let Some(conn) = available.pop_front() {
                eprintln!("[POOL] Got connection after waiting {:?}", wait_start.elapsed());
                return Ok(conn);
            }
            
            // Timeout after 5 seconds
            if wait_start.elapsed() > std::time::Duration::from_secs(5) {
                break;
            }
        }
        
        Err(DuckDBError::ConnectionError {
            message: format!("Connection pool exhausted (max {} connections) and timeout waiting", self.max_connections),
        })
    }
    
    pub async fn return_connection(&self, conn: Connection) {
        eprintln!("[POOL] Returning connection to pool");
        let mut available = self.available_connections.lock().await;
        available.push_back(conn);
        eprintln!("[POOL] Connection returned ({} now available)", available.len());
        
        // Note: We don't decrement current_connections because the connection still exists
        // It's just moved from "in use" to "available"
    }
    
    pub fn get(&self) -> Result<Connection> {
        // Legacy synchronous method - creates a new connection every time
        // Should be replaced with get_pooled_connection where possible
        eprintln!("[POOL] WARNING: Using legacy get() method - creates new connection");
        Connection::open(&self.db_path).map_err(|e| DuckDBError::ConnectionError {
            message: format!("Failed to open database connection: {}", e),
        })
    }
    
    pub async fn execute<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let start = Instant::now();
        eprintln!("[POOL] execute() called, acquiring query semaphore permit...");
        eprintln!("[POOL] Available query permits: {}", self.query_semaphore.available_permits());
        
        // Acquire semaphore permit
        let _permit = self.query_semaphore.acquire().await
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Failed to acquire query permit: {}", e),
            })?;
        eprintln!("[POOL] Query semaphore permit acquired after {:?}", start.elapsed());
        
        // Check health
        let needs_recovery = {
            let healthy = self.is_healthy.lock().unwrap();
            !*healthy
        };
        
        if needs_recovery {
            eprintln!("[POOL] Connection needs recovery");
            self.recover_connection().await?;
        }
        
        // Execute query with lock
        let conn_arc = Arc::clone(&self.connection);
        
        eprintln!("[POOL] Spawning blocking task for query execution...");
        // Execute in blocking task since DuckDB operations are blocking
        let result = tokio::task::spawn_blocking(move || {
            eprintln!("[POOL] Inside blocking task, acquiring connection lock...");
            let conn_start = Instant::now();
            let mut conn = conn_arc.lock().unwrap();
            eprintln!("[POOL] Connection lock acquired after {:?}", conn_start.elapsed());
            let exec_result = f(&mut *conn);
            eprintln!("[POOL] Query execution finished, releasing connection lock");
            drop(conn);
            eprintln!("[POOL] Connection lock released");
            exec_result
        }).await
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Task execution error: {}", e),
            })?;
        
        eprintln!("[POOL] Blocking task completed after {:?}", start.elapsed());
        eprintln!("[POOL] Releasing query semaphore permit");
        drop(_permit);
        eprintln!("[POOL] Query semaphore permit released");
        
        result
    }
    
    pub async fn execute_with_retry<T, F>(&self, f: F) -> Result<T>
    where
        F: Fn(&mut Connection) -> Result<T> + Send + Clone + 'static,
        T: Send + 'static,
    {
        // Get a pooled connection
        eprintln!("[POOL] execute_with_retry getting pooled connection...");
        let mut conn = self.get_pooled_connection().await?;
        
        // No longer need pool clone since we return connection through tuple
        
        // Execute in blocking task
        let (result, conn) = tokio::task::spawn_blocking(move || {
            eprintln!("[POOL] Executing function on pooled connection");
            let result = f(&mut conn);
            eprintln!("[POOL] Function execution completed, returning connection with result");
            (result, conn)
        }).await
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Task execution error: {}", e),
            })?;
        
        // Return the connection to the pool
        eprintln!("[POOL] Returning connection to pool after execute_with_retry");
        self.return_connection(conn).await;
        
        // Return the result
        result
    }
    
    pub async fn execute_session_modifying_statement(&self, sql: &str) -> Result<()> {
        let sql_upper = sql.trim().to_uppercase();
        
        // Clone data for the closure
        let sql_owned = sql.to_string();
        
        // Execute the statement
        self.execute(move |conn| {
            conn.execute(&sql_owned, [])?;
            Ok(())
        }).await?;
        
        // Track the statement for recovery
        if sql_upper.starts_with("ATTACH") {
            // Parse ATTACH statement
            if let Ok(attach_info) = self.parse_attach_statement(sql) {
                let mut attached = self.attached_databases.lock().unwrap();
                attached.insert(attach_info.alias.clone(), attach_info);
            }
        } else if sql_upper.starts_with("DETACH") {
            // Parse DETACH statement to remove from tracking
            if let Some(alias) = self.parse_detach_statement(sql) {
                let mut attached = self.attached_databases.lock().unwrap();
                attached.remove(&alias);
            }
        } else if sql_upper.starts_with("LOAD") {
            // Track loaded extension
            if let Some(extension) = self.parse_load_statement(sql) {
                let mut extensions = self.loaded_extensions.lock().unwrap();
                if !extensions.contains(&extension) {
                    extensions.push(extension);
                }
            }
        }
        
        Ok(())
    }
    
    async fn recover_connection(&self) -> Result<()> {
        let mut conn = self.connection.lock().unwrap();
        let mut healthy = self.is_healthy.lock().unwrap();
        let attached = self.attached_databases.lock().unwrap().clone();
        let extensions = self.loaded_extensions.lock().unwrap().clone();
        
        eprintln!("Recovering connection...");
        
        // Recreate connection
        *conn = Connection::open(&self.db_path)?;
        
        // Re-apply configuration
        conn.execute_batch("
            PRAGMA threads=4;
            PRAGMA memory_limit='4GB';
            PRAGMA enable_progress_bar=true;
        ").ok();
        
        // Replay LOAD statements for extensions
        for extension in extensions.iter() {
            eprintln!("Re-loading extension: {}", extension);
            if let Err(e) = conn.execute(&format!("LOAD {}", extension), []) {
                eprintln!("Failed to reload extension {}: {}", extension, e);
            }
        }
        
        // Replay ATTACH statements
        for (_, info) in attached.iter() {
            let sql = format!(
                "ATTACH '{}' AS {} {}",
                info.path, info.alias,
                if info.read_only { "(READ_ONLY)" } else { "" }
            );
            eprintln!("Re-attaching database: {}", sql);
            if let Err(e) = conn.execute(&sql, []) {
                eprintln!("Failed to reattach database {}: {}", info.alias, e);
            }
        }
        
        *healthy = true;
        eprintln!("Connection recovery complete");
        
        Ok(())
    }
    
    fn is_recoverable_error(&self, error: &DuckDBError) -> bool {
        match error {
            DuckDBError::ConnectionError { message } => {
                message.contains("connection") || 
                message.contains("database is locked") ||
                message.contains("cannot operate on a closed database")
            }
            DuckDBError::QueryError { message, .. } => {
                message.contains("connection") || 
                message.contains("database is locked") ||
                message.contains("cannot operate on a closed database")
            }
            _ => false,
        }
    }
    
    fn parse_attach_statement(&self, sql: &str) -> Result<AttachInfo> {
        // Simple parser for ATTACH statements
        // Format: ATTACH 'path' AS alias (READ_ONLY)?
        let sql = sql.trim();
        let parts: Vec<&str> = sql.split_whitespace().collect();
        
        if parts.len() < 4 || parts[0].to_uppercase() != "ATTACH" || parts[2].to_uppercase() != "AS" {
            return Err(DuckDBError::InvalidOperation {
                message: "Invalid ATTACH statement format".to_string(),
            });
        }
        
        let path = parts[1].trim_matches('\'').trim_matches('"');
        let alias = parts[3];
        let read_only = sql.to_uppercase().contains("READ_ONLY");
        
        Ok(AttachInfo {
            path: path.to_string(),
            alias: alias.to_string(),
            read_only,
            attached_at: Instant::now(),
        })
    }
    
    fn parse_detach_statement(&self, sql: &str) -> Option<String> {
        // Simple parser for DETACH statements
        // Format: DETACH alias
        let parts: Vec<&str> = sql.trim().split_whitespace().collect();
        
        if parts.len() >= 2 && parts[0].to_uppercase() == "DETACH" {
            Some(parts[1].to_string())
        } else {
            None
        }
    }
    
    fn parse_load_statement(&self, sql: &str) -> Option<String> {
        // Simple parser for LOAD statements
        // Format: LOAD extension_name
        let parts: Vec<&str> = sql.trim().split_whitespace().collect();
        
        if parts.len() >= 2 && parts[0].to_uppercase() == "LOAD" {
            Some(parts[1].trim_matches('\'').trim_matches('"').to_string())
        } else {
            None
        }
    }
    
    pub fn get_streaming_semaphore(&self) -> Arc<Semaphore> {
        Arc::clone(&self.streaming_semaphore)
    }
    
    pub async fn create_streaming_connection(&self) -> Result<Connection> {
        eprintln!("[POOL] Getting streaming connection from pool...");
        
        // Try to get a connection from the pool instead of creating a new one
        self.get_pooled_connection().await
    }
}