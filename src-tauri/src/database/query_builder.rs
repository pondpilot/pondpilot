use crate::errors::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Clone)]
pub struct QueryBuilder {
    pub engine: Arc<tokio::sync::Mutex<crate::database::DuckDBEngine>>,
    pub sql: String,
    pub hints: QueryHints,
    pub cancel_token: Option<CancellationToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHints {
    pub memory_limit: Option<usize>,
    pub expected_duration: Duration,
    pub prefer_low_memory: bool,
    pub cancellable: bool,
    pub priority: QueryPriority,
    pub expected_rows: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueryPriority {
    High,
    Normal,
    Low,
}

impl Default for QueryHints {
    fn default() -> Self {
        Self {
            memory_limit: None,
            expected_duration: Duration::from_secs(60),
            prefer_low_memory: false,
            cancellable: true,
            priority: QueryPriority::Normal,
            expected_rows: None,
        }
    }
}

impl QueryHints {
    /// Catalog queries - low memory, fast timeout, high priority
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
    
    /// User data queries - high memory, cancellable
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
    
    /// Background tasks - low priority, limited memory
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

impl QueryBuilder {
    pub fn new(engine: Arc<tokio::sync::Mutex<crate::database::DuckDBEngine>>, sql: String) -> Self {
        Self {
            engine,
            sql,
            hints: QueryHints::default(),
            cancel_token: None,
        }
    }

    pub fn hint(mut self, hints: QueryHints) -> Self {
        self.hints = hints;
        self
    }
    
    pub fn with_cancel(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }
    
}

pub struct QueryResult<T> {
    pub stream: Box<dyn futures::Stream<Item = Result<T>> + Send + Unpin>,
    pub schema: Arc<Schema>,
    pub size_hint: Option<usize>,
    pub memory_estimate: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct Schema {
    pub columns: Vec<ColumnInfo>,
}

#[derive(Debug, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
}

pub enum AutoResult<T> {
    Collected(Vec<T>),
    Stream(Box<dyn futures::Stream<Item = Result<T>> + Send + Unpin>),
}

impl<T> QueryResult<T> 
where
    T: Send + 'static,
{
    /// For small results (e.g., catalog queries)
    pub async fn collect_all(self) -> Result<Vec<T>> {
        use futures::TryStreamExt;
        
        match self.size_hint {
            Some(size) if size < 10_000 => {
                // Small result, safe to collect
                self.stream.try_collect().await
            }
            _ => {
                // Large or unknown size
                Err(crate::errors::DuckDBError::InvalidOperation {
                    message: "Result too large for collect_all(), use stream()".to_string(),
                })
            }
        }
    }
    
    /// For large results
    pub fn stream(self) -> impl futures::Stream<Item = Result<T>> {
        self.stream
    }
    
    /// Auto-detect based on size
    pub async fn auto(self) -> Result<AutoResult<T>> {
        use futures::TryStreamExt;
        
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