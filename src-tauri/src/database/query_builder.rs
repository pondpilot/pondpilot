use crate::errors::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct QueryBuilder {
    pub engine: Arc<tokio::sync::Mutex<crate::database::DuckDBEngine>>,
    pub sql: String,
    pub hints: QueryHints,
    // TODO: Implement query cancellation support
    #[allow(dead_code)]
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
    // TODO: Implement background query execution
    #[allow(dead_code)]
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
    pub fn new(
        engine: Arc<tokio::sync::Mutex<crate::database::DuckDBEngine>>,
        sql: String,
    ) -> Self {
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

    // TODO: Wire up cancellation token to query execution
    #[allow(dead_code)]
    pub fn with_cancel(mut self, token: CancellationToken) -> Self {
        self.cancel_token = Some(token);
        self
    }

    /// Execute the query and return a streaming result
    // TODO: Implement streaming execution path
    #[allow(dead_code)]
    pub async fn execute_streaming(
        self,
    ) -> Result<tokio::sync::mpsc::Receiver<super::arrow_streaming::ArrowStreamMessage>> {
        let engine = self.engine.lock().await;

        engine
            .execute_arrow_streaming(self.sql, self.hints, self.cancel_token, None)
            .await
    }

    /// Execute the query and collect all results into a simple structure
    pub async fn execute_simple(self) -> Result<super::types::QueryResult> {
        let engine = self.engine.lock().await;

        // For simple execution, use the execute_and_collect helper
        engine.execute_query(&self.sql, vec![]).await
    }
}
