use async_trait::async_trait;
use keyring::Entry;
use uuid::Uuid;
use std::sync::Arc;
use std::collections::HashMap;

use super::models::{SecretMetadata, SecretCredentials, SecretType, SecretFields, SecureString};
use super::errors::SecretError;
use super::metadata_store::MetadataStore;

#[async_trait]
pub trait KeychainProvider: Send + Sync {
    async fn store_secret(
        &self,
        metadata: &SecretMetadata,
        fields: SecretFields,
    ) -> Result<(), SecretError>;
    
    async fn get_secret(
        &self,
        secret_id: &Uuid,
    ) -> Result<SecretCredentials, SecretError>;
    
    async fn list_secrets(
        &self,
        secret_type: Option<SecretType>,
    ) -> Result<Vec<SecretMetadata>, SecretError>;
    
    async fn delete_secret(
        &self,
        secret_id: &Uuid,
    ) -> Result<(), SecretError>;
    
    async fn update_last_used(
        &self,
        secret_id: &Uuid,
    ) -> Result<(), SecretError>;
    
    async fn update_secret(
        &self,
        secret_id: Uuid,
        name: Option<String>,
        fields: Option<SecretFields>,
        tags: Option<Vec<String>>,
        scope: Option<String>,
    ) -> Result<SecretMetadata, SecretError>;
}

pub struct NativeKeychainProvider {
    service_name: String,
    metadata_store: Arc<MetadataStore>,
}

impl NativeKeychainProvider {
    pub fn new() -> Result<Self, SecretError> {
        // Use the app's bundle identifier as the service name
        let service_name = "io.pondpilot.desktop".to_string();
        let metadata_store = Arc::new(MetadataStore::new()?);
        
        tracing::debug!("[Keychain] Initializing NativeKeychainProvider");
        
        Ok(Self {
            service_name,
            metadata_store,
        })
    }
    
    fn build_account_name(&self, _secret_type: &SecretType, secret_id: &Uuid) -> String {
        // Use just the UUID to avoid any special character issues
        format!("{}", secret_id)
    }
}

