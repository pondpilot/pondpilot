use crate::errors::{Result, DuckDBError};
use crate::database::thread_safe_pool::ThreadSafePool;
use crate::database::sql_classifier::ClassifiedSqlStatement;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use duckdb::arrow::datatypes::Schema as ArrowSchema;
use duckdb::arrow::record_batch::RecordBatch;

pub enum ArrowStreamMessage {
    Schema(Arc<ArrowSchema>),
    Batch(RecordBatch),
    Complete(usize),
    Error(String),
}

pub struct ArrowStreamingExecutor {
    pool: Arc<ThreadSafePool>,
    sql: String,
    query_id: String,
    cancel_token: Option<CancellationToken>,
}

impl ArrowStreamingExecutor {
    pub fn new(
        pool: Arc<ThreadSafePool>,
        sql: String,
        query_id: String,
        cancel_token: Option<CancellationToken>,
    ) -> Self {
        Self {
            pool,
            sql,
            query_id,
            cancel_token,
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
        
        // Get streaming permit
        let _streaming_permit = self.pool.acquire_streaming_permit().await?;
        
        // Execute in blocking task
        tokio::task::spawn_blocking(move || {
            eprintln!("[ARROW_STREAMING] Starting arrow query execution for {} in thread {:?}", 
                     query_id, std::thread::current().id());
            
            // Check cancellation before starting
            if let Some(ref token) = cancel_token {
                if token.is_cancelled() {
                    eprintln!("[ARROW_STREAMING] Query {} cancelled before execution", query_id);
                    return;
                }
            }
            
            // Create connection in this thread
            let conn = match permit.create_connection() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[ARROW_STREAMING] Failed to create connection for {}: {}", query_id, e);
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(format!("Failed to create connection: {}", e)));
                    return;
                }
            };
            
            // Clear any pending transaction state
            if let Err(e) = conn.execute("ROLLBACK", []) {
                eprintln!("[ARROW_STREAMING] Failed to rollback transaction: {}", e);
            }
            
            // Classify the SQL statement
            let classified = ClassifiedSqlStatement::classify(&sql);
            eprintln!("[ARROW_STREAMING] SQL classified as {:?}, returns_result_set: {}", 
                     classified.statement_type, classified.returns_result_set);
            
            // For DDL/DML that don't return results, execute and return empty schema
            if !classified.returns_result_set {
                eprintln!("[ARROW_STREAMING] Executing non-result SQL for {}", query_id);
                
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
                    eprintln!("[ARROW_STREAMING] Executing statement: {}", statement);
                    match conn.execute(statement, []) {
                        Ok(rows_affected) => {
                            executed_count += 1;
                            total_rows_affected += rows_affected;
                        }
                        Err(e) => {
                            eprintln!("[ARROW_STREAMING] Failed to execute statement '{}': {}", statement, e);
                            last_error = Some(e);
                            break;
                        }
                    }
                }
                
                if let Some(e) = last_error {
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(format!("Failed to execute statement: {}", e)));
                } else {
                    // Create a simple schema for status messages
                    let field_status = duckdb::arrow::datatypes::Field::new("status", 
                        duckdb::arrow::datatypes::DataType::Utf8, false);
                    let field_message = duckdb::arrow::datatypes::Field::new("message", 
                        duckdb::arrow::datatypes::DataType::Utf8, false);
                    let field_rows = duckdb::arrow::datatypes::Field::new("rows_affected", 
                        duckdb::arrow::datatypes::DataType::Int64, false);
                    
                    let schema = Arc::new(ArrowSchema::new(vec![field_status, field_message, field_rows]));
                    let _ = tx.blocking_send(ArrowStreamMessage::Schema(schema.clone()));
                    
                    // Create a result batch with the execution status
                    use duckdb::arrow::array::{StringArray, Int64Array};
                    let status_array = StringArray::from(vec!["success"]);
                    let message_array = StringArray::from(vec![format!("{} statement(s) executed successfully", executed_count)]);
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
            eprintln!("[ARROW_STREAMING] Preparing result-returning SQL for {}: {}", query_id, sql);
            
            // Prepare and execute with Arrow
            match conn.prepare(&sql) {
                Ok(mut stmt) => {
                    // First, we need to get the schema. The only way to do this with duckdb-rs
                    // is to call query_arrow, but we'll immediately stream after getting schema
                    match stmt.query_arrow([]) {
                        Ok(arrow_result) => {
                            // Get and send schema first
                            let schema = arrow_result.get_schema();
                            eprintln!("[ARROW_STREAMING] Got Arrow schema with {} columns", schema.fields().len());
                            
                            if tx.blocking_send(ArrowStreamMessage::Schema(schema.clone())).is_err() {
                                eprintln!("[ARROW_STREAMING] Failed to send schema for query {}", query_id);
                                return;
                            }
                            
                            // IMPORTANT: We don't iterate over arrow_result here!
                            // Instead, we immediately create a new stream using the same statement
                            // This should reuse the prepared statement and stream results
                            match stmt.stream_arrow([], schema) {
                        Ok(mut stream) => {
                            let mut batch_count = 0;
                            let mut total_rows = 0;
                            
                            while let Some(batch) = stream.next() {
                                // Check cancellation
                                if let Some(ref token) = cancel_token {
                                    if token.is_cancelled() {
                                        eprintln!("[ARROW_STREAMING] Query {} cancelled during streaming", query_id);
                                        break;
                                    }
                                }
                                
                                batch_count += 1;
                                total_rows += batch.num_rows();
                                eprintln!("[ARROW_STREAMING] Sending batch {} with {} rows for query {}", 
                                         batch_count, batch.num_rows(), query_id);
                                
                                if tx.blocking_send(ArrowStreamMessage::Batch(batch)).is_err() {
                                    eprintln!("[ARROW_STREAMING] Receiver dropped for query {}", query_id);
                                    break;
                                }
                            }
                            
                            eprintln!("[ARROW_STREAMING] Query {} completed with {} batches, {} total rows", 
                                     query_id, batch_count, total_rows);
                            let _ = tx.blocking_send(ArrowStreamMessage::Complete(total_rows));
                        }
                        Err(e) => {
                            eprintln!("[ARROW_STREAMING] Failed to stream arrow results for {}: {}", query_id, e);
                            let _ = tx.blocking_send(ArrowStreamMessage::Error(
                                format!("Failed to stream results: {}", e)
                            ));
                        }
                    }
                        }
                        Err(e) => {
                            eprintln!("[ARROW_STREAMING] Failed to get arrow result for {}: {}", query_id, e);
                            let _ = tx.blocking_send(ArrowStreamMessage::Error(
                                format!("Failed to get arrow result: {}", e)
                            ));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[ARROW_STREAMING] Failed to prepare statement for {}: {}", query_id, e);
                    let _ = tx.blocking_send(ArrowStreamMessage::Error(
                        format!("Failed to prepare statement: {}", e)
                    ));
                }
            }
            
            // Connection and permits are automatically dropped here
        });
        
        Ok(rx)
    }
}