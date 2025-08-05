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

    #[error("File access error: {message}")]
    FileAccess { message: String },

    #[error("Invalid query: {message}")]
    InvalidQuery { 
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sql: Option<String>,
    },

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
        // Provide more context based on error string content
        let err_string = err.to_string();
        let message = if err_string.contains("no rows") {
            "Query returned no rows when at least one was expected".to_string()
        } else if err_string.contains("constraint") {
            format!("Database constraint violation: {}", err_string)
        } else if err_string.contains("syntax") {
            format!("SQL syntax error: {}", err_string)
        } else {
            format!("Database error: {}", err_string)
        };
        
        DuckDBError::QueryError {
            message,
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
            std::io::ErrorKind::PermissionDenied => DuckDBError::FileAccess {
                message: format!("Permission denied: {}", err),
            },
            std::io::ErrorKind::AlreadyExists => DuckDBError::FileAccess {
                message: format!("File already exists: {}", err),
            },
            _ => DuckDBError::InvalidOperation {
                message: format!("I/O error: {} (kind: {:?})", err, err.kind()),
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