use crate::errors::{DuckDBError, Result};
use crate::system_resources::{calculate_resource_limits, ResourceLimits};
use crate::database::connection_wrapper::SafeConnection;
use duckdb::Connection;
use std::sync::Arc;
use tokio::sync::{RwLock, Semaphore, Mutex as TokioMutex};
use std::path::PathBuf;
use std::fs;
use std::collections::VecDeque;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, Clone)]
pub struct PoolConfig {
    pub min_connections: usize,
    pub max_connections: usize,
    pub idle_timeout: Duration,
    pub acquire_timeout: Duration,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            min_connections: 2,
            max_connections: 10,
            idle_timeout: Duration::from_secs(300), // 5 minutes
            acquire_timeout: Duration::from_secs(5),
        }
    }
}

#[derive(Debug)]
pub struct StreamingConnection {
    pub conn: SafeConnection,
    pub id: String,
    pub created_at: Instant,
    pub state: Arc<RwLock<ConnectionState>>,
    pub hints: Arc<RwLock<ConnectionHints>>,
    pub db_path: PathBuf,
}

impl StreamingConnection {
    pub fn new(conn: Connection, id: String, db_path: PathBuf) -> Self {
        Self {
            conn: SafeConnection::new(conn),
            id,
            created_at: Instant::now(),
            state: Arc::new(RwLock::new(ConnectionState::Idle)),
            hints: Arc::new(RwLock::new(ConnectionHints::default())),
            db_path,
        }
    }
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Idle,
    Executing { 
        query_id: String, 
        started: Instant,
        cancel_token: CancellationToken,
    },
    Streaming { 
        stream_id: String, 
        started: Instant,
        memory_used: Arc<AtomicUsize>,
        cancel_token: CancellationToken,
    },
}

#[derive(Debug, Clone)]
pub struct ConnectionHints {
    pub memory_limit: Option<usize>,
    pub prefer_low_memory: bool,
    pub expected_duration: Duration,
    pub expected_rows: Option<usize>,
    pub cancellable: bool,
    pub priority: QueryPriority,
}

