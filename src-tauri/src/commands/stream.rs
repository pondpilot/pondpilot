use crate::database::DuckDBEngine;
use crate::streaming::{StreamManager};
use super::EngineState;
use anyhow::Result;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use base64::{Engine as _, engine::general_purpose};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::Schema as ArrowSchema;
use arrow_array::RecordBatch as ArrowRecordBatch;

// Message types for streaming
enum StreamMessage {
    Schema(String),     // Base64 encoded schema
    Batch(String),      // Base64 encoded batch
    Complete(usize),    // Total batch count
}

#[tauri::command]
pub async fn stream_query(
    app: AppHandle,
    engine: EngineState<'_>,
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    sql: String,
    stream_id: String,
) -> Result<(), String> {
    let engine_arc = engine.inner().clone();
    let stream_manager = stream_manager.inner().clone();
    
    // Execute streaming in the same task to avoid Send issues with DuckDB
    // We'll handle the streaming synchronously but emit events asynchronously
    match execute_streaming_query(app, engine_arc, stream_manager, sql, stream_id).await {
        Ok(_) => {},
        Err(e) => {
            eprintln!("Streaming error: {}", e);
            return Err(e.to_string());
        }
    }
    
    Ok(())
}

async fn execute_streaming_query(
    app: AppHandle,
    engine: Arc<tokio::sync::Mutex<DuckDBEngine>>,
    stream_manager: Arc<StreamManager>,
    sql: String,
    stream_id: String,
) -> Result<()> {
    eprintln!("[STREAMING] ===== STARTING STREAM {} =====", stream_id);
    eprintln!("[STREAMING] Starting streaming query for stream {}", stream_id);
    eprintln!("[STREAMING] SQL: {}", sql);
    
    // Register the stream
    let cancel_token = stream_manager.register_stream(stream_id.clone()).await;
    eprintln!("[STREAMING] Stream registered with cancellation token");
    
    // Get semaphore and connection with minimal lock time
    eprintln!("[STREAMING] Getting engine lock for stream {}...", stream_id);
    let (streaming_semaphore, conn) = {
        let engine_guard = engine.lock().await;
        eprintln!("[STREAMING] Engine lock acquired for stream {}", stream_id);
        let result = engine_guard.prepare_streaming().await;
        eprintln!("[STREAMING] Engine lock released for stream {}", stream_id);
        result.map_err(|e| {
            eprintln!("[STREAMING] Failed to prepare streaming for stream {}: {}", stream_id, e);
            anyhow::anyhow!("Failed to prepare streaming: {}", e)
        })?
    };
    
    // Store engine reference for returning connection later
    let engine_clone = engine.clone();
    
    // Acquire permit AFTER we have both semaphore and connection
    eprintln!("[STREAMING] Acquiring streaming permit for stream {}...", stream_id);
    eprintln!("[STREAMING] Available permits before acquire: {}", streaming_semaphore.available_permits());
    let permit = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        streaming_semaphore.clone().acquire_owned()
    ).await {
        Ok(Ok(permit)) => {
            eprintln!("[STREAMING] Streaming permit acquired for stream {}", stream_id);
            eprintln!("[STREAMING] Available permits after acquire: {}", streaming_semaphore.available_permits());
            permit
        },
        Ok(Err(e)) => {
            eprintln!("[STREAMING] Failed to acquire permit for stream {}: {}", stream_id, e);
            // Return the connection to the pool
            eprintln!("[STREAMING] Returning connection to pool due to permit failure");
            let engine_guard = engine_clone.lock().await;
            engine_guard.return_streaming_connection(conn).await;
            eprintln!("[STREAMING] Connection returned to pool");
            return Err(anyhow::anyhow!("Failed to acquire streaming permit: {}", e));
        },
        Err(_) => {
            eprintln!("[STREAMING] Timeout acquiring permit for stream {} (all {} permits in use)", stream_id, 4);
            // Return the connection to the pool
            eprintln!("[STREAMING] Returning connection to pool due to permit timeout");
            let engine_guard = engine_clone.lock().await;
            engine_guard.return_streaming_connection(conn).await;
            eprintln!("[STREAMING] Connection returned to pool");
            return Err(anyhow::anyhow!("Timeout acquiring streaming permit - all permits in use"));
        }
    };
    
    // Check if already cancelled
    if cancel_token.is_cancelled() {
        eprintln!("[STREAMING] Stream {} cancelled before processing", stream_id);
        drop(permit);
        // Return the connection to the pool
        eprintln!("[STREAMING] Returning connection to pool due to early cancellation");
        let engine_guard = engine_clone.lock().await;
        engine_guard.return_streaming_connection(conn).await;
        eprintln!("[STREAMING] Connection returned to pool");
        return Ok(());
    }
    
    eprintln!("[STREAMING] Connection and permit ready for stream {}", stream_id);
    
    // Execute the initial setup in a blocking task
    let (tx, mut rx) = tokio::sync::mpsc::channel::<StreamMessage>(100);
    let app_clone = app.clone();
    let stream_id_clone = stream_id.clone();
    let stream_id_clone2 = stream_id.clone();
    let cancel_token_clone = cancel_token.clone();
    
    // Move connection into the blocking task and return it when done
    let streaming_handle = tokio::task::spawn_blocking(move || -> Result<duckdb::Connection> {
        eprintln!("[STREAMING] >>> BLOCKING TASK START for stream {}", stream_id_clone);
        eprintln!("[STREAMING] Entered blocking task for stream {}", stream_id_clone);
        
        // The connection will be dropped when this function exits
        // which ensures proper cleanup
        eprintln!("[STREAMING] Connection moved into blocking task");
        
        // Check cancellation before starting
        if cancel_token_clone.is_cancelled() {
            eprintln!("[STREAMING] !!! Stream {} cancelled before starting", stream_id_clone);
            eprintln!("[STREAMING] Returning connection early due to cancellation");
            eprintln!("[STREAMING] <<< BLOCKING TASK END (early cancel) for stream {}", stream_id_clone);
            return Ok(conn);
        }
        
        // First, get the schema using a LIMIT 0 query
        eprintln!("[STREAMING] Getting schema...");
        let schema_sql = format!("{} LIMIT 0", sql);
        let mut schema_stmt = conn.prepare(&schema_sql)?;
        let schema_arrow = schema_stmt.query_arrow([])?;
        let duckdb_schema = schema_arrow.get_schema();
        eprintln!("[STREAMING] Schema obtained");
        
        // Prepare the actual statement for streaming
        eprintln!("[STREAMING] Preparing statement...");
        let mut stmt = conn.prepare(&sql)?;
        eprintln!("[STREAMING] Statement prepared");
        
        // Create streaming arrow iterator with the schema
        eprintln!("[STREAMING] Creating streaming arrow iterator...");
        let mut arrow_stream = stmt.stream_arrow([], duckdb_schema.clone())?;
        eprintln!("[STREAMING] Streaming iterator created");
        
        // Convert DuckDB schema to our Arrow schema
        let arrow_schema = convert_duckdb_schema_to_arrow(duckdb_schema.as_ref());
        let arrow_schema_arc = Arc::new(arrow_schema);
        
        // Send schema first
        let mut schema_buffer = Vec::new();
        {
            let mut writer = StreamWriter::try_new(&mut schema_buffer, &arrow_schema_arc)?;
            writer.finish()?;
        }
        let schema_base64 = general_purpose::STANDARD.encode(&schema_buffer);
        tx.blocking_send(StreamMessage::Schema(schema_base64))?;
        eprintln!("[STREAMING] Schema sent");
        eprintln!("[STREAMING] Streaming iterator created");
        
        let mut batch_count = 0;
        const MAX_INITIAL_BATCHES: usize = 1; // Only send 1 batch initially (around 2048 rows)
        
        // Send only a limited number of batches initially
        eprintln!("[STREAMING] Sending up to {} initial batches...", MAX_INITIAL_BATCHES);
        
        // Check for cancellation before even starting
        if cancel_token_clone.is_cancelled() {
            eprintln!("[STREAMING] !!! Stream {} cancelled before batch processing", stream_id_clone);
            eprintln!("[STREAMING] Dropping arrow_stream and stmt immediately");
            drop(arrow_stream);
            drop(stmt);
            eprintln!("[STREAMING] <<< BLOCKING TASK END (cancelled before batch) for stream {}", stream_id_clone);
            return Ok(conn);
        }
        
        eprintln!("[STREAMING] Calling arrow_stream.next() for first batch...");
        eprintln!("[STREAMING] >>> THIS IS WHERE IT MIGHT HANG FOR LARGE DATASETS <<<");
        let start_time = std::time::Instant::now();
        
        // Get only the first batch
        if let Some(duckdb_batch) = arrow_stream.next() {
            let elapsed = start_time.elapsed();
            eprintln!("[STREAMING] Got batch from arrow_stream after {:?}", elapsed);
            eprintln!("[STREAMING] Batch retrieval took {} seconds", elapsed.as_secs_f32());
            
            // Check cancellation again
            if cancel_token_clone.is_cancelled() {
                eprintln!("[STREAMING] !!! Stream {} cancelled during batch processing", stream_id_clone);
                eprintln!("[STREAMING] Dropping arrow_stream and stmt immediately");
                drop(arrow_stream);
                drop(stmt);
                eprintln!("[STREAMING] <<< BLOCKING TASK END (cancelled during batch) for stream {}", stream_id_clone);
                return Ok(conn);
            }
            
            let arrow_batch = convert_duckdb_batch_to_arrow(&duckdb_batch, &arrow_schema_arc)?;
            
            let mut batch_buffer = Vec::new();
            {
                let mut writer = StreamWriter::try_new(&mut batch_buffer, &arrow_schema_arc)?;
                writer.write(&arrow_batch)?;
                writer.finish()?;
            }
            let batch_base64 = general_purpose::STANDARD.encode(&batch_buffer);
            
            // Try to send, but return if channel is closed (receiver dropped)
            if tx.blocking_send(StreamMessage::Batch(batch_base64)).is_err() {
                eprintln!("[STREAMING] Channel closed for stream {}, stopping", stream_id_clone);
                return Ok(conn);
            }
            batch_count = 1;
            eprintln!("[STREAMING] Sent batch 1");
        }
        
        // IMPORTANT: Drop the arrow_stream iterator immediately
        // This will close the underlying DuckDB query
        eprintln!("[STREAMING] !!! DROPPING arrow_stream to stop query execution...");
        drop(arrow_stream);
        eprintln!("[STREAMING] Arrow stream dropped for {}", stream_id_clone);
        
        // Drop the statement to ensure query is stopped
        eprintln!("[STREAMING] !!! DROPPING statement to stop query execution...");
        drop(stmt);
        eprintln!("[STREAMING] Statement dropped for {}", stream_id_clone);
        
        // Mark as complete
        eprintln!("[STREAMING] Sending complete message...");
        tx.blocking_send(StreamMessage::Complete(batch_count))?;
        eprintln!("[STREAMING] Sent {} initial batches", batch_count);
        
        // Return the connection to be returned to pool
        eprintln!("[STREAMING] <<< BLOCKING TASK END (normal) for stream {}", stream_id_clone);
        eprintln!("[STREAMING] Returning connection from blocking task");
        Ok(conn)
    });
    
    // Process messages and emit events
    eprintln!("[STREAMING] Starting message processing loop for stream {}", stream_id);
    let process_result = async {
        while let Some(msg) = rx.recv().await {
            // Check if cancelled
            if cancel_token.is_cancelled() {
                eprintln!("[STREAMING] !!! Stream {} cancelled, stopping event processing", stream_id);
                eprintln!("[STREAMING] Breaking out of message processing loop");
                break;
            }
            
            match msg {
                StreamMessage::Schema(schema_base64) => {
                    app_clone.emit(&format!("stream-{}-schema", stream_id_clone2), &schema_base64)
                        .map_err(|e| anyhow::anyhow!("Failed to emit schema: {}", e))?;
                }
                StreamMessage::Batch(batch_base64) => {
                    app_clone.emit(&format!("stream-{}-batch", stream_id_clone2), &batch_base64)
                        .map_err(|e| anyhow::anyhow!("Failed to emit batch: {}", e))?;
                    
                    // Yield to prevent blocking
                    tokio::task::yield_now().await;
                }
                StreamMessage::Complete(count) => {
                    app_clone.emit(&format!("stream-{}-complete", stream_id_clone2), &count)
                        .map_err(|e| anyhow::anyhow!("Failed to emit complete: {}", e))?;
                    break;
                }
            }
        }
        Ok::<(), anyhow::Error>(())
    }.await;
    
    // Wait for the streaming task to complete or be cancelled
    eprintln!("[STREAMING] Waiting for streaming task to complete for stream {}...", stream_id);
    let returned_conn = match streaming_handle.await {
        Ok(Ok(conn)) => {
            eprintln!("[STREAMING] ✓ Streaming task completed successfully for stream {}", stream_id);
            Some(conn)
        },
        Ok(Err(e)) => {
            eprintln!("[STREAMING] ✗ Streaming task failed for stream {}: {}", stream_id, e);
            None
        },
        Err(e) => {
            eprintln!("[STREAMING] ✗ Streaming task panicked for stream {}: {}", stream_id, e);
            None
        }
    };
    
    // Return the connection to the pool if we got one back
    if let Some(conn) = returned_conn {
        eprintln!("[STREAMING] Returning connection to pool for stream {}", stream_id);
        let engine_guard = engine_clone.lock().await;
        engine_guard.return_streaming_connection(conn).await;
        eprintln!("[STREAMING] Connection returned to pool for stream {}", stream_id);
    }
    
    // Always cleanup, regardless of how we exited
    eprintln!("[STREAMING] Cleaning up stream {} from manager...", stream_id);
    stream_manager.cleanup_stream(&stream_id).await;
    eprintln!("[STREAMING] Stream {} cleaned up from manager", stream_id);
    
    // Drop the permit explicitly to ensure it's released
    eprintln!("[STREAMING] Dropping permit for stream {}...", stream_id);
    drop(permit);
    eprintln!("[STREAMING] Streaming permit released for stream {}", stream_id);
    eprintln!("[STREAMING] Available permits after release: {}", streaming_semaphore.available_permits());
    
    // Return any error that occurred during processing
    process_result?;
    
    eprintln!("[STREAMING] ===== STREAM {} COMPLETE =====", stream_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_stream(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    stream_id: String,
) -> Result<(), String> {
    eprintln!("[STREAMING] !!!!! CANCEL REQUEST FOR STREAM {} !!!!!", stream_id);
    eprintln!("[STREAMING] Cancelling stream {}", stream_id);
    stream_manager
        .cancel_stream(&stream_id)
        .await
        .map_err(|e| e.to_string())?;
    eprintln!("[STREAMING] Stream {} cancellation token triggered", stream_id);
    eprintln!("[STREAMING] The blocking task should exit and drop connection/statement");
    
    // The cancellation token will cause the blocking task to exit early
    // which will drop the connection and interrupt the DuckDB query
    Ok(())
}

// Helper function to convert DuckDB schema to arrow-schema
fn convert_duckdb_schema_to_arrow(duckdb_schema: &duckdb::arrow::datatypes::Schema) -> ArrowSchema {
    use arrow_schema::Field;
    
    let fields: Vec<Field> = duckdb_schema
        .fields()
        .iter()
        .map(|duckdb_field| {
            eprintln!("[STREAMING] Field {} has DuckDB type {:?}", duckdb_field.name(), duckdb_field.data_type());
            let data_type = convert_duckdb_datatype_to_arrow(duckdb_field.data_type());
            Field::new(duckdb_field.name(), data_type, duckdb_field.is_nullable())
        })
        .collect();
    
    ArrowSchema::new(fields)
}

// Helper function to convert DuckDB DataType to arrow DataType
fn convert_duckdb_datatype_to_arrow(duckdb_type: &duckdb::arrow::datatypes::DataType) -> arrow_schema::DataType {
    use duckdb::arrow::datatypes::DataType as DuckDBDataType;
    use arrow_schema::{DataType, Field};
    
    match duckdb_type {
        DuckDBDataType::Boolean => DataType::Boolean,
        DuckDBDataType::Int8 => DataType::Int8,
        DuckDBDataType::Int16 => DataType::Int16,
        DuckDBDataType::Int32 => DataType::Int32,
        DuckDBDataType::Int64 => DataType::Int64,
        DuckDBDataType::UInt8 => DataType::UInt8,
        DuckDBDataType::UInt16 => DataType::UInt16,
        DuckDBDataType::UInt32 => DataType::UInt32,
        DuckDBDataType::UInt64 => DataType::UInt64,
        DuckDBDataType::Float32 => DataType::Float32,
        DuckDBDataType::Float64 => DataType::Float64,
        DuckDBDataType::Utf8 => DataType::Utf8,
        DuckDBDataType::LargeUtf8 => DataType::Utf8, // Convert to regular Utf8 for compatibility
        DuckDBDataType::Binary => DataType::Binary,
        DuckDBDataType::LargeBinary => DataType::LargeBinary,
        DuckDBDataType::Date32 => DataType::Date32,
        DuckDBDataType::Date64 => DataType::Date64,
        DuckDBDataType::Timestamp(unit, tz) => DataType::Timestamp(
            convert_time_unit(unit),
            tz.as_ref().map(|s| s.to_string().into()),
        ),
        DuckDBDataType::Time32(unit) => DataType::Time32(convert_time_unit(unit)),
        DuckDBDataType::Time64(unit) => DataType::Time64(convert_time_unit(unit)),
        DuckDBDataType::Decimal128(p, s) => DataType::Decimal128(*p, *s),
        DuckDBDataType::Decimal256(p, s) => DataType::Decimal256(*p, *s),
        DuckDBDataType::Struct(fields) => {
            // Convert struct fields
            let arrow_fields: Vec<Field> = fields
                .iter()
                .map(|f| Field::new(
                    f.name(),
                    convert_duckdb_datatype_to_arrow(f.data_type()),
                    f.is_nullable()
                ))
                .collect();
            DataType::Struct(arrow_fields.into())
        }
        DuckDBDataType::List(field) => {
            let inner_type = convert_duckdb_datatype_to_arrow(field.data_type());
            DataType::List(Arc::new(Field::new("item", inner_type, true)))
        }
        _ => DataType::Utf8, // Default fallback
    }
}

fn convert_time_unit(unit: &duckdb::arrow::datatypes::TimeUnit) -> arrow_schema::TimeUnit {
    use duckdb::arrow::datatypes::TimeUnit as DuckDBTimeUnit;
    use arrow_schema::TimeUnit;
    
    match unit {
        DuckDBTimeUnit::Second => TimeUnit::Second,
        DuckDBTimeUnit::Millisecond => TimeUnit::Millisecond,
        DuckDBTimeUnit::Microsecond => TimeUnit::Microsecond,
        DuckDBTimeUnit::Nanosecond => TimeUnit::Nanosecond,
    }
}

// Helper function to convert DuckDB RecordBatch to arrow RecordBatch
fn convert_duckdb_batch_to_arrow(
    duckdb_batch: &duckdb::arrow::record_batch::RecordBatch,
    arrow_schema: &ArrowSchema,
) -> Result<ArrowRecordBatch> {
    use arrow_array::ArrayRef;
    use std::sync::Arc;
    
    // For now, we'll do a simple copy of the data
    // In a real implementation, we'd want to avoid copying if possible
    let columns: Vec<ArrayRef> = duckdb_batch
        .columns()
        .iter()
        .enumerate()
        .map(|(i, duckdb_col)| {
            convert_duckdb_array_to_arrow(duckdb_col.clone(), arrow_schema.field(i).data_type())
        })
        .collect::<Result<Vec<_>>>()?;
    
    ArrowRecordBatch::try_new(Arc::new(arrow_schema.clone()), columns)
        .map_err(|e| anyhow::anyhow!("Failed to create Arrow RecordBatch: {}", e))
}

// Helper function to convert DuckDB array to arrow array
fn convert_duckdb_array_to_arrow(
    duckdb_array: duckdb::arrow::array::ArrayRef,
    target_type: &arrow_schema::DataType,
) -> Result<arrow_array::ArrayRef> {
    use arrow_array::*;
    use arrow_schema::DataType;
    use arrow_buffer::{OffsetBuffer, NullBuffer};
    use std::sync::Arc;
    
    // We need to properly convert based on the target type
    match target_type {
        DataType::Int64 => {
            // Convert DuckDB Int64Array to arrow Int64Array
            let duckdb_int64 = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Int64Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Int64Array"))?;
            
            let values: Vec<Option<i64>> = (0..duckdb_int64.len())
                .map(|i| {
                    if duckdb_int64.is_null(i) {
                        None
                    } else {
                        Some(duckdb_int64.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(Int64Array::from(values)) as ArrayRef)
        }
        DataType::Utf8 => {
            // Try different string array types
            if let Some(duckdb_string) = duckdb_array.as_any().downcast_ref::<duckdb::arrow::array::StringArray>() {
                let values: Vec<Option<&str>> = (0..duckdb_string.len())
                    .map(|i| {
                        if duckdb_string.is_null(i) {
                            None
                        } else {
                            Some(duckdb_string.value(i))
                        }
                    })
                    .collect();
                
                Ok(Arc::new(StringArray::from(values)) as ArrayRef)
            } else if let Some(duckdb_large_string) = duckdb_array.as_any().downcast_ref::<duckdb::arrow::array::LargeStringArray>() {
                // DuckDB might return LargeStringArray, convert to regular StringArray
                let values: Vec<Option<&str>> = (0..duckdb_large_string.len())
                    .map(|i| {
                        if duckdb_large_string.is_null(i) {
                            None
                        } else {
                            Some(duckdb_large_string.value(i))
                        }
                    })
                    .collect();
                
                Ok(Arc::new(StringArray::from(values)) as ArrayRef)
            } else {
                // Debug: print the actual type
                eprintln!("[STREAMING] Unknown string array type: {:?}", duckdb_array.data_type());
                Err(anyhow::anyhow!("Failed to downcast string array. Actual type: {:?}", duckdb_array.data_type()))
            }
        }
        DataType::Int32 => {
            // Convert DuckDB Int32Array to arrow Int32Array
            let duckdb_int32 = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Int32Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Int32Array"))?;
            
            let values: Vec<Option<i32>> = (0..duckdb_int32.len())
                .map(|i| {
                    if duckdb_int32.is_null(i) {
                        None
                    } else {
                        Some(duckdb_int32.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(Int32Array::from(values)) as ArrayRef)
        }
        DataType::Float64 => {
            // Convert DuckDB Float64Array to arrow Float64Array
            let duckdb_float64 = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Float64Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Float64Array"))?;
            
            let values: Vec<Option<f64>> = (0..duckdb_float64.len())
                .map(|i| {
                    if duckdb_float64.is_null(i) {
                        None
                    } else {
                        Some(duckdb_float64.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(Float64Array::from(values)) as ArrayRef)
        }
        DataType::Boolean => {
            // Convert DuckDB BooleanArray to arrow BooleanArray
            let duckdb_bool = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::BooleanArray>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to BooleanArray"))?;
            
            let values: Vec<Option<bool>> = (0..duckdb_bool.len())
                .map(|i| {
                    if duckdb_bool.is_null(i) {
                        None
                    } else {
                        Some(duckdb_bool.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(BooleanArray::from(values)) as ArrayRef)
        }
        DataType::Date32 => {
            // Convert DuckDB Date32Array to arrow Date32Array
            let duckdb_date32 = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Date32Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Date32Array"))?;
            
            let values: Vec<Option<i32>> = (0..duckdb_date32.len())
                .map(|i| {
                    if duckdb_date32.is_null(i) {
                        None
                    } else {
                        Some(duckdb_date32.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(Date32Array::from(values)) as ArrayRef)
        }
        DataType::Date64 => {
            // Convert DuckDB Date64Array to arrow Date64Array
            let duckdb_date64 = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Date64Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Date64Array"))?;
            
            let values: Vec<Option<i64>> = (0..duckdb_date64.len())
                .map(|i| {
                    if duckdb_date64.is_null(i) {
                        None
                    } else {
                        Some(duckdb_date64.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(Date64Array::from(values)) as ArrayRef)
        }
        DataType::Timestamp(unit, tz) => {
            // Convert DuckDB TimestampArray to arrow TimestampArray
            // We'll need to handle different time units
            match unit {
                arrow_schema::TimeUnit::Microsecond => {
                    let duckdb_ts = duckdb_array
                        .as_any()
                        .downcast_ref::<duckdb::arrow::array::TimestampMicrosecondArray>()
                        .ok_or_else(|| anyhow::anyhow!("Failed to downcast to TimestampMicrosecondArray"))?;
                    
                    let values: Vec<Option<i64>> = (0..duckdb_ts.len())
                        .map(|i| {
                            if duckdb_ts.is_null(i) {
                                None
                            } else {
                                Some(duckdb_ts.value(i))
                            }
                        })
                        .collect();
                    
                    Ok(Arc::new(TimestampMicrosecondArray::from(values).with_timezone_opt(tz.clone())) as ArrayRef)
                }
                _ => {
                    // For other time units, fallback to string for now
                    let values: Vec<Option<String>> = (0..duckdb_array.len())
                        .map(|i| {
                            if duckdb_array.is_null(i) {
                                None
                            } else {
                                Some(format!("timestamp"))
                            }
                        })
                        .collect();
                    
                    Ok(Arc::new(StringArray::from(values)) as ArrayRef)
                }
            }
        }
        DataType::Decimal128(precision, scale) => {
            // Convert DuckDB Decimal128Array to arrow Decimal128Array
            let duckdb_decimal = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::Decimal128Array>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to Decimal128Array"))?;
            
            let values: Vec<Option<i128>> = (0..duckdb_decimal.len())
                .map(|i| {
                    if duckdb_decimal.is_null(i) {
                        None
                    } else {
                        Some(duckdb_decimal.value(i))
                    }
                })
                .collect();
            
            Ok(Arc::new(
                Decimal128Array::from(values)
                    .with_precision_and_scale(*precision, *scale)?
            ) as ArrayRef)
        }
        DataType::Struct(fields) => {
            // Convert DuckDB StructArray to arrow StructArray
            let duckdb_struct = duckdb_array
                .as_any()
                .downcast_ref::<duckdb::arrow::array::StructArray>()
                .ok_or_else(|| anyhow::anyhow!("Failed to downcast to StructArray"))?;
            
            // Convert each field
            let mut arrow_arrays = Vec::new();
            for (i, field) in fields.iter().enumerate() {
                let duckdb_field_array = duckdb_struct.column(i);
                let arrow_field_array = convert_duckdb_array_to_arrow(duckdb_field_array.clone(), field.data_type())?;
                arrow_arrays.push(arrow_field_array);
            }
            
            // Create struct array
            let struct_array = StructArray::try_new(
                fields.clone(),
                arrow_arrays,
                duckdb_struct.nulls().cloned()
            )?;
            
            Ok(Arc::new(struct_array) as ArrayRef)
        }
        DataType::List(field) => {
            // Check what type we actually got
            eprintln!("[STREAMING] Expected List, got DuckDB type: {:?}", duckdb_array.data_type());
            
            // For now, if we get a string when expecting a list, create an empty list
            // This happens when DuckDB returns JSON strings instead of parsed arrays
            let empty_values = match field.data_type() {
                DataType::Struct(struct_fields) => {
                    // Create empty arrays for each field in the struct
                    let empty_arrays: Vec<ArrayRef> = struct_fields.iter().map(|f| {
                        match f.data_type() {
                            DataType::Utf8 => Arc::new(StringArray::new_null(0)) as ArrayRef,
                            DataType::Int64 => Arc::new(Int64Array::new_null(0)) as ArrayRef,
                            DataType::Boolean => Arc::new(BooleanArray::new_null(0)) as ArrayRef,
                            _ => Arc::new(StringArray::new_null(0)) as ArrayRef,
                        }
                    }).collect();
                    
                    Arc::new(StructArray::try_new(
                        struct_fields.clone(),
                        empty_arrays,
                        None
                    )?) as ArrayRef
                }
                DataType::Utf8 => Arc::new(StringArray::new_null(0)) as ArrayRef,
                DataType::Int64 => Arc::new(Int64Array::new_null(0)) as ArrayRef,
                _ => Arc::new(StringArray::new_null(0)) as ArrayRef,
            };
            
            // Create offsets that represent empty lists for each row
            let mut offset_values = vec![0i32];
            for _ in 0..duckdb_array.len() {
                offset_values.push(*offset_values.last().unwrap());
            }
            let offsets = OffsetBuffer::new(offset_values.into());
            
            let list_array = ListArray::try_new(
                Arc::new(field.as_ref().clone()),
                offsets,
                empty_values,
                Some(NullBuffer::new_null(duckdb_array.len()))
            )?;
            
            Ok(Arc::new(list_array) as ArrayRef)
        }
        _ => {
            // For unsupported types, try to convert to string
            // This is a fallback - in production we'd handle all types
            let values: Vec<Option<String>> = (0..duckdb_array.len())
                .map(|i| {
                    if duckdb_array.is_null(i) {
                        None
                    } else {
                        // Try to get a string representation
                        Some(format!("unsupported"))
                    }
                })
                .collect();
            
            Ok(Arc::new(StringArray::from(values)) as ArrayRef)
        }
    }
}