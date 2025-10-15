use crate::database::sql_classifier::ClassifiedSqlStatement;
use crate::database::unified_pool::UnifiedPool;
use crate::errors::Result;
use duckdb::arrow::datatypes::Schema as ArrowSchema;
use duckdb::arrow::record_batch::RecordBatch;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::debug;

pub enum ArrowStreamMessage {
    Schema(Arc<ArrowSchema>),
    Batch(RecordBatch),
    Complete(usize),
    Error(String),
}

pub struct ArrowStreamingExecutor {
    pool: Arc<UnifiedPool>,
    sql: String,
    query_id: String,
    cancel_token: Option<CancellationToken>,
    setup_sql: Option<Vec<String>>,
}

impl ArrowStreamingExecutor {
    pub fn new(
        pool: Arc<UnifiedPool>,
        sql: String,
        query_id: String,
        cancel_token: Option<CancellationToken>,
        setup_sql: Option<Vec<String>>,
    ) -> Self {
        Self {
            pool,
            sql,
            query_id,
            cancel_token,
            setup_sql,
        }
    }

    pub async fn execute_arrow_streaming(self) -> Result<mpsc::Receiver<ArrowStreamMessage>> {
        let (tx, rx) = mpsc::channel(10);

        // Clone for the blocking task
        let sql = self.sql.clone();
        let query_id = self.query_id.clone();
        let cancel_token = self.cancel_token.clone();
        // Get connection permit
        let permit = self.pool.acquire_connection_permit().await?;

        // Execute in blocking task
        tokio::task::spawn_blocking(move || {
            debug!(
                "[ARROW_STREAMING] Starting arrow query execution for {} in thread {:?}",
                query_id,
                std::thread::current().id()
            );

            // Check cancellation before starting
            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    debug!(
                        "[ARROW_STREAMING] Query {} cancelled before execution",
                        query_id
                    );
                    return;
                }
            }

            // Create connection in this thread
            let conn = match permit.create_connection() {
                Ok(c) => c,
                Err(e) => {
                    debug!(
                        "[ARROW_STREAMING] Failed to create connection for {}: {}",
                        query_id, e
                    );
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                        "Failed to create connection: {}",
                        e
                    )));
                    return;
                }
            };

            // Clear any pending transaction state
            // Only try to rollback if there's an active transaction
            // Ignore the error if no transaction is active (TransactionContext Error)
            match conn.execute("ROLLBACK", []) {
                Ok(_) => debug!("[ARROW_STREAMING] Rolled back pending transaction"),
                Err(e) if e.to_string().contains("no transaction is active") => {
                    // This is expected if no transaction is active - not an error
                }
                Err(e) => debug!("[ARROW_STREAMING] Failed to rollback transaction: {}", e),
            }
            // Run setup statements (load extensions, attach databases) if provided
            // If a MotherDuck token is available in the environment, attempt to load the extension
            // The extension will read the token from the environment when needed
            if std::env::var("MOTHERDUCK_TOKEN").is_ok() {
                let _ = conn.execute("LOAD motherduck", []);
            }

            // Now run any provided setup statements
            if let Some(setups) = self.setup_sql {
                for stmt in setups {
                    let trimmed = stmt.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    debug!("[ARROW_STREAMING] Setup statement: {}", trimmed);
                    // Special handling for LOAD statements to attempt install fallback for community extensions
                    if trimmed.to_uppercase().starts_with("LOAD ") {
                        // Extract extension name
                        let ext = trimmed.split_whitespace().nth(1).unwrap_or("");
                        match conn.execute(trimmed, []) {
                            Ok(_) => {}
                            Err(e) => {
                                let emsg = e.to_string();
                                // Attempt install for community extensions if not installed
                                if emsg.contains("not installed")
                                    || emsg.contains("Extension")
                                    || emsg.contains("unknown")
                                {
                                    let community_exts = ["read_stat"];
                                    let install_stmt = if community_exts.contains(&ext) {
                                        format!("INSTALL {} FROM community", ext)
                                    } else {
                                        format!("INSTALL {}", ext)
                                    };
                                    match conn.execute(&install_stmt, []) {
                                        Ok(_) => {
                                            let _ = conn.execute(trimmed, []);
                                        }
                                        Err(_ie) => {
                                            // Ignore install failure; streaming may not need this ext
                                        }
                                    }
                                }
                            }
                        }
                        continue;
                    }
                    // For ATTACH and others, if it fails, emit error and abort
                    if let Err(e) = conn.execute(trimmed, []) {
                        let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                            "Failed to execute setup statement: {}",
                            e
                        )));
                        return;
                    }
                }
            }

            // Classify the SQL statement
            let classified = ClassifiedSqlStatement::classify(&sql);
            debug!(
                "[ARROW_STREAMING] SQL classified as {:?}, returns_result_set: {}",
                classified.statement_type, classified.returns_result_set
            );

            // For DDL/DML that don't return results, execute and return empty schema
            if !classified.returns_result_set {
                debug!(
                    "[ARROW_STREAMING] Executing non-result SQL for {}",
                    query_id
                );

                // Split SQL by semicolons to handle multiple statements
                let statements: Vec<&str> = sql
                    .split(';')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .collect();

                let mut executed_count = 0;
                let mut total_rows_affected = 0;
                let mut last_error = None;

                for statement in &statements {
                    debug!("[ARROW_STREAMING] Executing statement: {}", statement);
                    match conn.execute(statement, []) {
                        Ok(rows_affected) => {
                            executed_count += 1;
                            total_rows_affected += rows_affected;
                        }
                        Err(e) => {
                            debug!(
                                "[ARROW_STREAMING] Failed to execute statement '{}': {}",
                                statement, e
                            );
                            last_error = Some(e);
                            break;
                        }
                    }
                }

                if let Some(e) = last_error {
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                        "Failed to execute statement: {}",
                        e
                    )));
                } else {
                    // Create a simple schema for status messages
                    let field_status = duckdb::arrow::datatypes::Field::new(
                        "status",
                        duckdb::arrow::datatypes::DataType::Utf8,
                        false,
                    );
                    let field_message = duckdb::arrow::datatypes::Field::new(
                        "message",
                        duckdb::arrow::datatypes::DataType::Utf8,
                        false,
                    );
                    let field_rows = duckdb::arrow::datatypes::Field::new(
                        "rows_affected",
                        duckdb::arrow::datatypes::DataType::Int64,
                        false,
                    );

                    let schema = Arc::new(ArrowSchema::new(vec![
                        field_status,
                        field_message,
                        field_rows,
                    ]));
                    let _ = tx.blocking_send(ArrowStreamMessage::Schema(schema.clone()));

                    // Create a result batch with the execution status
                    use duckdb::arrow::array::{Int64Array, StringArray};
                    let status_array = StringArray::from(vec!["success"]);
                    let message_array = StringArray::from(vec![format!(
                        "{} statement(s) executed successfully",
                        executed_count
                    )]);
                    let rows_array = Int64Array::from(vec![total_rows_affected as i64]);

                    if let Ok(batch) = RecordBatch::try_new(
                        schema,
                        vec![
                            Arc::new(status_array),
                            Arc::new(message_array),
                            Arc::new(rows_array),
                        ],
                    ) {
                        let _ = tx.blocking_send(ArrowStreamMessage::Batch(batch));
                    }

                    let _ = tx.blocking_send(ArrowStreamMessage::Complete(1));
                }
                return;
            }

            // For queries that return results, use Arrow API
            debug!(
                "[ARROW_STREAMING] Preparing result-returning SQL for {}: {}",
                query_id, sql
            );

            // Try to get schema without full execution
            let schema = {
                // First try: LIMIT 0 approach for SELECT queries
                if sql.trim_start().to_uppercase().starts_with("SELECT") {
                    // Check if the query already has a LIMIT clause
                    let sql_upper = sql.to_uppercase();
                    let has_limit = sql_upper.contains(" LIMIT ");

                    // For complex queries or queries with LIMIT, wrap in a subquery
                    let schema_query = if sql.contains("WITH") || sql.contains("(") || has_limit {
                        format!(
                            "SELECT * FROM ({}) AS sq LIMIT 0",
                            sql.trim_end_matches(';')
                        )
                    } else {
                        format!("{} LIMIT 0", sql.trim_end_matches(';'))
                    };

                    let schema_result =
                        (|| -> std::result::Result<Arc<ArrowSchema>, duckdb::Error> {
                            let mut stmt = conn.prepare(&schema_query)?;
                            let arrow_result = stmt.query_arrow([])?;
                            Ok(arrow_result.get_schema())
                        })();

                    match schema_result {
                        Ok(schema) => {
                            debug!("[ARROW_STREAMING] Got schema using LIMIT 0 approach");
                            Some(schema)
                        }
                        Err(e) => {
                            debug!("[ARROW_STREAMING] Failed to get schema with LIMIT 0: {}", e);
                            None
                        }
                    }
                } else {
                    None
                }
            };

            // Execute the query and stream results
            let query_result = (|| -> std::result::Result<(), duckdb::Error> {
                let mut stmt = conn.prepare(&sql)?;
                // Get schema if we don't have it yet
                let schema = match schema {
                    Some(s) => s,
                    None => {
                        // Fallback: execute the query to get schema (original behavior)
                        debug!("[ARROW_STREAMING] Falling back to full query execution for schema");
                        match stmt.query_arrow([]) {
                            Ok(arrow_result) => arrow_result.get_schema(),
                            Err(e) => {
                                debug!(
                                    "[ARROW_STREAMING] Failed to get arrow result for {}: {}",
                                    query_id, e
                                );
                                let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                                    "Failed to get arrow result: {}",
                                    e
                                )));
                                return Err(e);
                            }
                        }
                    }
                };

                debug!(
                    "[ARROW_STREAMING] Got Arrow schema with {} columns",
                    schema.fields().len()
                );

                if tx
                    .blocking_send(ArrowStreamMessage::Schema(schema.clone()))
                    .is_err()
                {
                    debug!(
                        "[ARROW_STREAMING] Failed to send schema for query {}",
                        query_id
                    );
                    return Ok(());
                }

                // Stream results using the schema
                match stmt.stream_arrow([], schema) {
                    Ok(mut stream) => {
                        let mut batch_count = 0;
                        let mut total_rows = 0;

                        while let Some(batch) = stream.next() {
                            // Check cancellation
                            if let Some(ref token) = cancel_token {
                                if token.is_cancelled() {
                                    debug!(
                                        "[ARROW_STREAMING] Query {} cancelled during streaming",
                                        query_id
                                    );
                                    break;
                                }
                            }

                            batch_count += 1;
                            total_rows += batch.num_rows();
                            debug!(
                                "[ARROW_STREAMING] Sending batch {} with {} rows for query {}",
                                batch_count,
                                batch.num_rows(),
                                query_id
                            );

                            if tx.blocking_send(ArrowStreamMessage::Batch(batch)).is_err() {
                                debug!("[ARROW_STREAMING] Receiver dropped for query {}", query_id);
                                break;
                            }
                        }

                        debug!(
                            "[ARROW_STREAMING] Query {} completed with {} batches, {} total rows",
                            query_id, batch_count, total_rows
                        );
                        let _ = tx.blocking_send(ArrowStreamMessage::Complete(total_rows));
                        Ok(())
                    }
                    Err(e) => {
                        debug!(
                            "[ARROW_STREAMING] Failed to stream arrow results for {}: {}",
                            query_id, e
                        );
                        let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                            "Failed to stream results: {:?}",
                            e
                        )));
                        Err(e)
                    }
                }
            })();

            match query_result {
                Err(e) => {
                    debug!(
                        "[ARROW_STREAMING] Failed to execute query for {}: {}",
                        query_id, e
                    );
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(format!(
                        "Failed to execute query: {}",
                        e
                    )));
                }
                Ok(()) => {
                    // Query completed successfully
                }
            }

            // Connection and permits are automatically dropped here
        });

        Ok(rx)
    }
}
