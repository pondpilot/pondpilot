use crate::errors::Result;
use crate::database::query_builder::QueryHints;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::collections::HashMap;
use tokio::sync::{RwLock, Semaphore};
use std::time::Instant;

// Memory permit size is now configured via AppConfig

#[derive(Debug)]
pub struct ResourceManager {
    // System limits
    total_memory: usize,
    total_connections: usize,
    
    // Current usage
    used_memory: AtomicUsize,
    active_queries: Arc<RwLock<HashMap<String, QueryMetrics>>>,
    
    // Admission control
    memory_semaphore: Arc<Semaphore>,
}

#[derive(Debug)]
pub struct QueryMetrics {
    pub query_id: String,
    pub started_at: Instant,
    pub memory_reserved: usize,
    pub actual_memory_used: Arc<AtomicUsize>,
    pub priority: crate::database::query_builder::QueryPriority,
}

impl Clone for QueryMetrics {
    fn clone(&self) -> Self {
        Self {
            query_id: self.query_id.clone(),
            started_at: self.started_at,
            memory_reserved: self.memory_reserved,
            actual_memory_used: self.actual_memory_used.clone(),
            priority: self.priority,
        }
    }
}

pub struct ResourceGuard {
    // TODO: Track memory permits when resource management is fully integrated
    #[allow(dead_code)]
    memory_permit: tokio::sync::OwnedSemaphorePermit,
    // TODO: Track reserved memory for query execution
    #[allow(dead_code)]
    memory_reserved: usize,
    manager: Arc<ResourceManager>,
    query_id: String,
}

impl Drop for ResourceGuard {
    fn drop(&mut self) {
        eprintln!("[RESOURCE_MANAGER] Releasing resources for query {}", self.query_id);
        
        // Remove from active queries
        let manager = self.manager.clone();
        let query_id = self.query_id.clone();
        
        tokio::spawn(async move {
            let mut active = manager.active_queries.write().await;
            if let Some(metrics) = active.remove(&query_id) {
                let used = metrics.actual_memory_used.load(Ordering::Relaxed);
                manager.used_memory.fetch_sub(used, Ordering::Relaxed);
                eprintln!("[RESOURCE_MANAGER] Released {}MB for query {}", 
                         used / 1024 / 1024, query_id);
            }
        });
    }
}

impl ResourceManager {
    pub fn new(total_memory: usize, total_connections: usize) -> Self {
        let config = crate::config::AppConfig::from_env();
        
        // Reserve some memory for system operations
        let available_memory = (total_memory as f64 * 0.8) as usize; // Use 80% of total
        let permits = available_memory / config.memory_per_permit_bytes();
        
        eprintln!("[RESOURCE_MANAGER] Initialized with {}MB memory ({} permits)", 
                 available_memory / 1024 / 1024, permits);
        
        Self {
            total_memory,
            total_connections,
            used_memory: AtomicUsize::new(0),
            active_queries: Arc::new(RwLock::new(HashMap::new())),
            memory_semaphore: Arc::new(Semaphore::new(permits)),
        }
    }
    
    // TODO: Integrate with QueryBuilder for admission control
    #[allow(dead_code)]
    pub async fn acquire_for_query(
        &self,
        query_id: String,
        hints: &QueryHints,
    ) -> Result<ResourceGuard> {
        let estimated_memory = hints.memory_limit
            .unwrap_or(self.default_query_memory());
        
        eprintln!("[RESOURCE_MANAGER] Query {} requesting {}MB", 
                 query_id, estimated_memory / 1024 / 1024);
        
        // Calculate permits needed
        let config = crate::config::AppConfig::from_env();
        let permits_needed = (estimated_memory / config.memory_per_permit_bytes()).max(1);
        
        // Try to acquire permits with timeout based on priority
        let config = crate::config::AppConfig::from_env();
        let timeout = config.priority_timeout(hints.priority);
        
        let permit = match tokio::time::timeout(
            timeout,
            Arc::clone(&self.memory_semaphore).acquire_many_owned(permits_needed as u32)
        ).await {
            Ok(Ok(permit)) => permit,
            Ok(Err(e)) => {
                return Err(crate::errors::DuckDBError::ResourceLimit {
                    resource: "memory".to_string(),
                    limit: format!("Failed to acquire {} permits: {}", permits_needed, e),
                    current_usage: Some(format!("{} MB", self.used_memory.load(Ordering::Relaxed) / 1024 / 1024)),
                })
            }
            Err(_) => {
                return Err(crate::errors::DuckDBError::ResourceLimit {
                    resource: "memory".to_string(),
                    limit: format!("Timeout waiting for {} permits", permits_needed),
                    current_usage: Some(format!("{} MB", self.used_memory.load(Ordering::Relaxed) / 1024 / 1024)),
                })
            }
        };
        
        // Track the query
        let metrics = QueryMetrics {
            query_id: query_id.clone(),
            started_at: Instant::now(),
            memory_reserved: estimated_memory,
            actual_memory_used: Arc::new(AtomicUsize::new(0)),
            priority: hints.priority,
        };
        
        self.active_queries.write().await.insert(query_id.clone(), metrics);
        self.used_memory.fetch_add(estimated_memory, Ordering::Relaxed);
        
        eprintln!("[RESOURCE_MANAGER] Granted {}MB to query {} ({}MB total in use)", 
                 estimated_memory / 1024 / 1024, 
                 query_id,
                 self.used_memory.load(Ordering::Relaxed) / 1024 / 1024);
        
        Ok(ResourceGuard {
            memory_permit: permit,
            memory_reserved: estimated_memory,
            manager: Arc::new(self.clone()),
            query_id,
        })
    }
    
    // TODO: Use configured default memory settings
    #[allow(dead_code)]
    fn default_query_memory(&self) -> usize {
        let config = crate::config::AppConfig::from_env();
        // Default to 10% of total memory or configured default, whichever is smaller
        std::cmp::min(self.total_memory / 10, config.default_query_memory_bytes())
    }
    
    // TODO: Expose query monitoring via API
    #[allow(dead_code)]
    pub async fn get_active_queries(&self) -> Vec<QueryMetrics> {
        self.active_queries.read().await.values().cloned().collect()
    }
    
    // TODO: Expose memory usage monitoring via API
    #[allow(dead_code)]
    pub fn get_memory_usage(&self) -> (usize, usize) {
        let used = self.used_memory.load(Ordering::Relaxed);
        (used, self.total_memory)
    }
}

impl Clone for ResourceManager {
    fn clone(&self) -> Self {
        Self {
            total_memory: self.total_memory,
            total_connections: self.total_connections,
            used_memory: AtomicUsize::new(self.used_memory.load(Ordering::Relaxed)),
            active_queries: self.active_queries.clone(),
            memory_semaphore: self.memory_semaphore.clone(),
        }
    }
}