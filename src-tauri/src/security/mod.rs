//! Security validation utilities for input sanitization and validation

use crate::errors::{DuckDBError, Result};
use std::path::Path;

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

/// Validate SQL for security and safety checks before execution
/// This provides defense-in-depth against potentially dangerous SQL operations
pub fn validate_sql_safety(sql: &str) -> Result<()> {
    // Check SQL length to prevent DoS
    if sql.len() > MAX_SQL_LENGTH {
        return Err(DuckDBError::SecurityViolation {
            message: "SQL statement exceeds maximum allowed length".to_string(),
            violation_type: Some("length_limit".to_string()),
        });
    }

    // Check for null bytes which could cause parser issues
    if sql.contains('\0') {
        return Err(DuckDBError::SecurityViolation {
            message: "SQL statement contains null bytes".to_string(),
            violation_type: Some("null_bytes".to_string()),
        });
    }

    // Normalize SQL for analysis (trim whitespace, convert to uppercase for keyword detection)
    let normalized = sql.trim().to_uppercase();

    if normalized.is_empty() {
        return Err(DuckDBError::SecurityViolation {
            message: "SQL statement is empty".to_string(),
            violation_type: Some("empty_statement".to_string()),
        });
    }

    // Check for multiple statements (simple heuristic - look for semicolons outside of strings)
    // This is a basic check; the real validation happens in DuckDB
    if has_multiple_statements(sql) {
        return Err(DuckDBError::SecurityViolation {
            message: "Multiple SQL statements are not allowed".to_string(),
            violation_type: Some("multiple_statements".to_string()),
        });
    }

    // Block dangerous DDL operations
    let dangerous_ddl = [
        "DROP ",
        "CREATE EXTENSION",
        "INSTALL ",
        "LOAD ",
        "ATTACH DATABASE",
        "DETACH ",
    ];

    for keyword in &dangerous_ddl {
        if normalized.starts_with(keyword) {
            return Err(DuckDBError::SecurityViolation {
                message: format!("DDL operation not allowed: {}", keyword.trim()),
                violation_type: Some("dangerous_ddl".to_string()),
            });
        }
    }

    // Block dangerous file system operations
    let filesystem_ops = ["COPY ", "EXPORT "];

    for keyword in &filesystem_ops {
        if normalized.starts_with(keyword) {
            return Err(DuckDBError::SecurityViolation {
                message: format!("File system operation not allowed: {}", keyword.trim()),
                violation_type: Some("filesystem_operation".to_string()),
            });
        }
    }

    // Block dangerous PRAGMA operations
    // We allow some read-only PRAGMAs but block those that could change behavior
    if normalized.starts_with("PRAGMA ") {
        let dangerous_pragmas = [
            "PRAGMA ENABLE_EXTERNAL_ACCESS",
            "PRAGMA ENABLE_OBJECT_CACHE",
            "PRAGMA FORCE_COMPRESSION",
            "PRAGMA MEMORY_LIMIT",
            "PRAGMA THREADS",
            "PRAGMA WORKER_THREADS",
        ];

        for dangerous in &dangerous_pragmas {
            if normalized.starts_with(dangerous) {
                return Err(DuckDBError::SecurityViolation {
                    message: format!(
                        "Dangerous PRAGMA not allowed: {}",
                        dangerous.trim_start_matches("PRAGMA ")
                    ),
                    violation_type: Some("dangerous_pragma".to_string()),
                });
            }
        }
    }

    // Block SET commands that could change session state in dangerous ways
    if normalized.starts_with("SET ") {
        let dangerous_settings = ["SET enable_external_access", "SET enable_object_cache"];

        for setting in &dangerous_settings {
            if normalized.starts_with(&setting.to_uppercase()) {
                return Err(DuckDBError::SecurityViolation {
                    message: format!(
                        "Dangerous SET command not allowed: {}",
                        setting.trim_start_matches("SET ")
                    ),
                    violation_type: Some("dangerous_set".to_string()),
                });
            }
        }
    }

    Ok(())
}

