use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum DuckDBError {
    #[error("Connection error: {message}")]
    ConnectionError { message: String },

    #[error("Query execution failed: {message}")]
    QueryError { 
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sql: Option<String>,
    },

    #[error("File not found: {path}")]
    FileNotFound { path: String },

    #[error("Invalid operation: {message}")]
    InvalidOperation { message: String },

    #[error("Persistence error: {message}")]
    PersistenceError { message: String },

    #[error("Pool exhausted: {message}")]
    PoolExhausted { message: String },

    #[error("Initialization error: {message}")]
    InitializationError { message: String },

    #[error("Serialization error: {message}")]
    SerializationError { message: String },

    #[error("Unsupported extension: {0}")]
    UnsupportedExtension(String),

    #[error("Resource limit exceeded: {resource} - {limit}")]
    ResourceLimit { resource: String, limit: String },
}

impl From<duckdb::Error> for DuckDBError {
    fn from(err: duckdb::Error) -> Self {
        DuckDBError::QueryError {
            message: err.to_string(),
            sql: None,
        }
    }
}

impl From<rusqlite::Error> for DuckDBError {
    fn from(err: rusqlite::Error) -> Self {
        DuckDBError::PersistenceError {
            message: err.to_string(),
        }
    }
}

impl From<std::io::Error> for DuckDBError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => DuckDBError::FileNotFound {
                path: err.to_string(),
            },
            _ => DuckDBError::InvalidOperation {
                message: err.to_string(),
            },
        }
    }
}

impl From<serde_json::Error> for DuckDBError {
    fn from(err: serde_json::Error) -> Self {
        DuckDBError::SerializationError {
            message: err.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, DuckDBError>;