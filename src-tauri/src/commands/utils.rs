//! Utilities for Tauri command parameter handling

/// Coalesce snake_case and camelCase optional parameters into a required value.
/// Returns a consistent error if both are missing.
pub fn coalesce_param_opt<T>(
    snake: Option<T>,
    camel: Option<T>,
    param_name: &str,
    operation: &str,
) -> crate::errors::Result<T> {
    snake
        .or(camel)
        .ok_or_else(|| crate::errors::DuckDBError::InvalidOperation {
            message: format!("Missing required parameter '{}'", param_name),
            operation: Some(operation.to_string()),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coalesce_prefers_snake_when_both_present() {
        let v = coalesce_param_opt(Some("snake"), Some("camel"), "id", "op").unwrap();
        assert_eq!(v, "snake");
    }

    #[test]
    fn coalesce_uses_camel_when_snake_missing() {
        let v: String =
            coalesce_param_opt::<String>(None, Some("camel".to_string()), "id", "op").unwrap();
        assert_eq!(v, "camel");
    }

    #[test]
    fn coalesce_errors_when_both_missing() {
        let err = coalesce_param_opt::<String>(None, None, "id", "op").unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("Missing required parameter 'id'"));
    }
}
