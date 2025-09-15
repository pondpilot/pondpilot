//! Application-wide constants

// Database connection limits
pub const MAX_CONNECTIONS: usize = 100;
pub const MIN_CONNECTIONS: usize = 2;
pub const DEFAULT_MIN_CONNECTIONS: usize = 1;
pub const DEFAULT_MAX_CONNECTIONS: usize = 10;

// Thread pool limits  
pub const MAX_WORKER_THREADS: usize = 256;
pub const MIN_WORKER_THREADS: usize = 1;
pub const DEFAULT_WORKER_THREADS: usize = 4;

pub const MAX_BLOCKING_THREADS: usize = 1024;
pub const MIN_BLOCKING_THREADS: usize = 1;
pub const DEFAULT_BLOCKING_THREADS: usize = 100;

// Security and validation limits
pub const MAX_ID_LENGTH: usize = 64;
pub const MAX_SQL_LENGTH: usize = 10_000_000; // 10MB
pub const MAX_ARRAY_SIZE: usize = 100_000_000; // 100M elements

// Timeout defaults (in milliseconds)
pub const DEFAULT_QUERY_TIMEOUT_MS: u64 = 120_000; // 2 minutes
pub const MAX_QUERY_TIMEOUT_MS: u64 = 600_000; // 10 minutes