impl Default for ConnectionHints {
    fn default() -> Self {
        Self {
            memory_limit: None,
            prefer_low_memory: false,
            expected_duration: Duration::from_secs(60),
            expected_rows: None,
            cancellable: true,
            priority: QueryPriority::Normal,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryPriority {
    High,
    Normal,
    Low,
}

#[derive(Debug)]
pub struct UnifiedPool {
    connections: Arc<RwLock<Vec<StreamingConnection>>>,
    available_connections: Arc<TokioMutex<VecDeque<StreamingConnection>>>,
    permits: Arc<Semaphore>,
    config: PoolConfig,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
    connection_counter: Arc<AtomicUsize>,
}

impl UnifiedPool {
    pub fn new(db_path: PathBuf, config: PoolConfig) -> Result<Self> {
        // Ensure the parent directory exists
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let resource_limits = calculate_resource_limits();
        let permits = Arc::new(Semaphore::new(config.max_connections));
        
        let pool = Self {
            connections: Arc::new(RwLock::new(Vec::new())),
            available_connections: Arc::new(TokioMutex::new(VecDeque::new())),
            permits: permits.clone(),
            config,
            db_path,
            resource_limits,
            connection_counter: Arc::new(AtomicUsize::new(0)),
        };

        Ok(pool)
    }

    pub async fn initialize(&self) -> Result<()> {
        // Pre-create minimum connections
        eprintln!("[UNIFIED_POOL] Initializing with {} minimum connections", self.config.min_connections);
        
        for i in 0..self.config.min_connections {
            match self.create_connection().await {
                Ok(conn) => {
                    eprintln!("[UNIFIED_POOL] Created initial connection {}", i + 1);
                    self.available_connections.lock().await.push_back(conn);
                }
                Err(e) => {
                    eprintln!("[UNIFIED_POOL] Failed to create initial connection {}: {}", i + 1, e);
                }
            }
        }

        Ok(())
    }

    async fn create_connection(&self) -> Result<StreamingConnection> {
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

        let id = format!("conn-{}", self.connection_counter.fetch_add(1, Ordering::SeqCst));
        eprintln!("[UNIFIED_POOL] Created new connection: {}", id);

        Ok(StreamingConnection::new(conn, id, self.db_path.clone()))
    }

    pub async fn get_connection(&self) -> Result<StreamingConnection> {
        eprintln!("[UNIFIED_POOL] Requesting connection...");
        
        // Try to get an available connection first
        {
            let mut available = self.available_connections.lock().await;
            if let Some(conn) = available.pop_front() {
                eprintln!("[UNIFIED_POOL] Reusing connection: {} ({} remaining)", conn.id, available.len());
                
                // Reset connection hints
                *conn.hints.write().await = ConnectionHints::default();
                
                return Ok(conn);
            }
        }

        // Check if we can create a new connection
        let current_count = self.connections.read().await.len();
        if current_count < self.config.max_connections {
            eprintln!("[UNIFIED_POOL] No available connections, creating new one (current: {}, max: {})", 
                     current_count, self.config.max_connections);
            
            let new_conn = self.create_connection().await?;
            
            // Add to tracked connections (note: we don't actually store the connections here anymore)
            // The connections are managed in available_connections
            
            return Ok(new_conn);
        }

        // Wait for a connection to become available
        eprintln!("[UNIFIED_POOL] Pool exhausted, waiting for connection...");
        let wait_start = Instant::now();
        
        loop {
            // Check every 100ms
            tokio::time::sleep(Duration::from_millis(100)).await;
            
            let mut available = self.available_connections.lock().await;
            if let Some(conn) = available.pop_front() {
                eprintln!("[UNIFIED_POOL] Got connection after waiting {:?}", wait_start.elapsed());
                
                // Reset connection hints
                *conn.hints.write().await = ConnectionHints::default();
                
                return Ok(conn);
            }
            
            // Check timeout
            if wait_start.elapsed() > self.config.acquire_timeout {
                break;
            }
        }

        Err(DuckDBError::ConnectionError {
            message: format!("Connection pool exhausted and timeout after {:?}", self.config.acquire_timeout),
        })
    }

    pub async fn return_connection(&self, conn: StreamingConnection) {
        eprintln!("[UNIFIED_POOL] Returning connection: {}", conn.id);
        
        // Reset connection state
        *conn.state.write().await = ConnectionState::Idle;
        
        // Reset the actual connection before checking health
        if let Err(e) = conn.conn.reset() {
            eprintln!("[UNIFIED_POOL] Failed to reset connection {}: {}", conn.id, e);
            // Connection is broken, drop it
            let mut connections = self.connections.write().await;
            connections.retain(|c| c.id != conn.id);
            return;
        }
        
        // Check if connection is still healthy
        if self.is_connection_healthy(&conn).await {
            let mut available = self.available_connections.lock().await;
            available.push_back(conn);
            eprintln!("[UNIFIED_POOL] Connection returned ({} now available)", available.len());
        } else {
            eprintln!("[UNIFIED_POOL] Connection {} is unhealthy, dropping", conn.id);
            // Remove from tracked connections
            let mut connections = self.connections.write().await;
            connections.retain(|c| c.id != conn.id);
        }
    }

    async fn is_connection_healthy(&self, conn: &StreamingConnection) -> bool {
        // Check if connection has been idle too long
        if let ConnectionState::Idle = *conn.state.read().await {
            if conn.created_at.elapsed() > self.config.idle_timeout {
                eprintln!("[UNIFIED_POOL] Connection {} exceeded idle timeout", conn.id);
                return false;
            }
        }
        
        // Verify connection is actually available
        if !conn.conn.is_available() {
            eprintln!("[UNIFIED_POOL] Connection {} has no actual connection", conn.id);
            return false;
        }
        
        // Test with a simple query
        match conn.conn.with_connection(|c| c.execute("SELECT 1", [])) {
            Ok(_) => true,
            Err(e) => {
                eprintln!("[UNIFIED_POOL] Connection {} health check failed: {}", conn.id, e);
                false
            }
        }
    }

    pub fn get_semaphore(&self) -> Arc<Semaphore> {
        self.permits.clone()
    }
}

impl StreamingConnection {
    pub async fn reset(&mut self) -> Result<()> {
        // Reset any session state if needed
        // For now, just update state
        *self.state.write().await = ConnectionState::Idle;
        Ok(())
    }
}