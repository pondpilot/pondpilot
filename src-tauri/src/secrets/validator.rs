use super::errors::SecretError;
use super::models::{SecretCredentials, SecretFields, SecretType};

pub struct SecretValidator;

impl SecretValidator {
    pub fn new() -> Self {
        Self
    }

    pub fn validate_fields(
        &self,
        secret_type: &SecretType,
        fields: &SecretFields,
    ) -> Result<(), SecretError> {
        match secret_type {
            SecretType::MotherDuck => {
                if fields.token.is_none() {
                    return Err(SecretError::MissingCredential("token".to_string()));
                }
            }

            SecretType::S3 => {
                if fields.key_id.is_none() {
                    return Err(SecretError::MissingCredential("key_id".to_string()));
                }
                if fields.secret.is_none() {
                    return Err(SecretError::MissingCredential("secret".to_string()));
                }
            }

            SecretType::R2 => {
                if fields.account_id.is_none() {
                    return Err(SecretError::MissingCredential("account_id".to_string()));
                }
                if fields.key_id.is_none() {
                    return Err(SecretError::MissingCredential("key_id".to_string()));
                }
                if fields.secret.is_none() {
                    return Err(SecretError::MissingCredential("secret".to_string()));
                }
            }

            SecretType::GCS => {
                if fields.key_id.is_none() {
                    return Err(SecretError::MissingCredential("key_id".to_string()));
                }
                if fields.secret.is_none() {
                    return Err(SecretError::MissingCredential("secret".to_string()));
                }
            }

            SecretType::Azure => {
                if fields.account_name.is_none() {
                    return Err(SecretError::MissingCredential("account_name".to_string()));
                }
                if fields.secret.is_none() {
                    return Err(SecretError::MissingCredential("access_key".to_string()));
                }
            }

            SecretType::Postgres | SecretType::MySQL => {
                // Simplified validation: only require username and password
                // Connection details (host, port, database) are provided at connection time
                if fields.username.is_none() {
                    return Err(SecretError::MissingCredential("username".to_string()));
                }
                if fields.password.is_none() {
                    return Err(SecretError::MissingCredential("password".to_string()));
                }
            }

            SecretType::HuggingFace | SecretType::DuckLake => {
                if fields.token.is_none() {
                    return Err(SecretError::MissingCredential("token".to_string()));
                }
            }

            SecretType::HTTP => {
                // HTTP can use either bearer token or basic auth
                if fields.bearer_token.is_none()
                    && (fields.basic_username.is_none() || fields.basic_password.is_none())
                {
                    return Err(SecretError::MissingCredential(
                        "bearer_token or basic auth credentials".to_string(),
                    ));
                }
            }
        }

        Ok(())
    }

    pub async fn test_connection(&self, _secret: &SecretCredentials) -> Result<bool, SecretError> {
        Ok(true)
    }
}
