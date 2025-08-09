use crate::database::{DuckDBEngine, QueryHints};
use crate::database::arrow_streaming::ArrowStreamMessage;
use crate::streaming::StreamManager;
use crate::errors::{DuckDBError, Result as DuckDBResult};
use super::EngineState;
use anyhow::Result;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use base64::{Engine as _, engine::general_purpose};
use arrow_ipc::writer::StreamWriter;
use std::sync::Arc as StdArc;
use tracing::debug;

/// Escape a SQL identifier (table name, column name, etc.) for DuckDB
fn escape_identifier(name: &str) -> String {
    // DuckDB uses double quotes for identifiers
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Escape a string literal for use in SQL statements
fn escape_string_literal(value: &str) -> String {
    // DuckDB uses single quotes for string literals
    format!("'{}'", value.replace('\'', "''"))
}

#[tauri::command]
pub async fn stream_query(
    app: AppHandle,
    engine: EngineState<'_>,
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    sql: String,
    stream_id: String,
    attach: Option<serde_json::Value>,
) -> DuckDBResult<()> {
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
                // Emit error event
                let _ = app_clone2.emit(&format!("stream-{}-error", stream_id_clone), &e.to_string());
            }
        }
        
        // Always cleanup
        stream_manager.cleanup_stream(&stream_id_clone).await;
    });
    
    Ok(())
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
    
    // Use the new unified API - no lock needed
    // Build setup statements: load essential extensions and perform ATTACH if provided
    let mut setup_stmts: Vec<String> = Vec::new();

    // Ensure queries run against the main database for consistent view resolution
    setup_stmts.push("USE main".to_string());

    // Always try to load core extensions commonly required
    setup_stmts.push("LOAD parquet".to_string());
    setup_stmts.push("LOAD json".to_string());
    setup_stmts.push("LOAD excel".to_string());
    setup_stmts.push("LOAD httpfs".to_string());
    // MotherDuck support for md: URLs
    setup_stmts.push("LOAD motherduck".to_string());
    // Community/optional extensions that may be needed
    setup_stmts.push("LOAD gsheets".to_string());
    setup_stmts.push("LOAD read_stat".to_string());

    if let Some(ref spec) = attach {
        // Support single object or array of objects
        if spec.is_array() {
            if let Some(arr) = spec.as_array() {
                for item in arr {
                    if let (Some(db_name), Some(url)) = (
                        item.get("dbName").and_then(|v| v.as_str()),
                        item.get("url").and_then(|v| v.as_str()),
                    ) {
                        let read_only = item.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(true);
                        let escaped_db_name = escape_identifier(db_name);
                        let escaped_url = escape_string_literal(url);
                        // Special handling for MotherDuck: ATTACH 'md:db' does not support alias
                        if url.starts_with("md:") {
                            setup_stmts.push(format!("DETACH DATABASE IF EXISTS {}", escaped_db_name));
                            setup_stmts.push(format!("ATTACH {}", escaped_url));
                        } else {
                            setup_stmts.push(format!("DETACH DATABASE IF EXISTS {}", escaped_db_name));
                            let attach_sql = if read_only {
                                format!("ATTACH {} AS {} (READ_ONLY)", escaped_url, escaped_db_name)
                            } else {
                                format!("ATTACH {} AS {}", escaped_url, escaped_db_name)
                            };
                            setup_stmts.push(attach_sql);
                        }
                    }
                }
            }
        } else {
            if let (Some(db_name), Some(url)) = (
                spec.get("dbName").and_then(|v| v.as_str()),
                spec.get("url").and_then(|v| v.as_str()),
            ) {
                let read_only = spec.get("readOnly").and_then(|v| v.as_bool()).unwrap_or(true);
                let escaped_db_name = escape_identifier(db_name);
                let escaped_url = escape_string_literal(url);
                if url.starts_with("md:") {
                    setup_stmts.push(format!("DETACH DATABASE IF EXISTS {}", escaped_db_name));
                    setup_stmts.push(format!("ATTACH {}", escaped_url));
                } else {
                    setup_stmts.push(format!("DETACH DATABASE IF EXISTS {}", escaped_db_name));
                    let attach_sql = if read_only {
                        format!("ATTACH {} AS {} (READ_ONLY)", escaped_url, escaped_db_name)
                    } else {
                        format!("ATTACH {} AS {}", escaped_url, escaped_db_name)
                    };
                    setup_stmts.push(attach_sql);
                }
            }
        }
    }

    let mut arrow_stream = engine.execute_arrow_streaming(
        sql.clone(),
        QueryHints::streaming(),
        Some(cancel_token.clone()),
        Some(setup_stmts),
    ).await?;
    
    let mut batch_count = 0;
    let mut unacked_batches = 0;
    const MAX_UNACKED_BATCHES: usize = 5; // Allow up to 5 unacknowledged batches
    
    // Process arrow stream messages
    while let Some(msg) = arrow_stream.recv().await {
        // Check cancellation
        if cancel_token.is_cancelled() {
            debug!("[STREAMING] Stream {} cancelled", stream_id);
            break;
        }
        
        match msg {
            ArrowStreamMessage::Schema(schema) => {
                debug!("[STREAMING] Received schema for stream {}", stream_id);
                
                // Serialize schema to IPC format
                let mut schema_buffer = Vec::new();
                {
                    let arrow_schema = convert_duckdb_schema(&schema);
                    let mut writer = StreamWriter::try_new(&mut schema_buffer, &arrow_schema)?;
                    writer.finish()?;
                }
                
                let schema_base64 = general_purpose::STANDARD.encode(&schema_buffer);
                app.emit(&format!("stream-{}-schema", stream_id), &schema_base64)?;
            }
            
            ArrowStreamMessage::Batch(batch) => {
                batch_count += 1;
                debug!("[STREAMING] Received batch {} for stream {} ({} rows)", 
                         batch_count, stream_id, batch.num_rows());
                
                // Check if we need to wait for acknowledgments
                if unacked_batches >= MAX_UNACKED_BATCHES {
                    debug!("[STREAMING] Waiting for acknowledgment (unacked: {})", unacked_batches);
                    // Wait for acknowledgment before proceeding
                    match ack_rx.recv().await {
                        Some(_) => {
                            unacked_batches -= 1;
                            debug!("[STREAMING] Received acknowledgment, continuing");
                        }
                        None => {
                            debug!("[STREAMING] Acknowledgment channel closed");
                            break;
                        }
                    }
                }
                
                // Serialize batch to IPC format
                let mut batch_buffer = Vec::new();
                {
                    let arrow_schema = convert_duckdb_schema(batch.schema_ref());
                    let arrow_batch = convert_duckdb_batch(&batch, &arrow_schema)?;
                    
                    let mut writer = StreamWriter::try_new(&mut batch_buffer, &arrow_schema)?;
                    writer.write(&arrow_batch)?;
                    writer.finish()?;
                }
                
                let batch_base64 = general_purpose::STANDARD.encode(&batch_buffer);
                app.emit(&format!("stream-{}-batch", stream_id), &batch_base64)?;
                unacked_batches += 1;
            }
            
            ArrowStreamMessage::Complete(total_batches) => {
                debug!("[STREAMING] Stream {} completed with {} batches", stream_id, total_batches);
                app.emit(&format!("stream-{}-complete", stream_id), &batch_count)?;
                break;
            }
            
            ArrowStreamMessage::Error(error) => {
                debug!("[STREAMING] Stream {} error: {}", stream_id, error);
                app.emit(&format!("stream-{}-error", stream_id), &error)?;
                return Err(anyhow::anyhow!("Streaming error: {}", error));
            }
        }
    }
    
    // Always send completion event
    app.emit(&format!("stream-{}-complete", stream_id), &batch_count)?;
    
    debug!("[STREAMING] ===== STREAM {} COMPLETE =====", stream_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_stream(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    stream_id: String,
) -> DuckDBResult<()> {
    debug!("[STREAMING] !!!!! CANCEL REQUEST FOR STREAM {} !!!!!", stream_id);
    debug!("[STREAMING] Cancelling stream {}", stream_id);
    stream_manager
        .cancel_stream(&stream_id)
        .await
        .map_err(|e| DuckDBError::InvalidOperation {
            message: format!("Failed to cancel stream: {}", e),
        })?;
    debug!("[STREAMING] Stream {} cancellation token triggered", stream_id);
    
    Ok(())
}

#[tauri::command]
pub async fn acknowledge_stream_batch(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    stream_id: String,
) -> DuckDBResult<()> {
    debug!("[COMMAND] acknowledge_stream_batch called for stream {}", stream_id);
    stream_manager.inner().acknowledge_batch(&stream_id).await
        .map_err(|e| DuckDBError::InvalidOperation {
            message: format!("Failed to acknowledge batch: {}", e),
        })?;
    Ok(())
}

// Helper function to convert DuckDB schema to Arrow schema
fn convert_duckdb_schema(duckdb_schema: &duckdb::arrow::datatypes::Schema) -> StdArc<arrow_schema::Schema> {
    use arrow_schema::{Field, Schema};
    
    let fields: Vec<Field> = duckdb_schema
        .fields()
        .iter()
        .map(|f| {
            let data_type = convert_duckdb_datatype(f.data_type());
            Field::new(f.name(), data_type, f.is_nullable())
        })
        .collect();
    
    StdArc::new(Schema::new(fields))
}

// Helper function to convert DuckDB datatype to Arrow datatype
fn convert_duckdb_datatype(dt: &duckdb::arrow::datatypes::DataType) -> arrow_schema::DataType {
    use duckdb::arrow::datatypes::DataType as DuckDBDataType;
    use duckdb::arrow::datatypes::TimeUnit as DuckDBTimeUnit;
    use arrow_schema::{DataType, TimeUnit, Field};
    
    match dt {
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
        DuckDBDataType::LargeUtf8 => DataType::LargeUtf8,
        DuckDBDataType::Date32 => DataType::Date32,
        DuckDBDataType::Date64 => DataType::Date64,
        DuckDBDataType::Time32(unit) => match unit {
            DuckDBTimeUnit::Second => DataType::Time32(TimeUnit::Second),
            DuckDBTimeUnit::Millisecond => DataType::Time32(TimeUnit::Millisecond),
            _ => DataType::Time32(TimeUnit::Millisecond),
        },
        DuckDBDataType::Time64(unit) => match unit {
            DuckDBTimeUnit::Microsecond => DataType::Time64(TimeUnit::Microsecond),
            DuckDBTimeUnit::Nanosecond => DataType::Time64(TimeUnit::Nanosecond),
            _ => DataType::Time64(TimeUnit::Microsecond),
        },
        DuckDBDataType::Timestamp(unit, tz) => {
            let time_unit = match unit {
                DuckDBTimeUnit::Second => TimeUnit::Second,
                DuckDBTimeUnit::Millisecond => TimeUnit::Millisecond,
                DuckDBTimeUnit::Microsecond => TimeUnit::Microsecond,
                DuckDBTimeUnit::Nanosecond => TimeUnit::Nanosecond,
            };
            DataType::Timestamp(time_unit, tz.clone())
        },
        DuckDBDataType::Binary => DataType::Binary,
        DuckDBDataType::LargeBinary => DataType::LargeBinary,
        DuckDBDataType::Decimal128(p, s) => DataType::Decimal128(*p, *s),
        DuckDBDataType::Decimal256(p, s) => DataType::Decimal256(*p, *s),
        DuckDBDataType::List(field) => {
            // Convert the inner field
            let inner_field = Field::new(
                field.name(),
                convert_duckdb_datatype(field.data_type()),
                field.is_nullable()
            );
            DataType::List(StdArc::new(inner_field))
        },
        DuckDBDataType::LargeList(field) => {
            // Convert the inner field
            let inner_field = Field::new(
                field.name(),
                convert_duckdb_datatype(field.data_type()),
                field.is_nullable()
            );
            DataType::LargeList(StdArc::new(inner_field))
        },
        DuckDBDataType::FixedSizeList(field, size) => {
            // Convert the inner field
            let inner_field = Field::new(
                field.name(),
                convert_duckdb_datatype(field.data_type()),
                field.is_nullable()
            );
            DataType::FixedSizeList(StdArc::new(inner_field), *size)
        },
        DuckDBDataType::Struct(fields) => {
            // Convert all struct fields
            let converted_fields: Vec<Field> = fields
                .iter()
                .map(|f| Field::new(
                    f.name(),
                    convert_duckdb_datatype(f.data_type()),
                    f.is_nullable()
                ))
                .collect();
            DataType::Struct(converted_fields.into())
        },
        DuckDBDataType::Union(_fields, _mode) => {
            // Convert union fields - for now, default to Utf8 as Union type handling is complex
            debug!("[STREAMING] Warning: Union type not fully supported, defaulting to Utf8");
            DataType::Utf8
        },
        DuckDBDataType::Dictionary(key_type, value_type) => {
            DataType::Dictionary(
                Box::new(convert_duckdb_datatype(key_type)),
                Box::new(convert_duckdb_datatype(value_type))
            )
        },
        DuckDBDataType::Map(field, sorted) => {
            // Convert the map field
            let inner_field = Field::new(
                field.name(),
                convert_duckdb_datatype(field.data_type()),
                field.is_nullable()
            );
            DataType::Map(StdArc::new(inner_field), *sorted)
        },
        _ => {
            debug!("[STREAMING] Warning: Unhandled DuckDB datatype: {:?}, defaulting to Utf8", dt);
            DataType::Utf8
        }
    }
}

// Helper function to convert DuckDB batch to Arrow batch
fn convert_duckdb_batch(
    duckdb_batch: &duckdb::arrow::record_batch::RecordBatch,
    arrow_schema: &StdArc<arrow_schema::Schema>,
) -> Result<arrow_array::RecordBatch> {
    use arrow_array::{ArrayRef, RecordBatch};
    
    // For now, we'll use the same arrays since DuckDB uses Arrow internally
    // In production, we might need to handle conversions
    let columns: Vec<ArrayRef> = duckdb_batch
        .columns()
        .iter()
        .map(|col| col.clone() as ArrayRef)
        .collect();
    
    RecordBatch::try_new(arrow_schema.clone(), columns)
        .map_err(|e| anyhow::anyhow!("Failed to create Arrow batch: {}", e))
}
