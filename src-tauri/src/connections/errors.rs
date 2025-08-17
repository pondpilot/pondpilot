use thiserror::Error;
use serde::{Deserialize, Serialize};

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum ConnectionError {
    #[error("Connection not found: {id}")]
    ConnectionNotFound { id: String },
    
    #[error("Secret not found: {secret_id}")]
    SecretNotFound { secret_id: String },
    
    #[error("Invalid connection configuration: {error}")]
    InvalidConfiguration { error: String },
    
    #[error("Connection test failed: {error}")]
    ConnectionTestFailed { error: String },
    
    #[error("Database error: {0}")]
    DatabaseError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Secret error: {0}")]
    SecretError(String),
    
    #[error("Connection type not supported: {connection_type}")]
    UnsupportedConnectionType { connection_type: String },
    
    #[error("Missing required field: {field}")]
    MissingRequiredField { field: String },
    
    #[error("Storage error: {0}")]
    StorageError(String),
}

impl From<rusqlite::Error> for ConnectionError {
    fn from(err: rusqlite::Error) -> Self {
        ConnectionError::DatabaseError(err.to_string())
    }
}

impl From<serde_json::Error> for ConnectionError {
    fn from(err: serde_json::Error) -> Self {
        ConnectionError::SerializationError(err.to_string())
    }
}

impl From<crate::secrets::errors::SecretError> for ConnectionError {
    fn from(err: crate::secrets::errors::SecretError) -> Self {
        ConnectionError::SecretError(err.to_string())
    }
}