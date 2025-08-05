# Tauri Unified Streaming Architecture

## Overview

This document describes the thread-safe unified streaming architecture for the Tauri backend that respects DuckDB's thread safety requirements while eliminating the global mutex bottleneck.

## Problem Statement

The original implementation had several critical issues:

1. **Global Mutex Bottleneck**: All database operations were serialized through `Arc<Mutex<DuckDBEngine>>`, preventing parallel execution
2. **Thread Safety Violations**: DuckDB connections were being used across threads, causing "Connection can only be used on the thread that created it" errors
3. **Complex Pool Management**: Attempted to pool connections across threads, which is fundamentally incompatible with DuckDB
4. **Resource Leaks**: Potential for connection and memory leaks in error scenarios

## Design Principles

1. **Thread Safety First**: Respect DuckDB's requirement that connections must be used on the thread that created them
2. **Permit-Based Concurrency**: Use semaphores to limit concurrent connections without pooling the connections themselves
3. **Simple Resource Management**: Each query creates and destroys its own connection within a single thread
4. **Parallel Execution**: Remove global mutex to allow true parallel query execution

## Architecture

### Core Components

```rust
pub struct DuckDBEngine {
    // Permit-based pool - no global mutex, no connection pooling
    pool: Arc<UnifiedPool>,
    
    // Resource management
    resources: Arc<ResourceManager>,
    
    // Registered files tracking
    registered_files: Arc<Mutex<HashMap<String, FileInfo>>>,
}

pub struct UnifiedPool {
    // Semaphore for limiting concurrent connections
    permits: Arc<Semaphore>,
    
    // Configuration
    config: PoolConfig,
    
    // Path to database
    db_path: PathBuf,
    
    // Resource limits
    resource_limits: ResourceLimits,
}

pub struct PoolConfig {
    max_connections: usize,      // Maximum concurrent connections
    acquire_timeout: Duration,   // Max wait for permit
}
```

### Connection Permit Design

```rust
// Connections are NOT pooled - instead we use permits
pub struct ConnectionPermit {
    _permit: tokio::sync::OwnedSemaphorePermit,
    id: String,
    db_path: PathBuf,
    resource_limits: ResourceLimits,
}

impl ConnectionPermit {
    /// Create a connection in the current thread
    /// MUST be called from the thread where the connection will be used
    pub fn create_connection(self) -> Result<Connection> {
        // Connection is created in the CURRENT thread
        let conn = Connection::open(&self.db_path)?;
        
        // Configure the connection
        conn.execute_batch(&format!(
            "PRAGMA threads={};
            PRAGMA memory_limit='{}';
            PRAGMA enable_progress_bar=true;",
            self.resource_limits.pool_threads,
            self.resource_limits.pool_memory
        ))?;
        
        Ok(conn)
    }
}
```

### Query Execution Model

All queries follow the same thread-safe pattern:

```rust
impl DuckDBEngine {
    pub fn query(&self, sql: &str) -> QueryBuilder {
        QueryBuilder {
            engine: Arc::new(tokio::sync::Mutex::new(self.clone())),
            sql: sql.to_string(),
            hints: QueryHints::default(),
            cancel_token: None,
        }
    }
}

pub struct QueryBuilder {
    engine: Arc<tokio::sync::Mutex<DuckDBEngine>>,
    sql: String,
    hints: QueryHints,
    cancel_token: Option<CancellationToken>,
}

impl QueryBuilder {
    pub fn hint(mut self, hints: QueryHints) -> Self {
        self.hints = hints;
        self
    }
    
    pub fn with_cancel(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }
    
    /// Execute and return Arrow streaming results
    pub async fn execute_streaming(self) -> Result<Receiver<ArrowStreamMessage>> {
        let engine = self.engine.lock().await;
        engine.execute_arrow_streaming(self.sql, self.hints, self.cancel_token).await
    }
    
    /// Execute and collect all results
    pub async fn execute_simple(self) -> Result<QueryResult> {
        let engine = self.engine.lock().await;
        engine.execute_query(&self.sql, vec![]).await
    }
}
```

### Thread-Safe Execution Flow

```rust
// In async context
let permit = pool.acquire_connection_permit().await?;

// Execute in blocking task
tokio::task::spawn_blocking(move || {
    // Create connection in THIS thread
    let conn = permit.create_connection()?;
    
    // Execute query on the connection
    let result = conn.execute("SELECT * FROM table", [])?;
    
    // Connection is dropped when task completes
    Ok(result)
}).await?
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

### Permit Lifecycle

```rust
impl UnifiedPool {
    pub async fn acquire_connection_permit(&self) -> Result<ConnectionPermit> {
        // Wait for available permit with timeout
        match tokio::time::timeout(
            self.config.acquire_timeout,
            self.permits.clone().acquire_owned()
        ).await {
            Ok(Ok(permit)) => {
                Ok(ConnectionPermit {
                    _permit: permit,
                    id: format!("conn-{}", self.connection_counter.fetch_add(1, Ordering::SeqCst)),
                    db_path: self.db_path.clone(),
                    resource_limits: self.resource_limits.clone(),
                })
            }
            _ => Err(DuckDBError::ConnectionError {
                message: "Pool exhausted or timeout".to_string(),
            }),
        }
    }
}
```

Key points:
- No connection pooling - each query creates its own connection
- Permits automatically released when dropped
- Connection creation happens in the blocking thread
- No complex health checks or connection state tracking

## Usage Examples

### Query Execution Flow

The fundamental pattern for all queries:

```
1. Async code requests a permit: pool.acquire_connection_permit().await
2. Permit is passed to spawn_blocking task
3. Inside blocking task:
   - Connection is created: permit.create_connection()
   - Query is executed on that connection
   - Connection is dropped when task completes
