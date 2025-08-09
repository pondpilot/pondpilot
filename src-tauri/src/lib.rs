// Library root for exposing modules to tests

pub mod config;
pub mod database;
pub mod errors;
pub mod persistence;
pub mod system_resources;

// Re-export commonly used types
pub use config::AppConfig;
pub use errors::{DuckDBError, Result};