/// Check if SQL contains multiple statements
/// This is a heuristic check - looks for semicolons that aren't in string literals
fn has_multiple_statements(sql: &str) -> bool {
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut prev_char = ' ';
    let mut semicolon_count = 0;

    for ch in sql.chars() {
        match ch {
            '\'' if !in_double_quote && prev_char != '\\' => {
                in_single_quote = !in_single_quote;
            }
            '"' if !in_single_quote && prev_char != '\\' => {
                in_double_quote = !in_double_quote;
            }
            ';' if !in_single_quote && !in_double_quote => {
                semicolon_count += 1;
                // Allow one trailing semicolon
                if semicolon_count > 1 {
                    return true;
                }
            }
            _ => {}
        }
        prev_char = ch;
    }

    // Check if semicolon is not just trailing whitespace
    if semicolon_count == 1 {
        // If there's only one semicolon and it's at the end (ignoring whitespace), it's ok
        if let Some(last_semicolon) = sql.rfind(';') {
            let after_semicolon = &sql[last_semicolon + 1..];
            // If there's anything besides whitespace after the semicolon, it's multiple statements
            return !after_semicolon.trim().is_empty();
        }
    }

    false
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
            message: format!(
                "Stream ID exceeds maximum length of {} characters",
                MAX_ID_LENGTH
            ),
            operation: Some("validate_stream_id".to_string()),
        });
    }

    // Allow alphanumeric, hyphens, underscores
    if !id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
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
    fn test_validate_sql_safety_basic() {
        // Valid SQL
        assert!(validate_sql_safety("SELECT * FROM users").is_ok());
        assert!(validate_sql_safety("INSERT INTO table VALUES (1, 2, 3)").is_ok());
        assert!(validate_sql_safety("UPDATE users SET name = 'test'").is_ok());
        assert!(validate_sql_safety("DELETE FROM users WHERE id = 1").is_ok());
        assert!(validate_sql_safety("SELECT * FROM users;").is_ok()); // trailing semicolon ok
        assert!(validate_sql_safety("  SELECT * FROM users  ").is_ok()); // whitespace ok

        // Invalid SQL - null bytes
        assert!(validate_sql_safety("SELECT \0 FROM users").is_err());

        // Invalid SQL - too long
        let huge_sql = "SELECT ".repeat(2_000_000);
        assert!(validate_sql_safety(&huge_sql).is_err());

        // Invalid SQL - empty
        assert!(validate_sql_safety("").is_err());
        assert!(validate_sql_safety("   ").is_err());
    }

    #[test]
    fn test_validate_sql_safety_multiple_statements() {
        // Multiple statements should be blocked
        assert!(validate_sql_safety("SELECT * FROM users; DROP TABLE users").is_err());
        assert!(validate_sql_safety("SELECT 1; SELECT 2").is_err());
        assert!(validate_sql_safety("INSERT INTO t VALUES (1); DELETE FROM t").is_err());
    }

    #[test]
    fn test_validate_sql_safety_dangerous_ddl() {
        // Dangerous DDL should be blocked
        assert!(validate_sql_safety("DROP TABLE users").is_err());
        assert!(validate_sql_safety("CREATE EXTENSION httpfs").is_err());
        assert!(validate_sql_safety("INSTALL httpfs").is_err());
        assert!(validate_sql_safety("LOAD 'extension.so'").is_err());
        assert!(validate_sql_safety("ATTACH DATABASE 'other.db'").is_err());
        assert!(validate_sql_safety("DETACH db").is_err());

        // But safe DDL should be allowed
        assert!(validate_sql_safety("CREATE TABLE test (id INT)").is_ok());
        assert!(validate_sql_safety("CREATE VIEW v AS SELECT 1").is_ok());
        assert!(validate_sql_safety("ALTER TABLE test ADD COLUMN name TEXT").is_ok());
    }

    #[test]
    fn test_validate_sql_safety_filesystem_ops() {
        // File system operations should be blocked
        assert!(validate_sql_safety("COPY users TO 'output.csv'").is_err());
        assert!(validate_sql_safety("EXPORT DATABASE 'export_dir'").is_err());
    }

    #[test]
    fn test_validate_sql_safety_dangerous_pragmas() {
        // Dangerous PRAGMAs should be blocked
        assert!(validate_sql_safety("PRAGMA enable_external_access = true").is_err());
        assert!(validate_sql_safety("PRAGMA memory_limit = '10GB'").is_err());
        assert!(validate_sql_safety("PRAGMA threads = 8").is_err());

        // But safe PRAGMAs should be allowed
        assert!(validate_sql_safety("PRAGMA table_info(users)").is_ok());
        assert!(validate_sql_safety("PRAGMA database_list").is_ok());
    }

    #[test]
    fn test_validate_sql_safety_dangerous_set() {
        // Dangerous SET commands should be blocked
        assert!(validate_sql_safety("SET enable_external_access = true").is_err());
        assert!(validate_sql_safety("SET enable_object_cache = true").is_err());

        // But safe SET commands should be allowed
        assert!(validate_sql_safety("SET search_path = 'public'").is_ok());
    }

    #[test]
    fn test_validate_sql_safety_case_insensitive() {
        // Should detect dangerous operations regardless of case
        assert!(validate_sql_safety("drop table users").is_err());
        assert!(validate_sql_safety("DrOp TaBlE users").is_err());
        assert!(validate_sql_safety("INSTALL httpfs").is_err());
        assert!(validate_sql_safety("install httpfs").is_err());
    }

    #[test]
    fn test_has_multiple_statements() {
        // Single statements
        assert!(!has_multiple_statements("SELECT * FROM users"));
        assert!(!has_multiple_statements("SELECT * FROM users;"));
        assert!(!has_multiple_statements("SELECT 'test; with semicolon'"));
        assert!(!has_multiple_statements("SELECT \"test; with semicolon\""));

        // Multiple statements
        assert!(has_multiple_statements("SELECT 1; SELECT 2"));
        assert!(has_multiple_statements(
            "SELECT * FROM users; DROP TABLE users"
        ));
        assert!(has_multiple_statements(
            "INSERT INTO t VALUES (1); DELETE FROM t"
        ));

        // Edge cases
        assert!(!has_multiple_statements("SELECT ';' as semicolon"));
        assert!(!has_multiple_statements(
            "SELECT * FROM users WHERE name = 'a;b'"
        ));
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
