//! Security validation utilities for input sanitization and validation

use std::path::Path;
use crate::errors::{DuckDBError, Result};

/// Maximum length for stream IDs and statement IDs
const MAX_ID_LENGTH: usize = 64;

/// Maximum length for SQL statements
const MAX_SQL_LENGTH: usize = 10_000_000; // 10MB

/// Validate and sanitize a file path for ATTACH statements
/// Returns Ok if the path is safe, Err if it contains security risks
pub fn validate_attach_path(path_str: &str) -> Result<()> {
    // Skip validation for MotherDuck URLs
    if path_str.starts_with("md:") || path_str.starts_with("motherduck:") {
        return Ok(());
    }
    
    // Skip validation for HTTP(S) URLs
    if path_str.starts_with("http://") || path_str.starts_with("https://") {
        return Ok(());
    }
    
    let path = Path::new(path_str);
    
    // Reject paths with directory traversal attempts
    if path_str.contains("..") {
        return Err(DuckDBError::InvalidOperation {
            message: "Path traversal attempt detected in ATTACH statement".to_string(),
            operation: Some("validate_attach_path".to_string()),
        });
    }
    
    // For absolute paths, ensure they exist and are files
    if path.is_absolute() {
        if !path.exists() {
            return Err(DuckDBError::InvalidOperation {
                message: format!("File does not exist: {}", path_str),
                operation: Some("validate_attach_path".to_string()),
            });
        }
        
        if !path.is_file() {
            return Err(DuckDBError::InvalidOperation {
                message: format!("Path is not a file: {}", path_str),
                operation: Some("validate_attach_path".to_string()),
            });
        }
    }
    
    Ok(())
}

/// Validate SQL for basic safety checks before preparing
/// This is a lightweight check - DuckDB's prepare will do the real validation
pub fn validate_sql_safety(sql: &str) -> Result<()> {
    // Check SQL length
    if sql.len() > MAX_SQL_LENGTH {
        return Err(DuckDBError::InvalidOperation {
            message: format!("SQL statement exceeds maximum length of {} bytes", MAX_SQL_LENGTH),
            operation: Some("validate_sql_safety".to_string()),
        });
    }
    
    // Check for null bytes which could cause issues
    if sql.contains('\0') {
        return Err(DuckDBError::InvalidOperation {
            message: "SQL statement contains null bytes".to_string(),
            operation: Some("validate_sql_safety".to_string()),
        });
    }
    
    Ok(())
}

/// Validate stream ID format
pub fn validate_stream_id(id: &str) -> Result<()> {
    // Check length
    if id.is_empty() {
        return Err(DuckDBError::InvalidOperation {
            message: "Stream ID cannot be empty".to_string(),
            operation: Some("validate_stream_id".to_string()),
        });
    }
    
    if id.len() > MAX_ID_LENGTH {
        return Err(DuckDBError::InvalidOperation {
            message: format!("Stream ID exceeds maximum length of {} characters", MAX_ID_LENGTH),
            operation: Some("validate_stream_id".to_string()),
        });
    }
    
    // Allow alphanumeric, hyphens, underscores
    if !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(DuckDBError::InvalidOperation {
            message: "Stream ID contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed".to_string(),
            operation: Some("validate_stream_id".to_string()),
        });
    }
    
    Ok(())
}

/// Validate statement ID format (same rules as stream ID)
pub fn validate_statement_id(id: &str) -> Result<()> {
    // Use same validation as stream ID
    validate_stream_id(id).map_err(|e| match e {
        DuckDBError::InvalidOperation { message, .. } => DuckDBError::InvalidOperation {
            message: message.replace("Stream ID", "Statement ID"),
            operation: Some("validate_statement_id".to_string()),
        },
        e => e,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_attach_path() {
        // Valid paths
        assert!(validate_attach_path("md:my_database").is_ok());
        assert!(validate_attach_path("https://example.com/data.db").is_ok());
        assert!(validate_attach_path("/absolute/path/to/file.db").is_err()); // Would fail if file doesn't exist
        
        // Invalid paths
        assert!(validate_attach_path("../../../etc/passwd").is_err());
        assert!(validate_attach_path("/path/with/../traversal").is_err());
    }
    
    #[test]
    fn test_validate_sql_safety() {
        // Valid SQL
        assert!(validate_sql_safety("SELECT * FROM users").is_ok());
        assert!(validate_sql_safety("INSERT INTO table VALUES (1, 2, 3)").is_ok());
        
        // Invalid SQL
        assert!(validate_sql_safety("SELECT \0 FROM users").is_err());
        let huge_sql = "SELECT ".repeat(2_000_000);
        assert!(validate_sql_safety(&huge_sql).is_err());
    }
    
    #[test]
    fn test_validate_stream_id() {
        // Valid IDs
        assert!(validate_stream_id("stream-123").is_ok());
        assert!(validate_stream_id("my_stream_456").is_ok());
        assert!(validate_stream_id("ABC123xyz").is_ok());
        
        // Invalid IDs
        assert!(validate_stream_id("").is_err());
        assert!(validate_stream_id("stream/123").is_err());
        assert!(validate_stream_id("stream@123").is_err());
        assert!(validate_stream_id(&"x".repeat(100)).is_err());
    }
}