use duckdb::Connection;
use std::cell::RefCell;
use std::thread;

/// A wrapper around DuckDB Connection that enforces thread-local usage
/// DuckDB connections are NOT thread-safe and must only be used on the thread
/// that created them. This wrapper prevents cross-thread usage.
#[derive(Debug)]
pub struct SafeConnection {
    inner: RefCell<Option<Connection>>,
    thread_id: thread::ThreadId,
}

impl SafeConnection {
    pub fn new(conn: Connection) -> Self {
        Self {
            inner: RefCell::new(Some(conn)),
            thread_id: thread::current().id(),
        }
    }
    
    /// Check if the current thread is the one that created this connection
    fn check_thread(&self) -> Result<(), String> {
        let current_thread = thread::current().id();
        if current_thread != self.thread_id {
            Err(format!(
                "Connection can only be used on the thread that created it. \
                Created on {:?}, but being used on {:?}",
                self.thread_id, current_thread
            ))
        } else {
            Ok(())
        }
    }
    
    /// Execute a function with the connection, ensuring it remains in the wrapper
    pub fn with_connection<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut Connection) -> Result<R, duckdb::Error>,
    {
        self.check_thread()?;
        
        let mut inner = self.inner.borrow_mut();
        match inner.as_mut() {
            Some(conn) => {
                // Reset any pending state before use
                let _ = conn.execute("SELECT 1", []);
                f(conn).map_err(|e| e.to_string())
            },
            None => Err("Connection has been consumed or is invalid".to_string()),
        }
    }
    
    /// Check if a connection is available
    pub fn is_available(&self) -> bool {
        if self.check_thread().is_err() {
            return false;
        }
        self.inner.borrow().is_some()
    }
    
    /// Reset the connection state for reuse
    pub fn reset(&self) -> Result<(), String> {
        self.check_thread()?;
        
        let mut inner = self.inner.borrow_mut();
        match inner.as_mut() {
            Some(conn) => {
                // Clear any pending results or transactions
                let _ = conn.execute("ROLLBACK", []);
                // Verify connection is still valid
                conn.execute("SELECT 1", [])
                    .map(|_| ())
                    .map_err(|e| format!("Connection reset failed: {}", e))
            },
            None => Err("No connection to reset".to_string()),
        }
    }
}