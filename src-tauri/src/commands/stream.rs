use crate::database::{DuckDBEngine, QueryHints};
use crate::database::arrow_streaming::ArrowStreamMessage;
use crate::streaming::StreamManager;
use crate::errors::Result as DuckDBResult;
use super::EngineState;
use anyhow::Result;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tracing::debug;
use serde::Serialize;
use crate::database::sql_utils::{escape_identifier, escape_string_literal, AttachItem, build_attach_statements};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::Schema;
use arrow_array::RecordBatch;

/// Binary event payload for streaming with optimized binary transmission
#[derive(Clone, Serialize)]
pub struct BinaryStreamEvent {
    /// Raw binary data as bytes (using serde_bytes for efficient serialization)
    #[serde(with = "serde_bytes")]
    pub data: Vec<u8>,
    /// Metadata about the message type
    pub message_type: String,
    /// Stream ID for correlation
    pub stream_id: String,
    /// Optional batch index for tracking
    pub batch_index: Option<usize>,
}


#[tauri::command]
pub async fn stream_query(
    app: AppHandle,
    engine: EngineState<'_>,
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    sql: String,
    stream_id: String,
    attach: Option<serde_json::Value>,
) -> DuckDBResult<serde_json::Value> {
    debug!("[COMMAND] stream_query called for stream {} with SQL: {}", stream_id, sql);
    let engine_arc = engine.inner().clone();
    let stream_manager = stream_manager.inner().clone();
    
    // Execute streaming in a separate task
    let app_clone = app.clone();
    let app_clone2 = app.clone();
    let stream_id_clone = stream_id.clone();
    let attach_spec = attach.clone();
    
    tokio::spawn(async move {
        match execute_streaming_query(app_clone, engine_arc, stream_manager.clone(), sql, stream_id_clone.clone(), attach_spec).await {
            Ok(_) => {
                debug!("[STREAMING] Stream {} completed successfully", stream_id_clone);
            }
            Err(e) => {
                debug!("[STREAMING] Stream {} failed: {}", stream_id_clone, e);
                // Emit binary error event to match frontend listener
                let event = BinaryStreamEvent {
                    data: e.to_string().into_bytes(),
                    message_type: "error".to_string(),
                    stream_id: stream_id_clone.clone(),
                    batch_index: None,
                };
                let _ = app_clone2.emit(&format!("stream-binary-{}", stream_id_clone), &event);
            }
        }
    });
    
    // Return success immediately
    Ok(serde_json::json!({
        "status": "streaming"
    }))
}

