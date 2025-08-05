# Tauri Unified Streaming Architecture

## Overview

This document describes a simplified, unified streaming architecture for the Tauri backend that eliminates the complexity of multiple connection pools while maintaining high performance and resource safety.

## Problem Statement

The current implementation has several critical issues:

1. **Global Mutex Bottleneck**: All database operations are serialized through `Arc<Mutex<DuckDBEngine>>`, negating connection pool benefits
2. **Complex Pool Management**: Multiple pool types (primary, streaming, catalog) add unnecessary complexity
3. **Resource Leaks**: Potential for connection and memory leaks in error scenarios
4. **Race Conditions**: Complex cancellation logic with potential race conditions

## Design Principles

1. **Simplicity First**: One pool, one connection type, one query method
2. **Stream Everything**: All queries use streaming internally, optimized based on hints
3. **Resource Safety**: Simple, robust resource management without complex hierarchies
4. **Performance**: Maintain or improve performance through intelligent optimization

## Architecture

### Core Components

```rust
pub struct DuckDBEngine {
    // Single unified pool - no global mutex
    pool: Arc<UnifiedPool>,
    
    // Resource management
    resources: Arc<ResourceManager>,
    
    // Metrics collection
    metrics: Arc<Metrics>,
}

pub struct UnifiedPool {
    // All connections are streaming-capable
    connections: Arc<RwLock<Vec<StreamingConnection>>>,
    
    // Simple semaphore for limiting concurrent operations
    permits: Arc<Semaphore>,
    
    // Configuration
    config: PoolConfig,
}

pub struct PoolConfig {
    min_connections: usize,      // Minimum idle connections
    max_connections: usize,      // Maximum total connections
    idle_timeout: Duration,      // When to close idle connections
    acquire_timeout: Duration,   // Max wait for connection
}
```

### Connection Design

```rust
pub struct StreamingConnection {
    conn: Connection,
    id: ConnectionId,
    created_at: Instant,
    
    // Track connection state
    state: Arc<RwLock<ConnectionState>>,
    
    // Performance hints for current operation
    hints: Arc<RwLock<ConnectionHints>>,
}

pub enum ConnectionState {
    Idle,
    Executing { 
        query_id: QueryId, 
        started: Instant,
        cancel_token: CancellationToken,
    },
    Streaming { 
        stream_id: StreamId, 
        started: Instant,
        memory_used: AtomicUsize,
        cancel_token: CancellationToken,
    },
}

pub struct ConnectionHints {
    // Memory management
    memory_limit: Option<usize>,    // Override default memory limit
    prefer_low_memory: bool,        // For catalog queries
    
    // Execution hints
    expected_duration: Duration,     // For timeout calculation
    expected_rows: Option<usize>,    // For buffer sizing
    
    // Control
    cancellable: bool,              // User-cancellable query
    priority: QueryPriority,        // High/Normal/Low
}
```

### Query Execution Model

All queries follow the same pattern but with different optimization hints:

```rust
impl DuckDBEngine {
    pub async fn query<T>(&self, sql: &str) -> QueryBuilder<T> {
        QueryBuilder {
            engine: self.clone(),
            sql: sql.to_string(),
            hints: QueryHints::default(),
            cancel_token: None,
        }
    }
}

pub struct QueryBuilder<T> {
    engine: Arc<DuckDBEngine>,
    sql: String,
    hints: QueryHints,
    cancel_token: Option<CancellationToken>,
}

impl<T> QueryBuilder<T> {
    pub fn hint(mut self, hints: QueryHints) -> Self {
        self.hints = hints;
        self
    }
    
    pub fn with_cancel(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }
    
    pub async fn execute(self) -> Result<QueryResult<T>> {
        self.engine.execute_query(self.sql, self.hints, self.cancel_token).await
    }
}
```

### Smart Result Handling

```rust
pub struct QueryResult<T> {
    // Always streaming internally
    stream: Box<dyn Stream<Item = Result<T>> + Send>,
    
    // Metadata for optimization
    schema: Arc<Schema>,
    size_hint: Option<usize>,
    memory_estimate: Option<usize>,
}

impl<T> QueryResult<T> {
    // For small results (e.g., catalog queries)
    pub async fn collect_all(self) -> Result<Vec<T>> {
        match self.size_hint {
            Some(size) if size < 10_000 => {
                // Small result, safe to collect
                self.stream.try_collect().await
            }
            _ => {
                // Large or unknown size
                Err(anyhow!("Result too large for collect_all(), use stream()"))
            }
        }
    }
    
    // For large results
    pub fn stream(self) -> impl Stream<Item = Result<T>> {
        self.stream
    }
    
    // For convenience - auto-detect based on size
    pub async fn auto(self) -> Result<AutoResult<T>> {
        match self.size_hint {
            Some(size) if size < 10_000 => {
                Ok(AutoResult::Collected(self.stream.try_collect().await?))
            }
            _ => {
                Ok(AutoResult::Stream(self.stream))
            }
        }
    }
}
```

### Query Hints System

Pre-defined hints for common scenarios:

```rust
impl QueryHints {
    // Catalog queries - low memory, fast timeout
    pub fn catalog() -> Self {
        Self {
            memory_limit: Some(100 * 1024 * 1024), // 100MB
            expected_duration: Duration::from_secs(5),
            prefer_low_memory: true,
            cancellable: false,
            priority: QueryPriority::High,
            expected_rows: Some(1000),
        }
    }
    
    // User data queries - high memory, cancellable
    pub fn streaming() -> Self {
        Self {
            memory_limit: None, // Use system default
            expected_duration: Duration::from_secs(300),
            prefer_low_memory: false,
            cancellable: true,
            priority: QueryPriority::Normal,
            expected_rows: None,
        }
    }
    
    // Background tasks - low priority
    pub fn background() -> Self {
        Self {
            memory_limit: Some(500 * 1024 * 1024), // 500MB
            expected_duration: Duration::from_secs(600),
            prefer_low_memory: false,
            cancellable: true,
            priority: QueryPriority::Low,
            expected_rows: None,
        }
    }
}
```

