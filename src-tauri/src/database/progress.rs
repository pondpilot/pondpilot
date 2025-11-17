use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

pub const QUERY_PROGRESS_EVENT: &str = "pondpilot://query-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryProgressPayload {
    pub connection_id: String,
    pub query_run_id: String,
    pub sql_preview: String,
    pub status: QueryProgressStatus,
    pub percentage: f64,
    pub rows_processed: u64,
    pub total_rows_to_process: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum QueryProgressStatus {
    Running,
    Finished,
}

#[derive(Debug)]
pub struct QueryProgressDispatcher {
    sender: UnboundedSender<QueryProgressPayload>,
}

impl QueryProgressDispatcher {
    pub fn new(app_handle: AppHandle) -> Arc<Self> {
        let (sender, receiver) = unbounded_channel();
        start_event_forwarder(app_handle, receiver);
        Arc::new(Self { sender })
    }

    pub fn emit(&self, payload: QueryProgressPayload) {
        // Ignore send errors (receiver dropped during shutdown)
        let _ = self.sender.send(payload);
    }
}

fn start_event_forwarder(
    app_handle: AppHandle,
    mut receiver: UnboundedReceiver<QueryProgressPayload>,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(payload) = receiver.recv().await {
            // Only log in debug builds to avoid spamming release logs
            #[cfg(debug_assertions)]
            tracing::debug!(
                "[QUERY_PROGRESS] connection={} status={:?} percentage={:.2}",
                payload.connection_id,
                payload.status,
                payload.percentage
            );
            let _ = app_handle.emit(QUERY_PROGRESS_EVENT, payload);
        }
    });
}
