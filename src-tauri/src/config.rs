use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::constants::*;

/// Configuration for the Tauri application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub runtime: RuntimeConfig,
    pub database: DatabaseConfig,
    pub resource: ResourceConfig,
    pub security: SecurityConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    /// Number of worker threads for the tokio runtime
    pub worker_threads: usize,
    /// Maximum number of blocking threads for database operations
    pub max_blocking_threads: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// Minimum number of connections in the pool
    pub min_connections: usize,
    /// Maximum number of connections in the pool
    pub max_connections: usize,
    /// Maximum number of streaming connections
    pub max_streaming_connections: usize,
    /// Idle timeout for connections in seconds
    pub idle_timeout_secs: u64,
    /// Maximum identifier length (for SQL sanitization)
    pub max_identifier_length: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConfig {
    /// Memory allocated per connection permit in MB
    pub memory_per_permit_mb: usize,
    /// Default query memory limit in MB
    pub default_query_memory_mb: usize,
    /// Maximum query memory limit in MB
    pub max_query_memory_mb: usize,
    /// Catalog query memory limit in MB
    pub catalog_query_memory_mb: usize,
    /// Analytics query memory limit in MB
    pub analytics_query_memory_mb: usize,
    /// Pool memory allocation percentage (0.0 to 1.0)
    pub pool_memory_percentage: f64,
    /// Maximum pool memory in MB
    pub max_pool_memory_mb: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Channel buffer size for streaming
    pub streaming_channel_buffer: usize,
    /// Query ID hash modulo for unique ID generation
    pub query_id_modulo: u128,
    /// High priority query timeout in seconds
    pub high_priority_timeout_secs: u64,
    /// Normal priority query timeout in seconds
    pub normal_priority_timeout_secs: u64,
    /// Low priority query timeout in seconds
    pub low_priority_timeout_secs: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            runtime: RuntimeConfig::default(),
            database: DatabaseConfig::default(),
            resource: ResourceConfig::default(),
            security: SecurityConfig::default(),
        }
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            worker_threads: DEFAULT_WORKER_THREADS,
            max_blocking_threads: DEFAULT_BLOCKING_THREADS,
        }
    }
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            min_connections: MIN_CONNECTIONS,
            max_connections: DEFAULT_MAX_CONNECTIONS,
            max_streaming_connections: 4,
            idle_timeout_secs: 300, // 5 minutes
            max_identifier_length: 128,
        }
    }
}

impl Default for ResourceConfig {
    fn default() -> Self {
        Self {
            memory_per_permit_mb: 10,
            default_query_memory_mb: 100,
            max_query_memory_mb: 2048,
            catalog_query_memory_mb: 100,
            analytics_query_memory_mb: 500,
            pool_memory_percentage: 0.10,
            max_pool_memory_mb: 2048,
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            streaming_channel_buffer: 10,
            query_id_modulo: 100000,
            high_priority_timeout_secs: 30,
            normal_priority_timeout_secs: 10,
            low_priority_timeout_secs: 5,
        }
    }
}

impl AppConfig {
    /// Load configuration from environment variables or use defaults
    pub fn from_env() -> Self {
        let mut config = Self::default();
        
        // Override with environment variables if present
        if let Ok(val) = std::env::var("PONDPILOT_WORKER_THREADS") {
            if let Ok(threads) = val.parse::<usize>() {
                if threads >= MIN_WORKER_THREADS && threads <= MAX_WORKER_THREADS {
                    config.runtime.worker_threads = threads;
                } else {
                    tracing::warn!("Invalid PONDPILOT_WORKER_THREADS value: {}, must be between {} and {}", 
                        threads, MIN_WORKER_THREADS, MAX_WORKER_THREADS);
                }
            }
        }
        
        if let Ok(val) = std::env::var("PONDPILOT_MAX_BLOCKING_THREADS") {
            if let Ok(threads) = val.parse::<usize>() {
                if threads >= MIN_BLOCKING_THREADS && threads <= MAX_BLOCKING_THREADS {
                    config.runtime.max_blocking_threads = threads;
                } else {
                    tracing::warn!("Invalid PONDPILOT_MAX_BLOCKING_THREADS value: {}, must be between {} and {}", 
                        threads, MIN_BLOCKING_THREADS, MAX_BLOCKING_THREADS);
                }
            }
        }
        
        if let Ok(val) = std::env::var("PONDPILOT_MAX_CONNECTIONS") {
            if let Ok(connections) = val.parse::<usize>() {
                if connections > 0 && connections <= MAX_CONNECTIONS {
                    config.database.max_connections = connections;
                    // Ensure min_connections doesn't exceed max_connections
                    if config.database.min_connections > connections {
                        config.database.min_connections = connections.min(MIN_CONNECTIONS);
                    }
                } else {
                    tracing::warn!("Invalid PONDPILOT_MAX_CONNECTIONS value: {}, must be between 1 and {}", 
                        connections, MAX_CONNECTIONS);
                }
            }
        }
        
        if let Ok(val) = std::env::var("PONDPILOT_MAX_QUERY_MEMORY_MB") {
            if let Ok(memory) = val.parse::<usize>() {
                if memory >= 10 && memory <= 32768 { // 10MB to 32GB
                    config.resource.max_query_memory_mb = memory;
                    // Ensure default doesn't exceed max
                    if config.resource.default_query_memory_mb > memory {
                        config.resource.default_query_memory_mb = memory.min(100);
                    }
                } else {
                    tracing::warn!("Invalid PONDPILOT_MAX_QUERY_MEMORY_MB value: {}, must be between 10 and 32768", memory);
                }
            }
        }
        
        // Validate the final configuration
        config.validate();
        config
    }
    
