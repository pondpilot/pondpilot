// SQL Sanitizer Module
//
// This module provides SQL parameter escaping functionality to prevent SQL injection attacks.
// Since DuckDB's Rust bindings currently don't support parameterized queries with Arrow,
// this provides a security layer for parameter handling.
//
// SECURITY: This is a defense-in-depth measure. Primary protection should still come from
// proper input validation and query construction practices.

use serde_json::Value;
use crate::errors::{Result, DuckDBError};

/// Escape a SQL value to prevent injection attacks
pub fn escape_sql_value(value: &Value) -> Result<String> {
    match value {
        Value::String(s) => {
            // Escape single quotes by doubling them (SQL standard)
            // Also check for null bytes and other dangerous characters
            if s.contains('\0') {
                return Err(DuckDBError::InvalidQuery {
                    message: "Null bytes not allowed in SQL parameters".to_string(),
                    sql: None,
                    position: None,
                });
            }
            
            // Additional validation for suspicious patterns
            if contains_sql_comment(s) || contains_multiple_statements(s) {
                return Err(DuckDBError::InvalidQuery {
                    message: "Suspicious SQL patterns detected in parameter".to_string(),
                    sql: None,
                    position: None,
                });
            }
            
            Ok(format!("'{}'", s.replace('\'', "''")))
        }
        Value::Number(n) => {
            // Numbers are safe to use directly, but validate they're finite
            if let Some(f) = n.as_f64() {
                if !f.is_finite() {
                    return Err(DuckDBError::InvalidQuery {
                        message: "Non-finite numbers not allowed in SQL parameters".to_string(),
                        sql: None,
                        position: None,
                    });
                }
            }
            Ok(n.to_string())
        }
        Value::Bool(b) => Ok(b.to_string()),
        Value::Null => Ok("NULL".to_string()),
        Value::Array(_) | Value::Object(_) => {
            // Complex types need special handling
            // For now, serialize to JSON string
            let json_str = serde_json::to_string(value)
                .map_err(|e| DuckDBError::InvalidQuery {
                    message: format!("Failed to serialize parameter: {}", e),
                    sql: None,
                    position: None,
                })?;
            // Recursively escape the JSON string
            escape_sql_value(&Value::String(json_str))
        }
    }
}

/// Check if a string contains SQL comment patterns
fn contains_sql_comment(s: &str) -> bool {
    s.contains("--") || s.contains("/*") || s.contains("*/")
}

/// Check if a string appears to contain multiple SQL statements
fn contains_multiple_statements(s: &str) -> bool {
    // Simple heuristic: check for semicolons that might indicate multiple statements
    // This is conservative and might flag legitimate data containing semicolons
    let normalized = s.to_lowercase();
    
    // Check for common SQL injection patterns
    if normalized.contains("; drop") || 
       normalized.contains("; delete") || 
       normalized.contains("; update") ||
       normalized.contains("; insert") ||
       normalized.contains("; create") ||
       normalized.contains("; alter") ||
       normalized.contains("; exec") ||
       normalized.contains("; execute") {
        return true;
    }
    
    false
}

/// Sanitize a SQL identifier (table name, column name, etc.)
/// This is more restrictive than value escaping as identifiers have specific rules
#[allow(dead_code)]
pub fn sanitize_identifier(identifier: &str) -> Result<String> {
    // Check for empty identifier
    if identifier.is_empty() {
        return Err(DuckDBError::InvalidQuery {
            message: "Empty identifier not allowed".to_string(),
            sql: None,
            position: None,
        });
    }
    
    // Check length limit (reasonable limit to prevent DoS)
    if identifier.len() > 128 {
        return Err(DuckDBError::InvalidQuery {
            message: "Identifier too long".to_string(),
            sql: None,
            position: None,
        });
    }
    
    // Validate identifier contains only safe characters
    // Allow alphanumeric, underscore, and dollar sign (common in many SQL dialects)
    if !identifier.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$') {
        // If it contains other characters, quote it
        // DuckDB uses double quotes for identifiers
        Ok(format!("\"{}\"", identifier.replace('"', "\"\"")))
    } else {
        Ok(identifier.to_string())
    }
}

