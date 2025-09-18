use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum DuckDBError {
    #[error("Connection error: {message}")]
    ConnectionError {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        context: Option<String>,
    },

    #[error("Query execution failed: {message}")]
    QueryError {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sql: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_code: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        line_number: Option<usize>,
    },

    #[error("File not found: {path}")]
    FileNotFound {
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        context: Option<String>,
    },

    #[error("Invalid operation: {message}")]
    InvalidOperation {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        operation: Option<String>,
    },

    #[error("File access error: {message}")]
    FileAccess {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        path: Option<String>,
    },

    #[error("Invalid query: {message}")]
    InvalidQuery {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sql: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        position: Option<usize>,
    },

    #[error("Persistence error: {message}")]
    PersistenceError {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        operation: Option<String>,
    },

    #[error("Pool exhausted: {message}")]
    PoolExhausted {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        current_size: Option<usize>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_size: Option<usize>,
    },

    #[error("Initialization error: {message}")]
    InitializationError {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        component: Option<String>,
    },

    #[error("Serialization error: {message}")]
    SerializationError {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        data_type: Option<String>,
    },

    #[error("Unsupported extension: {extension}")]
    UnsupportedExtension {
        extension: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },

    #[error("Resource limit exceeded: {resource} - {limit}")]
    ResourceLimit {
        resource: String,
        limit: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        current_usage: Option<String>,
    },

    #[error("Query execution failed: {message}")]
    QueryExecution {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        query: Option<String>,
    },

    #[error("Parameter binding error: {message}")]
    ParameterBinding { message: String },
}

impl From<duckdb::Error> for DuckDBError {
    fn from(err: duckdb::Error) -> Self {
        // Provide more context based on error string content
        let err_string = err.to_string();

        // Extract error code if available
        let error_code = match &err {
            duckdb::Error::DuckDBFailure(_, msg) => msg.clone(),
            _ => None,
        };

        // Parse line number from error message if present
        let line_number = err_string.find("line ").and_then(|pos| {
            let rest = &err_string[pos + 5..];
            rest.split_whitespace()
                .next()
                .and_then(|s| s.parse::<usize>().ok())
        });

        let message = if err_string.contains("no rows") {
            "Query returned no rows when at least one was expected".to_string()
        } else if err_string.contains("constraint") {
            format!("Database constraint violation: {}", err_string)
        } else if err_string.contains("syntax") {
            format!("SQL syntax error: {}", err_string)
        } else if err_string.contains("Permission denied") {
            format!("Database permission error: {}", err_string)
        } else if err_string.contains("out of memory") || err_string.contains("OOM") {
            format!("Database out of memory: {}", err_string)
        } else {
            format!("Database error: {}", err_string)
        };

        DuckDBError::QueryError {
            message,
            sql: None,
            error_code: error_code.map(|s| s.to_string()),
            line_number,
        }
    }
}

impl From<rusqlite::Error> for DuckDBError {
    fn from(err: rusqlite::Error) -> Self {
        let operation = match err {
            rusqlite::Error::QueryReturnedNoRows => Some("query".to_string()),
            rusqlite::Error::InvalidColumnIndex(_) => Some("column_access".to_string()),
            rusqlite::Error::InvalidColumnName(_) => Some("column_access".to_string()),
            _ => None,
        };

        DuckDBError::PersistenceError {
            message: err.to_string(),
            operation,
        }
    }
}

impl From<std::io::Error> for DuckDBError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => DuckDBError::FileNotFound {
                path: err.to_string(),
                context: None,
            },
            std::io::ErrorKind::PermissionDenied => DuckDBError::FileAccess {
                message: format!("Permission denied: {}", err),
                path: None,
            },
            std::io::ErrorKind::AlreadyExists => DuckDBError::FileAccess {
                message: format!("File already exists: {}", err),
                path: None,
            },
            _ => DuckDBError::InvalidOperation {
                message: format!("I/O error: {} (kind: {:?})", err, err.kind()),
                operation: Some(format!("{:?}", err.kind())),
            },
        }
    }
}

impl From<serde_json::Error> for DuckDBError {
    fn from(err: serde_json::Error) -> Self {
        let data_type = if err.to_string().contains("Deserialize") {
            Some("deserialization".to_string())
        } else if err.to_string().contains("Serialize") {
            Some("serialization".to_string())
        } else {
            None
        };

        DuckDBError::SerializationError {
            message: err.to_string(),
            data_type,
        }
    }
}

pub type Result<T> = std::result::Result<T, DuckDBError>;
