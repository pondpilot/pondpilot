// NOTE: Streaming IPC contract
// We currently emit one Arrow IPC stream for the schema (no batches), and
// separate one-batch IPC streams for each data batch. The frontend concatenates
// the schema IPC bytes with the subsequent batch IPC bytes for decoding.
// This contract is documented here and is tested end-to-end via integration
// tests. In the future, we may switch to a single continuous writer per
// stream_id if needed across Arrow versions.
use super::EngineState;
use crate::database::arrow_streaming::ArrowStreamMessage;
use crate::database::sql_utils::{build_attach_statements, AttachItem};
use crate::database::{DuckDBEngine, QueryHints};
use crate::errors::Result as DuckDBResult;
use crate::streaming::StreamManager;
use anyhow::Result;
use arrow_array::RecordBatch;
use arrow_ipc::writer::StreamWriter;
use arrow_schema::Schema;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tracing::debug;

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
    // Support both snake_case and camelCase arg names for compatibility
    stream_id: Option<String>,
    #[allow(non_snake_case)] streamId: Option<String>,
    attach: Option<serde_json::Value>,
) -> DuckDBResult<serde_json::Value> {
    // Coalesce parameter name variants
    let stream_id = crate::commands::utils::coalesce_param_opt(
        stream_id,
        streamId,
        "stream_id",
        "stream_query",
    )?;

    // Validate stream ID format
    crate::security::validate_stream_id(&stream_id)?;

    // Validate SQL safety before execution
    if let Err(e) = crate::security::validate_sql_safety(&sql) {
        // Log security validation failure with sanitized details
        tracing::warn!(
            "[SECURITY] SQL validation failed in stream_query: {} (stream: {}, SQL length: {} chars)",
            e,
            stream_id,
            sql.len()
        );
        return Err(e);
    }

    debug!(
        "[COMMAND] stream_query called for stream {} with SQL: {}",
        stream_id, sql
    );
    let engine_arc = engine.inner().clone();
    let stream_manager = stream_manager.inner().clone();

    // Execute streaming in a separate task
    let app_clone = app.clone();
    let app_clone2 = app.clone();
    let stream_id_clone = stream_id.clone();
    let attach_spec = attach.clone();

    tokio::spawn(async move {
        match execute_streaming_query(
            app_clone,
            engine_arc,
            stream_manager.clone(),
            sql,
            stream_id_clone.clone(),
            attach_spec,
        )
        .await
        {
            Ok(_) => {
                debug!(
                    "[STREAMING] Stream {} completed successfully",
                    stream_id_clone
                );
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
    debug!(
        "[STREAMING] Starting streaming query for stream {}",
        stream_id
    );
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
                    let read_only = item
                        .get("readOnly")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    items.push(AttachItem {
                        db_name: db_name.to_string(),
                        url: url.to_string(),
                        read_only,
                    });
                }
            }
        } else {
            if let (Some(db_name), Some(url)) = (
                spec.get("dbName").and_then(|v| v.as_str()),
                spec.get("url").and_then(|v| v.as_str()),
            ) {
                let read_only = spec
                    .get("readOnly")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                items.push(AttachItem {
                    db_name: db_name.to_string(),
                    url: url.to_string(),
                    read_only,
                });
            }
        }

        // Build statements from normalized items
        let attach_sqls = build_attach_statements(&items);
        setup_stmts.extend(attach_sqls);
    }

    let mut arrow_stream = match engine
        .execute_arrow_streaming(
            sql.clone(),
            QueryHints::streaming(),
            Some(cancel_token.clone()),
            Some(setup_stmts),
        )
        .await
    {
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
                    debug!(
                        "[STREAMING] Stream {} cancelled during schema processing",
                        stream_id
                    );
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
                debug!(
                    "[STREAMING] Received batch {} for stream {} ({} rows)",
                    batch_count,
                    stream_id,
                    duckdb_batch.num_rows()
                );

                // Implement proper backpressure - block when window is full
                while unacked_batches >= MAX_UNACKED_BATCHES {
                    debug!(
                        "[STREAMING] Waiting for acknowledgment (unacked: {})",
                        unacked_batches
                    );

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
                    debug!(
                        "[STREAMING] Stream {} cancelled during batch processing",
                        stream_id
                    );
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
                debug!(
                    "[STREAMING] Stream {} complete, sent {} batches (total: {})",
                    stream_id, batch_count, total_batches
                );

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
    // Support both snake_case and camelCase arg names for compatibility
    stream_id: Option<String>,
    #[allow(non_snake_case)] streamId: Option<String>,
) -> DuckDBResult<()> {
    let stream_id = crate::commands::utils::coalesce_param_opt(
        stream_id,
        streamId,
        "stream_id",
        "cancel_stream",
    )?;

    // Validate stream ID format
    crate::security::validate_stream_id(&stream_id)?;

    debug!("[COMMAND] cancel_stream called for stream {}", stream_id);

    // Handle cancellation errors properly
    if let Err(e) = stream_manager.cancel_stream(&stream_id).await {
        tracing::warn!("Failed to cancel stream {}: {}", stream_id, e);
    }
    Ok(())
}

#[tauri::command]
pub async fn acknowledge_stream_batch(
    stream_manager: tauri::State<'_, Arc<StreamManager>>,
    // Support both snake_case and camelCase arg names for compatibility
    stream_id: Option<String>,
    #[allow(non_snake_case)] streamId: Option<String>,
    _batch_index: Option<usize>,
    #[allow(non_snake_case)] batchIndex: Option<usize>,
) -> DuckDBResult<()> {
    let stream_id = crate::commands::utils::coalesce_param_opt(
        stream_id,
        streamId,
        "stream_id",
        "acknowledge_stream_batch",
    )?;

    // Validate stream ID format
    crate::security::validate_stream_id(&stream_id)?;

    // Note: batch index isn't used server-side for now; accept both names for compatibility
    let _batch_index = _batch_index.or(batchIndex);

    debug!(
        "[COMMAND] acknowledge_stream_batch called for stream {}",
        stream_id
    );

    // Handle acknowledgment errors properly
    if let Err(e) = stream_manager.acknowledge_batch(&stream_id).await {
        tracing::warn!(
            "Failed to acknowledge batch for stream {}: {}",
            stream_id,
            e
        );
    }
    Ok(())
}

// Zero-copy conversion using type aliasing
// Since both duckdb::arrow and arrow-rs use the exact same Arrow 55.2.0 crates,
// the types are identical - this just transmutes the Arc pointer (zero copy!)
fn convert_duckdb_schema(duckdb_schema: &Arc<duckdb::arrow::datatypes::Schema>) -> Arc<Schema> {
    // SAFETY: Both Arc<Schema> types are identical from arrow-schema 55.2.0
    // DuckDB re-exports the exact same types, so this transmute is just a pointer cast
    // No data is copied - we're just reinterpreting the type at compile time
    unsafe {
        std::mem::transmute::<Arc<duckdb::arrow::datatypes::Schema>, Arc<arrow_schema::Schema>>(
            Arc::clone(duckdb_schema),
        )
    }
}

// Zero-copy conversion using type aliasing
// This replaces 300+ lines of manual value-by-value copying with a pointer cast
fn convert_duckdb_batch(batch: &duckdb::arrow::record_batch::RecordBatch) -> Result<RecordBatch> {
    // SAFETY: Both RecordBatch types are from the same arrow-array 55.2.0 crate
    // DuckDB re-exports the exact same types, so this is just a pointer cast
    // The memory layout is identical, making this safe
    unsafe {
        Ok(std::mem::transmute::<
            duckdb::arrow::record_batch::RecordBatch,
            arrow_array::RecordBatch,
        >(batch.clone()))
    }
}