## Resource Management

### Simple Memory-Based Admission Control

```rust
pub struct ResourceManager {
    // System limits
    total_memory: usize,
    total_connections: usize,
    
    // Current usage
    used_memory: AtomicUsize,
    active_queries: Arc<RwLock<HashMap<QueryId, QueryMetrics>>>,
    
    // Admission control
    memory_semaphore: Arc<Semaphore>,
}

impl ResourceManager {
    pub async fn acquire_for_query(
        &self,
        hints: &QueryHints,
    ) -> Result<ResourceGuard> {
        let estimated_memory = hints.memory_limit
            .unwrap_or(self.default_query_memory());
        
        // Wait for memory availability
        let permits = (estimated_memory / MEMORY_PERMIT_SIZE).max(1);
        let memory_permit = self.memory_semaphore
            .acquire_many(permits)
            .await?;
        
        Ok(ResourceGuard {
            memory_permit,
            memory_reserved: estimated_memory,
            manager: self.clone(),
        })
    }
}
```

### Connection Lifecycle

```rust
impl UnifiedPool {
    async fn get_connection(&self) -> Result<PooledConnection> {
        // Try to get idle connection first
        if let Some(conn) = self.get_idle_connection().await {
            return Ok(conn);
        }
        
        // Create new if under limit
        if self.connections.read().await.len() < self.config.max_connections {
            return self.create_connection().await;
        }
        
        // Wait for available connection
        self.wait_for_connection().await
    }
    
    async fn return_connection(&self, mut conn: StreamingConnection) {
        // Reset connection state
        conn.reset().await;
        
        // Check if still healthy
        if conn.is_healthy().await {
            // Return to pool
            self.connections.write().await.push(conn);
        }
        // Unhealthy connections are dropped
    }
}
```

## Implementation Examples

### Catalog Query (Auto-Optimized)

```rust
// List all tables - automatically optimized for small result
let tables = engine
    .query("SELECT * FROM information_schema.tables")
    .hint(QueryHints::catalog())
    .execute()
    .await?
    .collect_all()  // Safe because hint indicates small result
    .await?;
```

### Large Data Export

```rust
// Stream large dataset
let mut stream = engine
    .query("SELECT * FROM huge_table")
    .hint(QueryHints::streaming())
    .with_cancel(user_cancel_token)
    .execute()
    .await?
    .stream();

while let Some(batch) = stream.next().await {
    let batch = batch?;
    // Process batch without loading entire dataset
    writer.write_batch(batch).await?;
}
```

### Background Analysis

```rust
// Row count with resource limits
let count = engine
    .query("SELECT COUNT(*) FROM large_table")
    .hint(QueryHints::background())
    .execute()
    .await?
    .collect_all()
    .await?
    .first()
    .map(|row| row.get::<i64>(0));
```

## Error Handling

### Connection Errors

```rust
#[derive(Debug, thiserror::Error)]
pub enum PoolError {
    #[error("Connection pool exhausted after {wait_time:?}")]
    Exhausted { wait_time: Duration },
    
    #[error("Connection lost during query execution")]
    ConnectionLost { query_id: QueryId },
    
    #[error("Resource limit exceeded: {resource}")]
    ResourceLimit { resource: String, limit: String },
}
```

### Automatic Recovery

```rust
impl StreamingConnection {
    async fn execute_with_retry<T>(
        &self,
        f: impl Fn() -> Result<T>,
    ) -> Result<T> {
        let mut attempts = 0;
        loop {
            match f() {
                Ok(result) => return Ok(result),
                Err(e) if e.is_recoverable() && attempts < 3 => {
                    attempts += 1;
                    tokio::time::sleep(Duration::from_millis(100 * attempts)).await;
                }
                Err(e) => return Err(e),
            }
        }
    }
}
```

## Migration Path

### Phase 1: Remove Global Mutex
1. Extract connection pool from mutex wrapper
2. Implement connection-level locking only
3. Verify no regressions in existing functionality

### Phase 2: Unify Connection Types
1. Merge all pool types into UnifiedPool
2. Implement hint-based optimization
3. Migrate existing queries to use hints

### Phase 3: Improve Resource Management
1. Implement memory-based admission control
2. Add connection health checks
3. Implement automatic cleanup

### Phase 4: Monitoring and Observability
1. Add comprehensive metrics
2. Implement health endpoints
3. Add performance profiling

## Benefits

1. **Simplicity**: One pool, one query method, clear semantics
2. **Performance**: No global locking, parallel query execution
3. **Resource Safety**: Simple, predictable resource management
4. **Maintainability**: Less code, fewer abstractions
5. **Flexibility**: Hints allow optimization without complexity

## Testing Strategy

### Unit Tests
- Connection pool operations
- Resource limit enforcement
- Error recovery mechanisms

### Integration Tests
- Concurrent query execution
- Resource exhaustion scenarios
- Cancellation and cleanup

### Performance Tests
- Throughput under load
- Memory usage patterns
- Connection pool efficiency

## Conclusion

This unified streaming architecture significantly simplifies the Tauri backend while maintaining high performance and resource safety. By treating all queries as potentially streaming and using hints for optimization, we achieve both simplicity and flexibility without the complexity of multiple specialized pools.