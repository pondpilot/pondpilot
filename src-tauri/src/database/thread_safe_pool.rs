use crate::errors::{DuckDBError, Result};
use crate::system_resources::{calculate_resource_limits, ResourceLimits};
use duckdb::Connection;
use std::sync::Arc;
use tokio::sync::Semaphore;
use std::path::PathBuf;
use std::fs;
use std::time::Duration;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Thread-safe connection pool that respects DuckDB's thread safety requirements
/// 
/// Key design principles:
/// 1. Connections are NEVER shared between threads
/// 2. Each blocking task creates its own connection
/// 3. The pool only tracks connection count, not actual connections
/// 4. Connections are created in the thread where they will be used
#[derive(Debug)]
pub struct ThreadSafePool {
    /// Path to the database file
    db_path: PathBuf,
    /// Semaphore to limit total connections
    connection_permits: Arc<Semaphore>,
    /// Semaphore to limit concurrent streaming operations
    streaming_permits: Arc<Semaphore>,
    /// Configuration
    config: PoolConfig,
    /// Resource limits
    resource_limits: ResourceLimits,
    /// Connection counter for debugging
    connection_counter: Arc<AtomicUsize>,
}

#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub max_connections: usize,
    pub max_streaming_connections: usize,
    pub acquire_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            max_streaming_connections: 4,
            acquire_timeout: Duration::from_secs(5),
        }
    }
}

/// Connection handle that ensures the permit is returned when dropped
pub struct ConnectionHandle {
    pub conn: Connection,
    pub id: String,
    _permit: tokio::sync::SemaphorePermit<'static>,
}

impl ThreadSafePool {
    pub fn new(db_path: PathBuf, config: PoolConfig) -> Result<Self> {
        // Ensure the parent directory exists
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let resource_limits = calculate_resource_limits();
        
        Ok(Self {
            db_path,
            connection_permits: Arc::new(Semaphore::new(config.max_connections)),
            streaming_permits: Arc::new(Semaphore::new(config.max_streaming_connections)),
            config,
            resource_limits,
            connection_counter: Arc::new(AtomicUsize::new(0)),
        })
    }

    /// Acquire a permit to create a connection
    /// The actual connection MUST be created in the thread where it will be used
    pub async fn acquire_connection_permit(&self) -> Result<ConnectionPermit> {
        match tokio::time::timeout(
            self.config.acquire_timeout,
            self.connection_permits.clone().acquire_owned()
        ).await {
            Ok(Ok(permit)) => {
                let id = format!("conn-{}", self.connection_counter.fetch_add(1, Ordering::SeqCst));
                eprintln!("[THREAD_SAFE_POOL] Acquired permit for connection: {}", id);
                Ok(ConnectionPermit {
                    permit,
                    id,
                    db_path: self.db_path.clone(),
                    resource_limits: self.resource_limits.clone(),
                })
            }
            Ok(Err(_)) => Err(DuckDBError::ConnectionError {
                message: "Failed to acquire connection permit".to_string(),
            }),
            Err(_) => Err(DuckDBError::ConnectionError {
                message: format!("Connection pool timeout after {:?}", self.config.acquire_timeout),
            }),
        }
    }

    /// Acquire a permit for streaming operations
    pub async fn acquire_streaming_permit(&self) -> Result<StreamingPermit> {
        match self.streaming_permits.clone().acquire_owned().await {
            Ok(permit) => Ok(StreamingPermit { _permit: permit }),
            Err(_) => Err(DuckDBError::ConnectionError {
                message: "Failed to acquire streaming permit".to_string(),
            }),
        }
    }

    /// Execute a query in a blocking context with a fresh connection
    pub async fn execute_with_connection<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(Connection) -> Result<R> + Send + 'static,
        R: Send + 'static,
    {
        let permit = self.acquire_connection_permit().await?;
        
        tokio::task::spawn_blocking(move || {
            // Create the connection in this thread
            let conn = permit.create_connection()?;
            f(conn)
        })
        .await
        .map_err(|e| DuckDBError::ConnectionError {
            message: format!("Task join error: {}", e),
        })?
    }
}

/// Permit to create a connection
pub struct ConnectionPermit {
    permit: tokio::sync::OwnedSemaphorePermit,
    id: String,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
}

impl ConnectionPermit {
    /// Create a connection in the current thread
    /// This MUST be called from the thread where the connection will be used
    pub fn create_connection(self) -> Result<Connection> {
        eprintln!("[THREAD_SAFE_POOL] Creating connection {} in thread {:?}", 
                 self.id, std::thread::current().id());
        
        let conn = Connection::open(&self.db_path)
            .map_err(|e| DuckDBError::ConnectionError {
                message: format!("Failed to create connection: {}", e),
            })?;

        // Configure the connection
        let config = format!(
            "PRAGMA threads={};
            PRAGMA memory_limit='{}';
            PRAGMA enable_progress_bar=true;",
            self.resource_limits.pool_threads,
            self.resource_limits.pool_memory
        );
        conn.execute_batch(&config).ok();

        Ok(conn)
    }
}

/// Permit for streaming operations
pub struct StreamingPermit {
    _permit: tokio::sync::OwnedSemaphorePermit,
}