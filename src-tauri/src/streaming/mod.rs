use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use anyhow::Result;

pub struct StreamManager {
    active_streams: Arc<Mutex<HashMap<String, StreamHandle>>>,
}

struct StreamHandle {
    cancel_token: CancellationToken,
}

impl StreamManager {
    pub fn new() -> Self {
        Self {
            active_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register_stream(&self, stream_id: String) -> CancellationToken {
        eprintln!("[StreamManager] Registering stream {}", stream_id);
        let cancel_token = CancellationToken::new();
        let handle = StreamHandle {
            cancel_token: cancel_token.clone(),
        };
        
        let mut streams = self.active_streams.lock().await;
        streams.insert(stream_id.clone(), handle);
        eprintln!("[StreamManager] Stream {} registered, active streams: {}", stream_id, streams.len());
        
        cancel_token
    }

    pub async fn cancel_stream(&self, stream_id: &str) -> Result<()> {
        eprintln!("[StreamManager] Cancel request for stream {}", stream_id);
        let mut streams = self.active_streams.lock().await;
        if let Some(handle) = streams.remove(stream_id) {
            eprintln!("[StreamManager] Found stream {} handle, triggering cancellation token", stream_id);
            handle.cancel_token.cancel();
            eprintln!("[StreamManager] Cancellation token triggered for stream {}", stream_id);
        } else {
            eprintln!("[StreamManager] WARNING: Stream {} not found in active streams!", stream_id);
        }
        eprintln!("[StreamManager] Active streams after cancel: {}", streams.len());
        Ok(())
    }

    pub async fn cleanup_stream(&self, stream_id: &str) {
        eprintln!("[StreamManager] Cleanup request for stream {}", stream_id);
        let mut streams = self.active_streams.lock().await;
        if streams.remove(stream_id).is_some() {
            eprintln!("[StreamManager] Stream {} removed from active streams", stream_id);
        } else {
            eprintln!("[StreamManager] Stream {} was already removed", stream_id);
        }
        eprintln!("[StreamManager] Active streams after cleanup: {}", streams.len());
    }
}


