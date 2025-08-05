use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use anyhow::Result;

pub struct StreamManager {
    active_streams: Arc<Mutex<HashMap<String, StreamHandle>>>,
}

struct StreamHandle {
    cancel_token: CancellationToken,
    ack_sender: mpsc::Sender<()>,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            active_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register_stream(&self, stream_id: String) -> (CancellationToken, mpsc::Receiver<()>) {
        tracing::debug!("[StreamManager] Registering stream {}", stream_id);
        let cancel_token = CancellationToken::new();
        let (ack_tx, ack_rx) = mpsc::channel(1); // Buffer size of 1 for backpressure
        
        let handle = StreamHandle {
            cancel_token: cancel_token.clone(),
            ack_sender: ack_tx,
        };
        
        let mut streams = self.active_streams.lock().await;
        streams.insert(stream_id.clone(), handle);
        tracing::debug!("[StreamManager] Stream {} registered, active streams: {}", stream_id, streams.len());
        
        (cancel_token, ack_rx)
    }
    
    pub async fn acknowledge_batch(&self, stream_id: &str) -> Result<()> {
        let streams = self.active_streams.lock().await;
        if let Some(handle) = streams.get(stream_id) {
            // Send acknowledgment - if buffer is full, this will wait
            handle.ack_sender.send(()).await?;
            tracing::trace!("[StreamManager] Batch acknowledged for stream {}", stream_id);
        }
        Ok(())
    }

    pub async fn cancel_stream(&self, stream_id: &str) -> Result<()> {
        tracing::debug!("[StreamManager] Cancel request for stream {}", stream_id);
        let mut streams = self.active_streams.lock().await;
        if let Some(handle) = streams.remove(stream_id) {
            tracing::debug!("[StreamManager] Found stream {} handle, triggering cancellation token", stream_id);
            handle.cancel_token.cancel();
            tracing::debug!("[StreamManager] Cancellation token triggered for stream {}", stream_id);
        } else {
            tracing::warn!("[StreamManager] Stream {} not found in active streams!", stream_id);
        }
        tracing::debug!("[StreamManager] Active streams after cancel: {}", streams.len());
        Ok(())
    }

    pub async fn cleanup_stream(&self, stream_id: &str) {
        tracing::debug!("[StreamManager] Cleanup request for stream {}", stream_id);
        let mut streams = self.active_streams.lock().await;
        if streams.remove(stream_id).is_some() {
            tracing::debug!("[StreamManager] Stream {} removed from active streams", stream_id);
        } else {
            tracing::debug!("[StreamManager] Stream {} was already removed", stream_id);
        }
        tracing::debug!("[StreamManager] Active streams after cleanup: {}", streams.len());
    }
}