4. Permit is automatically released
```

### Simple Query Execution

```rust
// In async context
let permit = pool.acquire_connection_permit().await?;

// Execute in blocking task
tokio::task::spawn_blocking(move || {
    // Create connection in this thread
    let conn = permit.create_connection()?;
    
    // Use connection
    conn.execute("SELECT * FROM users", [])?;
    
    // Connection and permit dropped here
    Ok(())
}).await?
```

### Streaming Query Execution

```rust
pub async fn execute_arrow_streaming(self) -> Result<mpsc::Receiver<ArrowStreamMessage>> {
    let (tx, rx) = mpsc::channel(10);
    
    // Get permit in async context
    let permit = self.pool.acquire_connection_permit().await?;
    
    // Execute in blocking task
    tokio::task::spawn_blocking(move || {
        // Create connection in this thread
        let conn = permit.create_connection()?;
        
        // Execute streaming query
        let mut stmt = conn.prepare(&sql)?;
        let mut stream = stmt.stream_arrow([], schema)?;
        
        // Stream results...
    });
    
    Ok(rx)
}
```

## QueryBuilder API

The `QueryBuilder` provides a fluent interface for query execution:

### Catalog Query

```rust
// List all databases with catalog hints
let databases = engine
    .query("SELECT * FROM duckdb_databases")
    .hint(QueryHints::catalog())
    .execute_simple()
    .await?;
```

### Streaming Large Dataset

```rust
// Stream large dataset with cancellation
let stream = engine
    .query("SELECT * FROM huge_table")
    .hint(QueryHints::streaming())
    .with_cancel(cancel_token)
    .execute_streaming()
    .await?;

// Process arrow messages
while let Some(msg) = stream.recv().await {
    match msg {
        ArrowStreamMessage::Batch(batch) => {
            // Process batch without loading entire dataset
            process_arrow_batch(batch)?;
        }
        ArrowStreamMessage::Error(e) => return Err(e),
        _ => {}
    }
}
```

### Direct Connection Usage

```rust
// For simple queries, bypass QueryBuilder
let permit = pool.acquire_connection_permit().await?;

let result = tokio::task::spawn_blocking(move || {
    let conn = permit.create_connection()?;
    conn.execute("CREATE TABLE users (id INT, name TEXT)", [])?;
    Ok(())
}).await??;
```

## Error Handling

### Thread Safety Errors

The most common error in DuckDB is attempting to use a connection on a different thread:

```
Connection can only be used on the thread that created it. 
Created on ThreadId(23), but being used on ThreadId(27)
```

This architecture prevents these errors by ensuring connections are always created and used in the same thread.

### Connection Pool Errors

```rust
pub enum DuckDBError {
    ConnectionError { message: String },  // Pool exhausted, timeout
    QueryError { message: String, sql: Option<String> },
    // ... other variants
}
```

## Current Implementation Status

### ✅ Completed
1. **Global Mutex Removed**: No more `Arc<Mutex<DuckDBEngine>>`
2. **Thread-Safe Pool**: Permit-based system respects DuckDB's thread requirements
3. **Query Builder**: Fluent API with hints and cancellation
4. **Parallel Execution**: Queries can run concurrently, limited only by permits
5. **Resource Management**: Semaphore-based connection limiting

### ❌ Not Implemented (By Design)
1. **Connection Pooling**: Each query creates its own connection (required for thread safety)
2. **Connection Health Checks**: Not needed since connections aren't reused
3. **Complex Result Types**: Simplified to `execute_streaming()` and `execute_simple()`
4. **Automatic Retry**: Can be added later if needed

## Benefits

1. **Thread Safety**: Connections are always used on the thread that created them
2. **Simplicity**: One pool, one query method, clear semantics
3. **Performance**: No global locking, parallel query execution
4. **Resource Safety**: Simple, predictable resource management
5. **Maintainability**: Less code, fewer abstractions
6. **Flexibility**: Hints allow optimization without complexity
7. **Automatic Cleanup**: Connections are dropped with their threads

## Limitations and Trade-offs

1. **No Connection Reuse**: Each query creates a new connection
2. **Connection Overhead**: Opening/closing connections has some cost
3. **No Warmup**: Can't pre-create connections for performance

However, in practice, DuckDB's connection creation is fast enough that these limitations rarely matter. The benefits of thread safety and simplicity outweigh the minor performance overhead.

## Migration from Global Mutex

The previous architecture used `Arc<Mutex<DuckDBEngine>>` which serialized ALL database operations. The new architecture allows true parallel query execution while respecting thread safety.

- **Before**: All queries wait for the global mutex
- **After**: Queries execute in parallel, limited only by permits

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