/// Build a SQL query with escaped parameters
/// This replaces ? placeholders with properly escaped values
pub fn build_parameterized_query(sql: &str, params: &[Value]) -> Result<String> {
    let mut result = String::with_capacity(sql.len() + params.len() * 20);
    let mut param_index = 0;
    let mut chars = sql.chars().peekable();
    let mut in_string = false;
    let mut string_delimiter = ' ';
    
    while let Some(ch) = chars.next() {
        match ch {
            '\'' | '"' if !in_string => {
                in_string = true;
                string_delimiter = ch;
                result.push(ch);
            }
            '\'' | '"' if in_string && ch == string_delimiter => {
                // Check if it's an escaped quote
                if chars.peek() == Some(&ch) {
                    result.push(ch);
                    result.push(chars.next().unwrap());
                } else {
                    in_string = false;
                    result.push(ch);
                }
            }
            '?' if !in_string => {
                // Replace placeholder with escaped parameter
                if param_index >= params.len() {
                    return Err(DuckDBError::InvalidQuery {
                        message: format!("Not enough parameters: expected at least {}, got {}", 
                                       param_index + 1, params.len()),
                        sql: Some(sql.to_string()),
                        position: Some(ch as usize),
                    });
                }
                result.push_str(&escape_sql_value(&params[param_index])?);
                param_index += 1;
            }
            _ => result.push(ch),
        }
    }
    
    if param_index < params.len() {
        return Err(DuckDBError::InvalidQuery {
            message: format!("Too many parameters: expected {}, got {}", 
                           param_index, params.len()),
            sql: Some(sql.to_string()),
            position: None,
        });
    }
    
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_escape_string() {
        assert_eq!(
            escape_sql_value(&json!("hello")).unwrap(),
            "'hello'"
        );
        assert_eq!(
            escape_sql_value(&json!("it's")).unwrap(),
            "'it''s'"
        );
        assert_eq!(
            escape_sql_value(&json!("'; DROP TABLE users; --")).unwrap(),
            "'''; DROP TABLE users; --'"
        );
    }

    #[test]
    fn test_escape_numbers() {
        assert_eq!(escape_sql_value(&json!(42)).unwrap(), "42");
        assert_eq!(escape_sql_value(&json!(3.14)).unwrap(), "3.14");
        assert_eq!(escape_sql_value(&json!(-100)).unwrap(), "-100");
    }

    #[test]
    fn test_escape_special_values() {
        assert_eq!(escape_sql_value(&json!(true)).unwrap(), "true");
        assert_eq!(escape_sql_value(&json!(false)).unwrap(), "false");
        assert_eq!(escape_sql_value(&json!(null)).unwrap(), "NULL");
    }

    #[test]
    fn test_reject_dangerous_patterns() {
        assert!(escape_sql_value(&json!("test\0value")).is_err());
        assert!(escape_sql_value(&json!("test -- comment")).is_err());
        assert!(escape_sql_value(&json!("test /* comment */")).is_err());
        assert!(escape_sql_value(&json!("test; DROP TABLE users")).is_err());
    }

    #[test]
    fn test_sanitize_identifier() {
        assert_eq!(sanitize_identifier("users").unwrap(), "users");
        assert_eq!(sanitize_identifier("user_name").unwrap(), "user_name");
        assert_eq!(sanitize_identifier("table-name").unwrap(), "\"table-name\"");
        assert_eq!(sanitize_identifier("table\"name").unwrap(), "\"table\"\"name\"");
        assert!(sanitize_identifier("").is_err());
    }

    #[test]
    fn test_build_parameterized_query() {
        let sql = "SELECT * FROM users WHERE name = ? AND age > ?";
        let params = vec![json!("Alice"), json!(25)];
        let result = build_parameterized_query(sql, &params).unwrap();
        assert_eq!(result, "SELECT * FROM users WHERE name = 'Alice' AND age > 25");
        
        // Test with quotes in SQL
        let sql2 = "SELECT * FROM users WHERE status = '?' AND name = ?";
        let params2 = vec![json!("Bob")];
        let result2 = build_parameterized_query(sql2, &params2).unwrap();
        assert_eq!(result2, "SELECT * FROM users WHERE status = '?' AND name = 'Bob'");
    }

    #[test]
    fn test_parameter_count_validation() {
        let sql = "SELECT * FROM users WHERE name = ?";
        
        // Too few parameters
        assert!(build_parameterized_query(sql, &[]).is_err());
        
        // Too many parameters
        let params = vec![json!("Alice"), json!("Bob")];
        assert!(build_parameterized_query(sql, &params).is_err());
    }
}