#[async_trait]
impl KeychainProvider for NativeKeychainProvider {
    async fn store_secret(
        &self,
        metadata: &SecretMetadata,
        fields: SecretFields,
    ) -> Result<(), SecretError> {
        tracing::debug!("[Keychain] Storing secret: Name={}, Type={:?}", 
                metadata.name, metadata.secret_type);
        
        let account = self.build_account_name(&metadata.secret_type, &metadata.id);
        
        let mut credentials = HashMap::new();
        
        if let Some(ref v) = fields.key_id { 
            credentials.insert("key_id".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.secret { 
            credentials.insert("secret".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.host { 
            credentials.insert("host".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(v) = fields.port { 
            credentials.insert("port".to_string(), SecureString::new(v.to_string())); 
        }
        if let Some(ref v) = fields.database { 
            credentials.insert("database".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.user { 
            credentials.insert("user".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.username { 
            credentials.insert("username".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.password { 
            credentials.insert("password".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.region { 
            credentials.insert("region".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.account_id { 
            credentials.insert("account_id".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.account_name { 
            credentials.insert("account_name".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.tenant_id { 
            credentials.insert("tenant_id".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.client_id { 
            credentials.insert("client_id".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.client_secret { 
            credentials.insert("client_secret".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.endpoint { 
            credentials.insert("endpoint".to_string(), SecureString::new(v.clone())); 
        }
        if let Some(ref v) = fields.session_token { 
            credentials.insert("session_token".to_string(), SecureString::new(v.clone())); 
        }
        
        // Handle token field for services that use tokens
        if let Some(ref v) = fields.token {
            credentials.insert("token".to_string(), SecureString::new(v.clone()));
        }
        
        // Handle bearer_token field for HTTP auth
        if let Some(ref v) = fields.bearer_token {
            credentials.insert("bearer_token".to_string(), SecureString::new(v.clone()));
        }
        
        // Handle basic auth fields
        if let Some(ref v) = fields.basic_username {
            credentials.insert("basic_username".to_string(), SecureString::new(v.clone()));
        }
        if let Some(ref v) = fields.basic_password {
            credentials.insert("basic_password".to_string(), SecureString::new(v.clone()));
        }
        
        tracing::debug!("[Keychain] Prepared {} credential fields", credentials.len());
        for (key, _) in credentials.iter() {
            tracing::debug!("[Keychain]   - Field: {}", key);
        }
        
        let payload = serde_json::to_string(&credentials)?;
        tracing::debug!("[Keychain] Serialized payload length: {} bytes", payload.len());
        
        let _entry = Entry::new(&self.service_name, &account)
            .map_err(|e| {
                eprintln!("[Keychain] Failed to create Entry object: {}", e);
                SecretError::KeychainError(e.to_string())
            })?;
        
        // Store in keychain - the keyring crate needs synchronous execution
        let service = self.service_name.clone();
        let acc = account.clone();
        let pwd = payload.clone();
        
        // Run the keychain operation in a blocking context
        let result = tokio::task::spawn_blocking(move || {
            let entry = Entry::new(&service, &acc)?;
            entry.set_password(&pwd)
        }).await
        .map_err(|e| SecretError::KeychainError(format!("Task join error: {}", e)))?;
        
        result.map_err(|e| {
            eprintln!("[Keychain] Failed to store password in keychain: {}", e);
            SecretError::KeychainError(format!("Failed to store in keychain: {}", e))
        })?;
        
        tracing::debug!("[Keychain] Password stored successfully");
        
        tracing::debug!("[Keychain] Storing metadata in database...");
        self.metadata_store.store_metadata(metadata).await?;
        tracing::debug!("[Keychain] Successfully stored metadata in database");
        
        // Verify the secret was stored correctly - also needs blocking context
        let service = self.service_name.clone();
        let acc = account.clone();
        
        let verify_result = tokio::task::spawn_blocking(move || {
            let entry = Entry::new(&service, &acc)?;
            entry.get_password()
        }).await
        .map_err(|e| SecretError::KeychainError(format!("Verification task error: {}", e)))?;
        
        match verify_result {
            Ok(retrieved) => {
                tracing::debug!("[Keychain] ✓ Verification successful - secret can be retrieved");
                if retrieved != payload {
                    eprintln!("[Keychain] WARNING: Retrieved payload differs from original!");
                }
            },
            Err(e) => {
                eprintln!("[Keychain] ✗ Verification failed: {}", e);
                eprintln!("[Keychain] Secret may still be accessible later");
            }
        }
        
        Ok(())
    }
    
    async fn get_secret(&self, secret_id: &Uuid) -> Result<SecretCredentials, SecretError> {
        tracing::debug!("[Keychain] Getting secret with ID: {}", secret_id);
        
        let metadata = self.metadata_store.get_metadata(secret_id).await?;
        tracing::debug!("[Keychain] Retrieved metadata for secret: {} (type: {:?})", metadata.name, metadata.secret_type);
        
        let account = self.build_account_name(&metadata.secret_type, secret_id);
        
        // Run keychain operation in blocking context
        let service = self.service_name.clone();
        let acc = account.clone();
        
        let password = tokio::task::spawn_blocking(move || {
            let entry = Entry::new(&service, &acc)?;
            entry.get_password()
        }).await
        .map_err(|e| SecretError::KeychainError(format!("Task join error: {}", e)))?
        .map_err(|e| {
            eprintln!("[Keychain] Failed to get password from keychain: {}", e);
            SecretError::KeychainError(format!("Failed to retrieve secret from keychain: {}", e))
        })?;
        
        let credentials: HashMap<String, SecureString> = serde_json::from_str(&password)?;
        tracing::debug!("[Keychain] Successfully retrieved {} credential fields", credentials.len());
        
        Ok(SecretCredentials {
            metadata,
            credentials,
        })
    }
    
    async fn list_secrets(
        &self,
        secret_type: Option<SecretType>,
    ) -> Result<Vec<SecretMetadata>, SecretError> {
        self.metadata_store.list_metadata(secret_type).await
    }
    
    async fn delete_secret(&self, secret_id: &Uuid) -> Result<(), SecretError> {
        tracing::debug!("[Keychain] Deleting secret: {}", secret_id);
        
        // Try to get metadata first
        let metadata_result = self.metadata_store.get_metadata(secret_id).await;
        
        // If metadata exists, try to delete keychain entry
        if let Ok(metadata) = metadata_result {
            let account = self.build_account_name(&metadata.secret_type, secret_id);
            tracing::debug!("[Keychain] Attempting to delete keychain entry: {}", account);
            
            // Delete keychain entry in blocking context
            let service = self.service_name.clone();
            let acc = account.clone();
            
            let delete_result = tokio::task::spawn_blocking(move || {
                let entry = Entry::new(&service, &acc)?;
                entry.delete_credential()
            }).await;
            
            match delete_result {
                Ok(Ok(_)) => println!("[Keychain] Keychain entry deleted successfully"),
                Ok(Err(keyring::Error::NoEntry)) => {
                    tracing::debug!("[Keychain] Keychain entry not found (already deleted or never created)");
                },
                Ok(Err(e)) => {
                    eprintln!("[Keychain] Error deleting keychain entry: {}", e);
                },
                Err(e) => {
                    eprintln!("[Keychain] Task error deleting keychain entry: {}", e);
                }
            }
        } else {
            tracing::debug!("[Keychain] No metadata found for secret");
        }
        
        // Always try to delete metadata, even if keychain deletion failed
        match self.metadata_store.delete_metadata(secret_id).await {
            Ok(_) => println!("[Keychain] Metadata deleted successfully"),
            Err(e) => {
                eprintln!("[Keychain] Failed to delete metadata: {:?}", e);
                return Err(e);
            }
        }
        
        Ok(())
    }
    
    async fn update_last_used(&self, secret_id: &Uuid) -> Result<(), SecretError> {
        self.metadata_store.update_last_used(secret_id).await
    }
    
    async fn update_secret(
        &self,
        secret_id: Uuid,
        name: Option<String>,
        fields: Option<SecretFields>,
        tags: Option<Vec<String>>,
        scope: Option<String>,
    ) -> Result<SecretMetadata, SecretError> {
        let mut metadata = self.metadata_store.get_metadata(&secret_id).await?;
        
        if let Some(name) = name {
            metadata.name = name;
        }
        if let Some(tags) = tags {
            metadata.tags = tags;
        }
        if scope.is_some() {
            metadata.scope = scope;
        }
        
        metadata.updated_at = chrono::Utc::now();
        
        if let Some(fields) = fields {
            let account = self.build_account_name(&metadata.secret_type, &secret_id);
            
            let mut credentials = HashMap::new();
            
            if let Some(ref v) = fields.key_id { 
                credentials.insert("key_id".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.secret { 
                credentials.insert("secret".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.host { 
                credentials.insert("host".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(v) = fields.port { 
                credentials.insert("port".to_string(), SecureString::new(v.to_string())); 
            }
            if let Some(ref v) = fields.database { 
                credentials.insert("database".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.user { 
                credentials.insert("user".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.region { 
                credentials.insert("region".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.account_id { 
                credentials.insert("account_id".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.tenant_id { 
                credentials.insert("tenant_id".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.client_id { 
                credentials.insert("client_id".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.client_secret { 
                credentials.insert("client_secret".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.endpoint { 
                credentials.insert("endpoint".to_string(), SecureString::new(v.clone())); 
            }
            if let Some(ref v) = fields.session_token { 
                credentials.insert("session_token".to_string(), SecureString::new(v.clone())); 
            }
            
            let payload = serde_json::to_string(&credentials)?;
            
            let entry = Entry::new(&self.service_name, &account)
                .map_err(|e| SecretError::KeychainError(e.to_string()))?;
            entry.set_password(&payload)?;
        }
        
        self.metadata_store.update_metadata(&metadata).await?;
        
        Ok(metadata)
    }
}

/// A disabled keychain provider that returns errors for all operations
/// Used when the keychain is unavailable but we want the app to continue
pub struct DisabledKeychainProvider;

#[async_trait]
impl KeychainProvider for DisabledKeychainProvider {
    async fn store_secret(
        &self,
        _metadata: &SecretMetadata,
        _fields: SecretFields,
    ) -> Result<(), SecretError> {
        Err(SecretError::KeychainError("Secrets manager is disabled - keychain unavailable".to_string()))
    }
    
    async fn get_secret(
        &self,
        _secret_id: &Uuid,
    ) -> Result<SecretCredentials, SecretError> {
        Err(SecretError::KeychainError("Secrets manager is disabled - keychain unavailable".to_string()))
    }
    
    async fn list_secrets(
        &self,
        _secret_type: Option<SecretType>,
    ) -> Result<Vec<SecretMetadata>, SecretError> {
        // Return empty list instead of error for listing
        Ok(Vec::new())
    }
    
    async fn delete_secret(
        &self,
        _secret_id: &Uuid,
    ) -> Result<(), SecretError> {
        Err(SecretError::KeychainError("Secrets manager is disabled - keychain unavailable".to_string()))
    }
    
    async fn update_last_used(
        &self,
        _secret_id: &Uuid,
    ) -> Result<(), SecretError> {
        Err(SecretError::KeychainError("Secrets manager is disabled - keychain unavailable".to_string()))
    }
    
    async fn update_secret(
        &self,
        _secret_id: Uuid,
        _name: Option<String>,
        _fields: Option<SecretFields>,
        _tags: Option<Vec<String>>,
        _scope: Option<String>,
    ) -> Result<SecretMetadata, SecretError> {
        Err(SecretError::KeychainError("Secrets manager is disabled - keychain unavailable".to_string()))
    }
}