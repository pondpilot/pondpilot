use crate::errors::{DuckDBError, Result};
use crate::system_resources::{calculate_resource_limits, ResourceLimits};
use duckdb::Connection;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolStats {
    pub total_connections: usize,
    pub used_connections: usize,
    pub available_connections: usize,
    pub connection_counter: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub is_healthy: bool,
    pub stats: PoolStats,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct PoolConfig {
    // TODO: Implement connection pre-warming based on min_connections
    #[allow(dead_code)]
    pub min_connections: usize,
    pub max_connections: usize,
    // TODO: Implement idle connection cleanup
    #[allow(dead_code)]
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

#[derive(Debug, Clone)]
pub struct UnifiedPool {
    permits: Arc<Semaphore>,
    config: PoolConfig,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
    connection_counter: Arc<AtomicUsize>,
}

/// Permit to create a connection
pub struct ConnectionPermit {
    _permit: tokio::sync::OwnedSemaphorePermit,
    id: String,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
}

impl ConnectionPermit {
    /// Create a connection in the current thread
    /// This MUST be called from the thread where the connection will be used
    pub fn create_connection(self) -> Result<Connection> {
        eprintln!(
            "[UNIFIED_POOL] Creating connection {} in thread {:?}",
            self.id,
            std::thread::current().id()
        );
        eprintln!("[UNIFIED_POOL] Database path: {:?}", self.db_path);
        eprintln!("[UNIFIED_POOL] Path exists: {}", self.db_path.exists());
        if let Some(parent) = self.db_path.parent() {
            eprintln!(
                "[UNIFIED_POOL] Parent directory exists: {}",
                parent.exists()
            );
        }

        let conn = Connection::open(&self.db_path).map_err(|e| DuckDBError::ConnectionError {
            message: format!("Failed to create connection to {:?}: {}", self.db_path, e),
            context: None,
        })?;

        // Configure the connection
        let config = format!(
            "PRAGMA threads={};
            PRAGMA memory_limit='{}';
            PRAGMA enable_progress_bar=true;",
            self.resource_limits.pool_threads, self.resource_limits.pool_memory
        );
        conn.execute_batch(&config).ok();

        // Extension-related session settings are applied per-connection from the frontend
        // to avoid initialization-time errors and keep policy centralized.

        // Extensions are now loaded through the extension management system in TypeScript
        // See src/services/extension-loader.ts

        Ok(conn)
    }
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
            permits,
            config,
            db_path,
            resource_limits,
            connection_counter: Arc::new(AtomicUsize::new(0)),
        };

        Ok(pool)
    }

    /// Get current pool statistics for monitoring
    pub fn get_pool_stats(&self) -> PoolStats {
        let available_permits = self.permits.available_permits();
        let total_permits = self.config.max_connections;
        let used_permits = total_permits - available_permits;
        
        PoolStats {
            total_connections: total_permits,
            used_connections: used_permits,
            available_connections: available_permits,
            connection_counter: self.connection_counter.load(Ordering::Relaxed),
        }
    }
    
    /// Perform a health check on the pool
    pub async fn health_check(&self) -> Result<HealthCheckResult> {
        let stats = self.get_pool_stats();
        
        // Try to acquire a permit with a short timeout to test availability
        let can_acquire = match tokio::time::timeout(
            Duration::from_millis(100),
            self.permits.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => {
                // Immediately release the permit
                drop(permit);
                true
            }
            _ => false,
        };
        
        let is_healthy = can_acquire || stats.used_connections < stats.total_connections;
        let message = if can_acquire {
            "Pool is healthy and has available connections".to_string()
        } else if stats.used_connections >= stats.total_connections {
            "Pool is at maximum capacity".to_string()
        } else {
            "Pool is healthy but busy".to_string()
        };
        
        Ok(HealthCheckResult {
            is_healthy,
            stats,
            message,
        })
    }

    /// Acquire a permit to create a connection
    /// The actual connection MUST be created in the thread where it will be used
    pub async fn acquire_connection_permit(&self) -> Result<ConnectionPermit> {
        match tokio::time::timeout(
            self.config.acquire_timeout,
            self.permits.clone().acquire_owned(),
        )
        .await
        {
            Ok(Ok(permit)) => {
                let id = format!(
                    "conn-{}",
                    self.connection_counter.fetch_add(1, Ordering::SeqCst)
                );
                eprintln!("[UNIFIED_POOL] Acquired permit for connection: {}", id);
                Ok(ConnectionPermit {
                    _permit: permit,
                    id,
                    db_path: self.db_path.clone(),
                    resource_limits: self.resource_limits.clone(),
                })
            }
            Ok(Err(_)) => Err(DuckDBError::ConnectionError {
                message: "Failed to acquire connection permit".to_string(),
                context: None,
            }),
            Err(_) => Err(DuckDBError::ConnectionError {
                message: format!(
                    "Connection pool timeout after {:?}",
                    self.config.acquire_timeout
                ),
                context: None,
            }),
        }
    }
}