    /// Validate configuration values and fix any inconsistencies
    pub fn validate(&mut self) {
        // Ensure min_connections <= max_connections
        if self.database.min_connections > self.database.max_connections {
            tracing::warn!("min_connections {} > max_connections {}, adjusting", 
                     self.database.min_connections, self.database.max_connections);
            self.database.min_connections = self.database.max_connections;
        }
        
        // Ensure max_streaming_connections doesn't exceed max_connections
        if self.database.max_streaming_connections > self.database.max_connections {
            tracing::warn!("max_streaming_connections {} > max_connections {}, adjusting",
                     self.database.max_streaming_connections, self.database.max_connections);
            self.database.max_streaming_connections = self.database.max_connections;
        }
        
        // Ensure memory limits are sensible
        if self.resource.default_query_memory_mb > self.resource.max_query_memory_mb {
            tracing::warn!("default_query_memory_mb {} > max_query_memory_mb {}, adjusting",
                     self.resource.default_query_memory_mb, self.resource.max_query_memory_mb);
            self.resource.default_query_memory_mb = self.resource.max_query_memory_mb;
        }
        
        // Ensure pool memory percentage is valid
        if self.resource.pool_memory_percentage <= 0.0 || self.resource.pool_memory_percentage > 1.0 {
            tracing::warn!("Warning: Invalid pool_memory_percentage {}, setting to 0.1", 
                     self.resource.pool_memory_percentage);
            self.resource.pool_memory_percentage = 0.1;
        }
        
        // Ensure timeouts are reasonable (at least 1 second)
        if self.database.idle_timeout_secs < 1 {
            self.database.idle_timeout_secs = 300; // Default to 5 minutes
        }
        
        if self.security.high_priority_timeout_secs < 1 {
            self.security.high_priority_timeout_secs = 30;
        }
        
        if self.security.normal_priority_timeout_secs < 1 {
            self.security.normal_priority_timeout_secs = 10;
        }
        
        if self.security.low_priority_timeout_secs < 1 {
            self.security.low_priority_timeout_secs = 5;
        }
    }
    
    /// Get memory per permit in bytes
    pub fn memory_per_permit_bytes(&self) -> usize {
        self.resource.memory_per_permit_mb * 1024 * 1024
    }
    
    /// Get default query memory in bytes
    // TODO: Wire up resource management to use these configuration methods
    #[allow(dead_code)]
    pub fn default_query_memory_bytes(&self) -> usize {
        self.resource.default_query_memory_mb * 1024 * 1024
    }
    
    /// Get catalog query memory in bytes
    // TODO: Wire up resource management to use these configuration methods
    #[allow(dead_code)]
    pub fn catalog_query_memory_bytes(&self) -> usize {
        self.resource.catalog_query_memory_mb * 1024 * 1024
    }
    
    /// Get analytics query memory in bytes
    // TODO: Wire up resource management to use these configuration methods
    #[allow(dead_code)]
    pub fn analytics_query_memory_bytes(&self) -> usize {
        self.resource.analytics_query_memory_mb * 1024 * 1024
    }
    
    /// Get idle timeout as Duration
    // TODO: Implement connection idle timeout handling
    #[allow(dead_code)]
    pub fn idle_timeout(&self) -> Duration {
        Duration::from_secs(self.database.idle_timeout_secs)
    }
    
    /// Get priority timeout as Duration
    // TODO: Implement priority-based query timeouts
    #[allow(dead_code)]
    pub fn priority_timeout(&self, priority: crate::database::query_builder::QueryPriority) -> Duration {
        use crate::database::query_builder::QueryPriority;
        
        match priority {
            QueryPriority::High => Duration::from_secs(self.security.high_priority_timeout_secs),
            QueryPriority::Normal => Duration::from_secs(self.security.normal_priority_timeout_secs),
            QueryPriority::Low => Duration::from_secs(self.security.low_priority_timeout_secs),
        }
    }
}
