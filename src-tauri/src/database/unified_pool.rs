use super::extensions::ALLOWED_EXTENSIONS;
use super::sql_utils::escape_string_literal;
use crate::errors::{DuckDBError, Result};
use crate::system_resources::{calculate_resource_limits, ResourceLimits};
use duckdb::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

/// Information about an attached database for re-attachment on new connections
#[derive(Debug, Clone)]
struct AttachedDatabase {
    alias: String,
    connection_string: String,
    db_type: String,
    secret_sql: String,
    secret_name: Option<String>, // Explicitly store the secret name (None for MotherDuck)
    read_only: bool,
}

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
    extensions: Arc<tokio::sync::Mutex<Vec<super::types::ExtensionInfoForLoad>>>,
    // Store attached databases with explicit secret name for robust re-attachment
    // (alias, connection_string, db_type, secret_sql, secret_name)
    attached_databases: Arc<tokio::sync::Mutex<Vec<AttachedDatabase>>>,
}

/// Permit to create a connection
pub struct ConnectionPermit {
    _permit: tokio::sync::OwnedSemaphorePermit,
    id: String,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
    extensions: Arc<tokio::sync::Mutex<Vec<super::types::ExtensionInfoForLoad>>>,
    attached_databases: Arc<tokio::sync::Mutex<Vec<AttachedDatabase>>>,
}

impl ConnectionPermit {
    /// Create a connection in the current thread
    /// This MUST be called from the thread where the connection will be used
    /// Returns both the connection and the semaphore permit to ensure pool limits are enforced
    pub fn create_connection(self) -> Result<(Connection, tokio::sync::OwnedSemaphorePermit)> {
        // Destructure self to extract all fields including the permit
        let ConnectionPermit {
            _permit,
            id,
            db_path,
            resource_limits,
            extensions,
            attached_databases,
        } = self;

        tracing::debug!(
            "[UNIFIED_POOL] Creating connection {} in thread {:?}",
            id,
            std::thread::current().id()
        );
        tracing::debug!("[UNIFIED_POOL] Database path: {:?}", db_path);
        tracing::debug!("[UNIFIED_POOL] Path exists: {}", db_path.exists());
        if let Some(parent) = db_path.parent() {
            tracing::debug!(
                "[UNIFIED_POOL] Parent directory exists: {}",
                parent.exists()
            );
        }

        let conn = Connection::open(&db_path).map_err(|e| DuckDBError::ConnectionError {
            message: format!("Failed to create connection to {:?}: {}", db_path, e),
            context: None,
        })?;

        // Configure the connection
        let config = format!(
            "PRAGMA threads={};
            PRAGMA memory_limit='{}';
            PRAGMA enable_progress_bar=true;",
            resource_limits.pool_threads, resource_limits.pool_memory
        );
        conn.execute_batch(&config).ok();

        // Load extensions with backend allowlist enforcement
        // Minimal duplication of allowlist here for security and clarity
        // Use centralized allowlist

        let extensions = extensions.blocking_lock();
        if !extensions.is_empty() {
            let mut extension_config = String::new();
            for ext in extensions.iter() {
                if !ALLOWED_EXTENSIONS.contains(&ext.name.as_str()) {
                    tracing::warn!(
                        "[UNIFIED_POOL] Skipping disallowed extension '{}'; not in allowlist",
                        ext.name
                    );
                    continue;
                }
                let install_command = if ext.extension_type == "community" {
                    format!("INSTALL {} FROM community;", ext.name)
                } else {
                    format!("INSTALL {};", ext.name)
                };
                extension_config.push_str(&install_command);
                extension_config.push_str(&format!("LOAD {};", ext.name));
            }
            if !extension_config.is_empty() {
                conn.execute_batch(&extension_config).map_err(|e| {
                    DuckDBError::ConnectionError {
                        message: format!("Failed to load extensions: {}", e),
                        context: None,
                    }
                })?;
            }
        }

        // RE-ATTACH PREVIOUSLY ATTACHED DATABASES
        let attached_dbs = attached_databases.blocking_lock();
        for db_info in attached_dbs.iter() {
            tracing::debug!("[UNIFIED_POOL] Re-attaching database: {}", db_info.alias);

            // Skip secret creation for MotherDuck (it has empty secret_sql)
            if !db_info.secret_sql.is_empty() {
                // Create secret for PostgreSQL/MySQL
                if let Err(e) = conn.execute_batch(&db_info.secret_sql) {
                    tracing::warn!(
                        "[UNIFIED_POOL] Failed to recreate secret for {}: {}",
                        db_info.alias,
                        e
                    );
                    // Continue with other attachments even if one fails
                    continue;
                }
            }

            // Attach database based on type and available metadata
            let attach_sql = if db_info.db_type == "MOTHERDUCK" {
                // MotherDuck uses special syntax without alias and without SECRET
                format!(
                    "ATTACH {}",
                    escape_string_literal(&db_info.connection_string)
                )
            } else if db_info.db_type == "PLAIN" {
                // Plain URL/file attach
                if db_info.read_only {
                    format!(
                        "ATTACH {} AS {} (READ_ONLY)",
                        escape_string_literal(&db_info.connection_string),
                        db_info.alias
                    )
                } else {
                    format!(
                        "ATTACH {} AS {}",
                        escape_string_literal(&db_info.connection_string),
                        db_info.alias
                    )
                }
            } else if let Some(secret_name) = &db_info.secret_name {
                // PostgreSQL/MySQL use standard syntax with SECRET
                // FIX: Quote secret name defensively (SQL identifier escaping)
                let quoted_secret = format!("\"{}\"", secret_name.replace('"', "\"\""));
                format!(
                    "ATTACH {} AS {} (TYPE {}, SECRET {})",
                    escape_string_literal(&db_info.connection_string),
                    db_info.alias,
                    db_info.db_type,
                    quoted_secret
                )
            } else {
                tracing::warn!(
                    "[UNIFIED_POOL] No secret name for non-MotherDuck database {}",
                    db_info.alias
                );
                continue;
            };

            if let Err(e) = conn.execute(&attach_sql, []) {
                tracing::warn!(
                    "[UNIFIED_POOL] Failed to re-attach {}: {}",
                    db_info.alias,
                    e
                );
                // Continue with other attachments even if one fails
            } else {
                tracing::debug!(
                    "[UNIFIED_POOL] Successfully re-attached database: {}",
                    db_info.alias
                );
            }
        }

        // Return both the connection and the permit
        // The permit will be held by ConnectionHandler to enforce pool limits
        Ok((conn, _permit))
    }
}