async fn execute_streaming_query(
    app: AppHandle,
    engine: Arc<DuckDBEngine>,
    stream_manager: Arc<StreamManager>,
    sql: String,
    stream_id: String,
    attach: Option<serde_json::Value>,
) -> Result<()> {
    debug!("[STREAMING] ===== STARTING STREAM {} =====", stream_id);
    debug!("[STREAMING] Starting streaming query for stream {}", stream_id);
    debug!("[STREAMING] SQL: {}", sql);
    
    // Register the stream with backpressure support
    let (cancel_token, mut ack_rx) = stream_manager.register_stream(stream_id.clone()).await;
    debug!("[STREAMING] Stream registered with cancellation token and backpressure");
    
    // Create a cleanup guard to ensure resources are always cleaned up
    struct CleanupGuard {
        stream_id: String,
        stream_manager: Arc<StreamManager>,
    }
    
    impl Drop for CleanupGuard {
        fn drop(&mut self) {
            let stream_id = self.stream_id.clone();
            let stream_manager = self.stream_manager.clone();
            
            // Spawn cleanup task since Drop can't be async
            tokio::spawn(async move {
                debug!("[STREAMING] CleanupGuard dropping for stream {}", stream_id);
                stream_manager.cleanup_stream(&stream_id).await;
            });
        }
    }
    
    let _cleanup_guard = CleanupGuard {
        stream_id: stream_id.clone(),
        stream_manager: stream_manager.clone(),
    };
    
    // Build setup statements: load essential extensions and perform ATTACH if provided
    let mut setup_stmts: Vec<String> = Vec::new();

    // Ensure queries run against the main database for consistent view resolution
    setup_stmts.push("USE main".to_string());

    if let Some(ref spec) = attach {
        // Normalize attach spec into AttachItem list
        let mut items: Vec<AttachItem> = Vec::new();
        if let Some(arr) = spec.as_array() {
            for item in arr {
                if let (Some(db_name), Some(url)) = (
                    item.get("dbName").and_then(|v| v.as_str()),
                    item.get("url").and_then(|v| v.as_str()),
                ) {
                    let read_only = item.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(true);
                    items.push(AttachItem { db_name: db_name.to_string(), url: url.to_string(), read_only });
                }
            }
        } else {
            if let (Some(db_name), Some(url)) = (
                spec.get("dbName").and_then(|v| v.as_str()),
                spec.get("url").and_then(|v| v.as_str()),
            ) {
                let read_only = spec.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(true);
                items.push(AttachItem { db_name: db_name.to_string(), url: url.to_string(), read_only });
            }
        }

        // Build statements from normalized items
        let attach_sqls = build_attach_statements(&items);
        setup_stmts.extend(attach_sqls);
    }

    let mut arrow_stream = match engine.execute_arrow_streaming(
        sql.clone(),
        QueryHints::streaming(),
        Some(cancel_token.clone()),
        Some(setup_stmts),
    ).await {
        Ok(stream) => stream,
        Err(e) => {
            // CleanupGuard will handle cleanup automatically
            return Err(e.into());
        }
    };
    
    let mut batch_count = 0;
    let mut unacked_batches = 0;
    const MAX_UNACKED_BATCHES: usize = 3; // Small prefetch window for responsiveness vs. waste
    
    // Process arrow stream messages
    while let Some(msg) = arrow_stream.recv().await {
        // Check cancellation
        if cancel_token.is_cancelled() {
            debug!("[STREAMING] Stream {} cancelled", stream_id);
            break;
        }
        
        match msg {
            ArrowStreamMessage::Schema(duckdb_schema) => {
                debug!("[STREAMING] Received schema for stream {}", stream_id);
                
                // Check cancellation before processing
                if cancel_token.is_cancelled() {
                    debug!("[STREAMING] Stream {} cancelled during schema processing", stream_id);
                    break;
                }
                
                // Convert DuckDB schema to Arrow schema and serialize to IPC format
                let arrow_schema = convert_duckdb_schema(&duckdb_schema);
                let mut schema_buffer = Vec::new();
                {
                    let mut writer = StreamWriter::try_new(&mut schema_buffer, &arrow_schema)?;
                    writer.finish()?;
                }
                
                // Emit schema via Tauri events with optimized binary serialization
                let event = BinaryStreamEvent {
                    data: schema_buffer,
                    message_type: "schema".to_string(),
                    stream_id: stream_id.clone(),
                    batch_index: None,
                };
                let _ = app.emit(&format!("stream-binary-{}", stream_id), &event);
            }
            
            ArrowStreamMessage::Batch(duckdb_batch) => {
                batch_count += 1;
                debug!("[STREAMING] Received batch {} for stream {} ({} rows)", 
                         batch_count, stream_id, duckdb_batch.num_rows());
                
                // Implement proper backpressure - block when window is full
                while unacked_batches >= MAX_UNACKED_BATCHES {
                    debug!("[STREAMING] Waiting for acknowledgment (unacked: {})", unacked_batches);
                    
                    // Wait for acknowledgment or cancellation
                    tokio::select! {
                        ack = ack_rx.recv() => {
                            match ack {
                                Some(_) => {
                                    unacked_batches -= 1;
                                    debug!("[STREAMING] Batch acknowledged, unacked: {}", unacked_batches);
                                }
                                None => {
                                    debug!("[STREAMING] Acknowledgment channel closed");
                                    return Ok(());
                                }
                            }
                        }
                        _ = cancel_token.cancelled() => {
                            debug!("[STREAMING] Stream cancelled during backpressure wait");
                            return Ok(());
                        }
                    }
                }
                
                // Check cancellation before processing
                if cancel_token.is_cancelled() {
                    debug!("[STREAMING] Stream {} cancelled during batch processing", stream_id);
                    break;
                }
                
                // Convert DuckDB batch to Arrow batch and serialize to IPC format
                let arrow_batch = convert_duckdb_batch(&duckdb_batch)?;
                let mut batch_buffer = Vec::new();
                {
                    let arrow_schema = arrow_batch.schema();
                    let mut writer = StreamWriter::try_new(&mut batch_buffer, &arrow_schema)?;
                    writer.write(&arrow_batch)?;
                    writer.finish()?;
                }
                
                // Emit batch via Tauri events with optimized binary serialization
                let event = BinaryStreamEvent {
                    data: batch_buffer,
                    message_type: "batch".to_string(),
                    stream_id: stream_id.clone(),
                    batch_index: Some(batch_count),
                };
                let _ = app.emit(&format!("stream-binary-{}", stream_id), &event);
                
                unacked_batches += 1;
            }
            
            ArrowStreamMessage::Complete(total_batches) => {
                debug!("[STREAMING] Stream {} complete, sent {} batches (total: {})", stream_id, batch_count, total_batches);
                
                // Send completion event
                let event = BinaryStreamEvent {
                    data: Vec::new(),
                    message_type: "complete".to_string(),
                    stream_id: stream_id.clone(),
                    batch_index: None,
                };
                let _ = app.emit(&format!("stream-binary-{}", stream_id), &event);
                break;
            }
            
            ArrowStreamMessage::Error(e) => {
                debug!("[STREAMING] Stream {} error: {}", stream_id, e);
                
                // Send error event
                let event = BinaryStreamEvent {
                    data: e.to_string().into_bytes(),
                    message_type: "error".to_string(),
                    stream_id: stream_id.clone(),
                    batch_index: None,
                };
                let _ = app.emit(&format!("stream-binary-{}", stream_id), &event);
                return Err(anyhow::anyhow!(e));
            }
        }
    }
    
    debug!("[STREAMING] ===== STREAM {} COMPLETE =====", stream_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_stream(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    stream_id: String,
) -> DuckDBResult<()> {
    debug!("[COMMAND] cancel_stream called for stream {}", stream_id);
    let _ = stream_manager.cancel_stream(&stream_id).await;
    Ok(())
}

#[tauri::command]
pub async fn acknowledge_stream_batch(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    stream_id: String,
    _batch_index: usize,
) -> DuckDBResult<()> {
    debug!("[COMMAND] acknowledge_stream_batch called for stream {}", stream_id);
    let _ = stream_manager.acknowledge_batch(&stream_id).await;
    Ok(())
}

// Helper macro to reduce timestamp conversion boilerplate
macro_rules! convert_timestamp {
    ($duckdb_arr:expr, $duck_type:ty, $arrow_type:ty, $tz:expr) => {{
        if let Some(arr) = $duckdb_arr.as_any().downcast_ref::<$duck_type>() {
            let values: Vec<Option<i64>> = (0..arr.len())
                .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                .collect();
            Arc::new(<$arrow_type>::from(values).with_timezone_opt($tz)) as ArrayRef
        } else {
            // Create array with all nulls
            let values: Vec<Option<i64>> = vec![None; $duckdb_arr.len()];
            Arc::new(<$arrow_type>::from(values).with_timezone_opt($tz)) as ArrayRef
        }
    }};
}

// Helper function to convert DuckDB schema to Arrow schema
fn convert_duckdb_schema(duckdb_schema: &duckdb::arrow::datatypes::Schema) -> Arc<Schema> {
    use arrow_schema::{Field, DataType, TimeUnit};
    use duckdb::arrow::datatypes::{DataType as DuckDBType, TimeUnit as DuckDBTimeUnit};
    
    let fields: Vec<Field> = duckdb_schema
        .fields()
        .iter()
        .map(|f| {
            let arrow_type = match f.data_type() {
                DuckDBType::Null => DataType::Null,
                DuckDBType::Boolean => DataType::Boolean,
                DuckDBType::Int8 => DataType::Int8,
                DuckDBType::Int16 => DataType::Int16,
                DuckDBType::Int32 => DataType::Int32,
                DuckDBType::Int64 => DataType::Int64,
                DuckDBType::UInt8 => DataType::UInt8,
                DuckDBType::UInt16 => DataType::UInt16,
                DuckDBType::UInt32 => DataType::UInt32,
                DuckDBType::UInt64 => DataType::UInt64,
                DuckDBType::Float16 => DataType::Float16,
                DuckDBType::Float32 => DataType::Float32,
                DuckDBType::Float64 => DataType::Float64,
                DuckDBType::Timestamp(unit, tz) => {
                    let arrow_unit = match unit {
                        DuckDBTimeUnit::Second => TimeUnit::Second,
                        DuckDBTimeUnit::Millisecond => TimeUnit::Millisecond,
                        DuckDBTimeUnit::Microsecond => TimeUnit::Microsecond,
                        DuckDBTimeUnit::Nanosecond => TimeUnit::Nanosecond,
                    };
                    DataType::Timestamp(arrow_unit, tz.clone().map(|s| s.into()))
                }
                DuckDBType::Date32 => DataType::Date32,
                DuckDBType::Date64 => DataType::Date64,
                DuckDBType::Utf8 => DataType::Utf8,
                DuckDBType::LargeUtf8 => DataType::LargeUtf8,
                DuckDBType::Binary => DataType::Binary,
                DuckDBType::LargeBinary => DataType::LargeBinary,
                DuckDBType::Decimal128(p, s) => DataType::Decimal128(*p, *s),
                DuckDBType::Decimal256(p, s) => DataType::Decimal256(*p, *s),
                _ => DataType::Utf8, // Fallback
            };
            Field::new(f.name(), arrow_type, f.is_nullable())
        })
        .collect();
    
    Arc::new(Schema::new(fields))
}

// Helper function to convert DuckDB batch to Arrow batch
fn convert_duckdb_batch(batch: &duckdb::arrow::record_batch::RecordBatch) -> Result<RecordBatch> {
    use arrow_array::{
        ArrayRef, BooleanArray, Int8Array, Int16Array, Int32Array, Int64Array,
        UInt8Array, UInt16Array, UInt32Array, UInt64Array,
        Float32Array, Float64Array, StringArray, NullArray,
        Date32Array, Date64Array, BinaryArray, LargeBinaryArray, LargeStringArray,
        TimestampSecondArray, TimestampMillisecondArray, TimestampMicrosecondArray, TimestampNanosecondArray
    };
    use duckdb::arrow::array as duckdb_array;
    use duckdb::arrow::array::Array;
    
    let arrow_schema = convert_duckdb_schema(batch.schema().as_ref());
    
    // Convert columns - simplified version focusing on common types
    let arrow_columns: Vec<ArrayRef> = batch
        .columns()
        .iter()
        .enumerate()
        .map(|(i, col)| {
            let duckdb_arr = col.as_ref();
            let field = &arrow_schema.fields()[i];
            
            // Try to convert based on the expected data type
            match field.data_type() {
                arrow_schema::DataType::Boolean => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::BooleanArray>() {
                        let values: Vec<Option<bool>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(BooleanArray::from(values)) as ArrayRef
                    } else {
                        // Create a BooleanArray with all nulls instead of NullArray
                        let values: Vec<Option<bool>> = vec![None; duckdb_arr.len()];
                        Arc::new(BooleanArray::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Int32 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Int32Array>() {
                        let values: Vec<Option<i32>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Int32Array::from(values)) as ArrayRef
                    } else {
                        // Create an Int32Array with all nulls instead of NullArray
                        let values: Vec<Option<i32>> = vec![None; duckdb_arr.len()];
                        Arc::new(Int32Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Int64 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Int64Array>() {
                        let values: Vec<Option<i64>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Int64Array::from(values)) as ArrayRef
                    } else {
                        // Create an Int64Array with all nulls instead of NullArray
                        let values: Vec<Option<i64>> = vec![None; duckdb_arr.len()];
                        Arc::new(Int64Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Float32 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Float32Array>() {
                        let values: Vec<Option<f32>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Float32Array::from(values)) as ArrayRef
                    } else {
                        // Create a Float32Array with all nulls instead of NullArray
                        let values: Vec<Option<f32>> = vec![None; duckdb_arr.len()];
                        Arc::new(Float32Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Float64 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Float64Array>() {
                        let values: Vec<Option<f64>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Float64Array::from(values)) as ArrayRef
                    } else {
                        // Create a Float64Array with all nulls instead of NullArray
                        let values: Vec<Option<f64>> = vec![None; duckdb_arr.len()];
                        Arc::new(Float64Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Utf8 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::StringArray>() {
                        let values: Vec<Option<&str>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(StringArray::from(values)) as ArrayRef
                    } else {
                        // Create a StringArray with all nulls instead of NullArray
                        let values: Vec<Option<&str>> = vec![None; duckdb_arr.len()];
                        Arc::new(StringArray::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Date32 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Date32Array>() {
                        let values: Vec<Option<i32>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Date32Array::from(values)) as ArrayRef
                    } else {
                        // Create a Date32Array with all nulls instead of NullArray
                        let values: Vec<Option<i32>> = vec![None; duckdb_arr.len()];
                        Arc::new(Date32Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Date64 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Date64Array>() {
                        let values: Vec<Option<i64>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Date64Array::from(values)) as ArrayRef
                    } else {
                        // Create a Date64Array with all nulls instead of NullArray
                        let values: Vec<Option<i64>> = vec![None; duckdb_arr.len()];
                        Arc::new(Date64Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Int8 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Int8Array>() {
                        let values: Vec<Option<i8>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Int8Array::from(values)) as ArrayRef
                    } else {
                        // Create an Int8Array with all nulls instead of NullArray
                        let values: Vec<Option<i8>> = vec![None; duckdb_arr.len()];
                        Arc::new(Int8Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Int16 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::Int16Array>() {
                        let values: Vec<Option<i16>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(Int16Array::from(values)) as ArrayRef
                    } else {
                        // Create an Int16Array with all nulls instead of NullArray
                        let values: Vec<Option<i16>> = vec![None; duckdb_arr.len()];
                        Arc::new(Int16Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::UInt8 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::UInt8Array>() {
                        let values: Vec<Option<u8>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(UInt8Array::from(values)) as ArrayRef
                    } else {
                        // Create a UInt8Array with all nulls instead of NullArray
                        let values: Vec<Option<u8>> = vec![None; duckdb_arr.len()];
                        Arc::new(UInt8Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::UInt16 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::UInt16Array>() {
                        let values: Vec<Option<u16>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(UInt16Array::from(values)) as ArrayRef
                    } else {
                        // Create a UInt16Array with all nulls instead of NullArray
                        let values: Vec<Option<u16>> = vec![None; duckdb_arr.len()];
                        Arc::new(UInt16Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::UInt32 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::UInt32Array>() {
                        let values: Vec<Option<u32>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(UInt32Array::from(values)) as ArrayRef
                    } else {
                        // Create a UInt32Array with all nulls instead of NullArray
                        let values: Vec<Option<u32>> = vec![None; duckdb_arr.len()];
                        Arc::new(UInt32Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::UInt64 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::UInt64Array>() {
                        let values: Vec<Option<u64>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(UInt64Array::from(values)) as ArrayRef
                    } else {
                        // Create a UInt64Array with all nulls instead of NullArray
                        let values: Vec<Option<u64>> = vec![None; duckdb_arr.len()];
                        Arc::new(UInt64Array::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Binary => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::BinaryArray>() {
                        let values: Vec<Option<&[u8]>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(BinaryArray::from_opt_vec(values)) as ArrayRef
                    } else {
                        // Create a BinaryArray with all nulls instead of NullArray
                        let values: Vec<Option<&[u8]>> = vec![None; duckdb_arr.len()];
                        Arc::new(BinaryArray::from_opt_vec(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::LargeBinary => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::LargeBinaryArray>() {
                        let values: Vec<Option<&[u8]>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(LargeBinaryArray::from_opt_vec(values)) as ArrayRef
                    } else {
                        // Create a LargeBinaryArray with all nulls instead of NullArray
                        let values: Vec<Option<&[u8]>> = vec![None; duckdb_arr.len()];
                        Arc::new(LargeBinaryArray::from_opt_vec(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::LargeUtf8 => {
                    if let Some(arr) = duckdb_arr.as_any().downcast_ref::<duckdb_array::LargeStringArray>() {
                        let values: Vec<Option<&str>> = (0..arr.len())
                            .map(|i| if arr.is_valid(i) { Some(arr.value(i)) } else { None })
                            .collect();
                        Arc::new(LargeStringArray::from(values)) as ArrayRef
                    } else {
                        // Create a LargeStringArray with all nulls instead of NullArray
                        let values: Vec<Option<&str>> = vec![None; duckdb_arr.len()];
                        Arc::new(LargeStringArray::from(values)) as ArrayRef
                    }
                }
                arrow_schema::DataType::Timestamp(arrow_schema::TimeUnit::Second, tz) => {
                    convert_timestamp!(duckdb_arr, duckdb_array::TimestampSecondArray, TimestampSecondArray, tz.clone())
                }
                arrow_schema::DataType::Timestamp(arrow_schema::TimeUnit::Millisecond, tz) => {
                    convert_timestamp!(duckdb_arr, duckdb_array::TimestampMillisecondArray, TimestampMillisecondArray, tz.clone())
                }
                arrow_schema::DataType::Timestamp(arrow_schema::TimeUnit::Microsecond, tz) => {
                    convert_timestamp!(duckdb_arr, duckdb_array::TimestampMicrosecondArray, TimestampMicrosecondArray, tz.clone())
                }
                arrow_schema::DataType::Timestamp(arrow_schema::TimeUnit::Nanosecond, tz) => {
                    convert_timestamp!(duckdb_arr, duckdb_array::TimestampNanosecondArray, TimestampNanosecondArray, tz.clone())
                }
                _ => {
                    // For unsupported types, create a null array
                    Arc::new(NullArray::new(duckdb_arr.len())) as ArrayRef
                }
            }
        })
        .collect();
    
    RecordBatch::try_new(arrow_schema, arrow_columns)
        .map_err(|e| anyhow::anyhow!("Failed to create Arrow RecordBatch: {}", e))
}
