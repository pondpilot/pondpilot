//! Application-wide constants

// Database connection limits
pub const MAX_CONNECTIONS: usize = 100;
pub const MIN_CONNECTIONS: usize = 2;
pub const DEFAULT_MAX_CONNECTIONS: usize = 10;

// Thread pool limits
pub const MAX_WORKER_THREADS: usize = 256;
pub const MIN_WORKER_THREADS: usize = 1;
pub const DEFAULT_WORKER_THREADS: usize = 4;

pub const MAX_BLOCKING_THREADS: usize = 1024;
pub const MIN_BLOCKING_THREADS: usize = 1;
pub const DEFAULT_BLOCKING_THREADS: usize = 100;