impl UnifiedPool {
    pub fn new(
        db_path: PathBuf,
        config: PoolConfig,
        extensions: Arc<tokio::sync::Mutex<Vec<super::types::ExtensionInfoForLoad>>>,
    ) -> Result<Self> {
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
            extensions,
            attached_databases: Arc::new(tokio::sync::Mutex::new(Vec::new())),
        };

        Ok(pool)
    }

    /// Get current pool statistics for monitoring
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
                tracing::debug!("[UNIFIED_POOL] Acquired permit for connection: {}", id);
                Ok(ConnectionPermit {
                    _permit: permit,
                    id,
                    db_path: self.db_path.clone(),
                    resource_limits: self.resource_limits.clone(),
                    extensions: self.extensions.clone(),
                    attached_databases: self.attached_databases.clone(),
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

    /// Register an attached database so it can be re-attached on new connections
    pub async fn register_attached_database(
        &self,
        alias: String,
        connection_string: String,
        db_type: String,
        secret_sql: String,
        secret_name: Option<String>,
        read_only: bool,
    ) {
        let mut attached_dbs = self.attached_databases.lock().await;
        // Check if this database is already attached
        if !attached_dbs.iter().any(|db| db.alias == alias) {
            attached_dbs.push(AttachedDatabase {
                alias,
                connection_string,
                db_type,
                secret_sql,
                secret_name,
                read_only,
            });
        }
    }
}
