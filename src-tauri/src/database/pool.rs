use crate::errors::{DuckDBError, Result};
use duckdb::Connection;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;
use std::path::PathBuf;
use std::fs;
use std::collections::HashMap;
use std::time::Instant;

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
    
    // Semaphore to limit concurrent queries (prevent starvation)
    query_semaphore: Arc<Semaphore>,
    
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
    pub fn new(_size: u32, db_path: PathBuf) -> Result<Self> {
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
        
        Ok(Self {
            connection: Arc::new(Mutex::new(conn)),
            query_semaphore: Arc::new(Semaphore::new(10)), // Allow up to 10 concurrent queries
            is_healthy: Arc::new(Mutex::new(true)),
            attached_databases: Arc::new(Mutex::new(HashMap::new())),
            loaded_extensions: Arc::new(Mutex::new(Vec::new())),
            db_path,
        })
    }

    pub fn get(&self) -> Result<Connection> {
        // This method is synchronous but returns a new connection
        // This is a temporary compatibility layer - the real solution is to use execute_with_retry
        Connection::open(&self.db_path).map_err(|e| DuckDBError::ConnectionError {
            message: format!("Failed to open database connection: {}", e),
        })
    }
    
    pub async fn execute<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        // Acquire semaphore permit
        let _permit = self.query_semaphore.acquire().await
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Failed to acquire query permit: {}", e),
            })?;
        
        // Check health
        let needs_recovery = {
            let healthy = self.is_healthy.lock().unwrap();
            !*healthy
        };
        
        if needs_recovery {
            self.recover_connection().await?;
        }
        
        // Execute query with lock
        let conn_arc = Arc::clone(&self.connection);
        
        // Execute in blocking task since DuckDB operations are blocking
        let result = tokio::task::spawn_blocking(move || {
            let mut conn = conn_arc.lock().unwrap();
            f(&mut *conn)
        }).await
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Task execution error: {}", e),
            })?;
        
        result
    }
    
    pub async fn execute_with_retry<T, F>(&self, f: F) -> Result<T>
    where
        F: Fn(&mut Connection) -> Result<T> + Send + Clone + 'static,
        T: Send + 'static,
    {
        let mut retries = 0;
        
        loop {
            match self.execute(f.clone()).await {
                Ok(result) => return Ok(result),
                Err(e) if retries < 3 && self.is_recoverable_error(&e) => {
                    eprintln!("Recoverable error encountered, attempting recovery: {}", e);
                    self.recover_connection().await?;
                    retries += 1;
                }
                Err(e) => return Err(e),
            }
        }
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
}