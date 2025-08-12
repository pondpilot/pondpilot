use std::sync::Arc;
use uuid::Uuid;
use chrono::Utc;

use super::keychain::{KeychainProvider, NativeKeychainProvider, DisabledKeychainProvider};
use super::validator::SecretValidator;
use super::injector::DuckDBSecretInjector;
use super::models::{SecretMetadata, SecretType, SecretFields, SecretCredentials};
use super::errors::SecretError;

pub struct SecretsManager {
    keychain: Arc<dyn KeychainProvider>,
    validator: Arc<SecretValidator>,
    injector: Arc<DuckDBSecretInjector>,
}

impl SecretsManager {
    pub fn new() -> Result<Self, SecretError> {
        let keychain = Arc::new(NativeKeychainProvider::new()?);
        let validator = Arc::new(SecretValidator::new());
        let injector = Arc::new(DuckDBSecretInjector::new());
        
        Ok(Self {
            keychain,
            validator,
            injector,
        })
    }
    
    /// Creates a disabled SecretsManager that returns errors for all operations
    /// Used when the keychain is unavailable but we want the app to continue
    pub fn new_disabled() -> Self {
        let keychain = Arc::new(DisabledKeychainProvider);
        let validator = Arc::new(SecretValidator::new());
        let injector = Arc::new(DuckDBSecretInjector::new());
        
        Self {
            keychain,
            validator,
            injector,
        }
    }
    
    pub async fn save_secret(
        &self,
        secret_type: SecretType,
        name: String,
        fields: SecretFields,
        tags: Vec<String>,
        scope: Option<String>,
        description: Option<String>,
    ) -> Result<SecretMetadata, SecretError> {
        self.validator.validate_fields(&secret_type, &fields)?;
        
        let metadata = SecretMetadata {
            id: Uuid::new_v4(),
            name,
            secret_type,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_used: None,
            tags,
            description,
            scope,
        };
        
        self.keychain.store_secret(&metadata, fields).await?;
        
        Ok(metadata)
    }
    
    pub async fn list_secrets(
        &self,
        secret_type: Option<SecretType>,
    ) -> Result<Vec<SecretMetadata>, SecretError> {
        self.keychain.list_secrets(secret_type).await
    }
    
    pub async fn get_secret(
        &self,
        secret_id: Uuid,
    ) -> Result<SecretCredentials, SecretError> {
        let secret = self.keychain.get_secret(&secret_id).await?;
        
        self.keychain.update_last_used(&secret_id).await?;
        
        Ok(secret)
    }
    
    pub async fn delete_secret(
        &self,
        secret_id: Uuid,
    ) -> Result<(), SecretError> {
        self.keychain.delete_secret(&secret_id).await
    }
    
    pub async fn update_secret(
        &self,
        secret_id: Uuid,
        name: Option<String>,
        fields: Option<SecretFields>,
        tags: Option<Vec<String>>,
        scope: Option<String>,
    ) -> Result<SecretMetadata, SecretError> {
        if let Some(ref fields) = fields {
            let secret = self.keychain.get_secret(&secret_id).await?;
            let metadata = secret.metadata.clone();
            self.validator.validate_fields(&metadata.secret_type, fields)?;
        }
        
        self.keychain.update_secret(secret_id, name, fields, tags, scope).await
    }
    
    pub async fn test_secret(
        &self,
        secret_id: Uuid,
    ) -> Result<bool, SecretError> {
        let secret = self.keychain.get_secret(&secret_id).await?;
        self.validator.test_connection(&secret).await
    }
    
    pub async fn apply_secret_to_connection(
        &self,
        connection: &duckdb::Connection,
        secret_id: Uuid,
    ) -> Result<(), SecretError> {
        let secret = self.keychain.get_secret(&secret_id).await?;
        
        self.injector.inject_secret(connection, &secret).await?;
        
        Ok(())
    }
    
    pub fn get_injector(&self) -> Arc<DuckDBSecretInjector> {
        self.injector.clone()
    }
}