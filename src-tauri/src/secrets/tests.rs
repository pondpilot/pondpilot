#[cfg(test)]
mod tests {
    use super::super::*;
    use crate::secrets::models::{SecretFields, SecretMetadata, SecretType, SecureString};
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_secret_type_conversion() {
        assert_eq!(SecretType::S3.to_string(), "s3");
        assert_eq!(SecretType::MotherDuck.to_string(), "motherduck");
        assert_eq!(SecretType::Postgres.to_string(), "postgres");

        assert_eq!(SecretType::from_string("s3"), Some(SecretType::S3));
        assert_eq!(
            SecretType::from_string("motherduck"),
            Some(SecretType::MotherDuck)
        );
        assert_eq!(SecretType::from_string("invalid"), None);
    }

    #[test]
    fn test_secure_string() {
        let secret = SecureString::new("my_secret_password");
        assert_eq!(secret.expose(), "my_secret_password");

        let empty = SecureString::new("");
        assert_eq!(empty.expose(), "");
    }

    #[test]
    fn test_secret_metadata_creation() {
        let metadata = SecretMetadata {
            id: Uuid::new_v4(),
            name: "Test Secret".to_string(),
            secret_type: SecretType::S3,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_used: None,
            tags: vec!["test".to_string(), "dev".to_string()],
            description: Some("Test description".to_string()),
            scope: Some("s3://bucket/path".to_string()),
        };

        assert_eq!(metadata.name, "Test Secret");
        assert_eq!(metadata.secret_type, SecretType::S3);
        assert_eq!(metadata.tags.len(), 2);
        assert!(metadata.last_used.is_none());
    }

    #[test]
    fn test_secret_fields_default() {
        let fields = SecretFields::default();
        assert!(fields.key_id.is_none());
        assert!(fields.secret.is_none());
        assert!(fields.host.is_none());
        assert!(fields.port.is_none());
    }

    #[test]
    fn test_escape_sql_string() {
        use super::super::injector::escape_sql_string;

        assert_eq!(escape_sql_string("normal"), "normal");
        assert_eq!(escape_sql_string("it's"), "it''s");
        assert_eq!(escape_sql_string("back\\slash"), "back\\\\slash");
        assert_eq!(escape_sql_string("null\0char"), "nullchar");
    }

    #[test]
    fn test_validator_s3() {
        use super::super::validator::SecretValidator;

        let validator = SecretValidator::new();

        // Valid S3 credentials
        let mut fields = SecretFields::default();
        fields.key_id = Some("AKIAIOSFODNN7EXAMPLE".to_string());
        fields.secret = Some("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string());

        assert!(validator.validate_fields(&SecretType::S3, &fields).is_ok());

        // Missing key_id
        let mut fields = SecretFields::default();
        fields.secret = Some("secret".to_string());

        assert!(validator.validate_fields(&SecretType::S3, &fields).is_err());
    }

    #[test]
    fn test_validator_postgres() {
        use super::super::validator::SecretValidator;

        let validator = SecretValidator::new();

        // Valid Postgres credentials
        let mut fields = SecretFields::default();
        fields.host = Some("localhost".to_string());
        fields.username = Some("postgres".to_string());
        fields.password = Some("password".to_string());

        assert!(validator
            .validate_fields(&SecretType::Postgres, &fields)
            .is_ok());

        // Missing host
        let mut fields = SecretFields::default();
        fields.username = Some("postgres".to_string());
        fields.password = Some("password".to_string());

        assert!(validator
            .validate_fields(&SecretType::Postgres, &fields)
            .is_err());
    }
}
