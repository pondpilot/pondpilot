use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum SecretError {
    #[error("Keychain access denied")]
    KeychainAccessDenied,

    #[error("Secret not found: {id}")]
    SecretNotFound { id: String },

    #[error("Invalid credentials for {secret_type}")]
    InvalidCredentials { secret_type: String },

    #[error("Platform not supported")]
    PlatformNotSupported,

    #[error("Encryption failed")]
    EncryptionFailed,

    #[error("Decryption failed")]
    DecryptionFailed,

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("DuckDB integration failed: {error}")]
    DuckDBIntegrationFailed { error: String },

    #[error("Missing required credential: {0}")]
    MissingCredential(String),

    #[error("DuckDB injection failed for {secret_type}: {error}")]
    DuckDBInjection { secret_type: String, error: String },

    #[error("Keychain error: {0}")]
    KeychainError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl From<keyring::Error> for SecretError {
    fn from(err: keyring::Error) -> Self {
        match err {
            keyring::Error::NoEntry => SecretError::SecretNotFound {
                id: "unknown".to_string(),
            },
            keyring::Error::NoStorageAccess(_) => SecretError::KeychainAccessDenied,
            keyring::Error::PlatformFailure(msg) => SecretError::KeychainError(msg.to_string()),
            _ => SecretError::KeychainError(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for SecretError {
    fn from(err: serde_json::Error) -> Self {
        SecretError::SerializationError(err.to_string())
    }
}

impl From<rusqlite::Error> for SecretError {
    fn from(err: rusqlite::Error) -> Self {
        SecretError::DatabaseError(err.to_string())
    }
}
