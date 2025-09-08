# Comprehensive Secrets Management System Design for PondPilot

## Executive Summary

This document presents a comprehensive design for managing secrets in PondPilot's Tauri application, supporting multiple remote database types (MotherDuck, S3, PostgreSQL, MySQL, etc.) with secure storage using system keychains and integration with DuckDB's secrets management capabilities.

## Core Requirements

1. **Multi-type Support**: Support for various secret types (MotherDuck tokens, S3 credentials, PostgreSQL/MySQL passwords, OAuth tokens)
2. **Multiple Secrets per Type**: Allow multiple saved credentials for the same service type
3. **System Keychain Integration**: Leverage platform-native secure storage (macOS Keychain, Windows Credential Store, Linux Secret Service)
4. **DuckDB Integration**: Seamless integration with DuckDB's CREATE SECRET functionality
5. **Security**: Encrypted storage at rest, secure memory handling, minimal exposure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (TypeScript)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Secret UI   │  │ Connection   │  │ Secret Selection │  │
│  │ Management  │  │ Dialog       │  │ Component        │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    Tauri IPC Commands
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Backend (Rust)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Secrets Manager Service                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │   │
│  │  │ Secret Store │  │ Encryption   │  │ Validator│  │   │
│  │  │ (keyring-rs) │  │ Layer        │  │          │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            DuckDB Integration Layer                  │   │
│  │  ┌──────────────┐  ┌──────────────────────────────┐│   │
│  │  │ Secret       │  │ Temporary Secret Manager    ││   │
│  │  │ Injector     │  │ (in-memory only)           ││   │
│  │  └──────────────┘  └──────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  System Keychain Services                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │macOS Keychain│  │Windows Cred  │  │Linux Secret    │   │
│  │              │  │Store         │  │Service (DBus)  │   │
│  └──────────────┘  └──────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Design Approach: Full System Keychain Integration

### Core Implementation Strategy

We will implement a comprehensive secrets management system using native system keychains for maximum security and user experience. This approach ensures that sensitive credentials never touch disk in unencrypted form and leverages platform-specific security features.

**Key Implementation Decisions:**
- Use `keyring-rs` crate for cross-platform keychain access
- Store all secrets in system keychain with structured metadata
- Create temporary DuckDB secrets at runtime (in-memory only)
- Never persist secrets to disk in DuckDB format
- Implement secure memory handling with automatic zeroing
- Support for biometric authentication where available

### Platform-Specific Implementations

#### macOS
- **Storage**: macOS Keychain Services
- **Authentication**: TouchID, password, or Apple Watch
- **Sync**: Optional iCloud Keychain sync
- **Access Control**: Per-app access with user consent
- **Implementation**: Uses Security Framework via `keyring-rs`

#### Windows
- **Storage**: Windows Credential Manager
- **Authentication**: Windows Hello (face/fingerprint), PIN, or password
- **Sync**: Microsoft account credential sync
- **Access Control**: Per-user isolation
- **Implementation**: Uses Windows Credential API

#### Linux
- **Storage**: Secret Service (GNOME Keyring/KWallet)
- **Authentication**: System password or keyring password
- **Sync**: No built-in sync (user can configure)
- **Access Control**: DBus-based with PolicyKit
- **Implementation**: DBus Secret Service API

### Performance Considerations

Keychain access is fast enough (10-100ms) for our use case:

1. **Direct Access**: No caching needed - keychains are optimized for quick access
2. **Lazy Loading**: Only fetch secrets when needed for connections
3. **Connection Pooling**: Reuse DuckDB connections with injected secrets
4. **SQLite Metadata**: Fast metadata queries without keychain access

## Implementation Details

### Data Models

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use zeroize::{Zeroize, ZeroizeOnDrop};

// DuckDB-supported secret types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum SecretType {
    // OAuth-based (will be implemented with OAuth flow)
    MotherDuck,
    
    // DuckDB native secrets
    S3,          // AWS S3 and compatible
    R2,          // Cloudflare R2
    GCS,         // Google Cloud Storage
    Azure,       // Azure Blob Storage
    Postgres,    // PostgreSQL
    MySQL,       // MySQL
    HTTP,        // HTTP/HTTPS endpoints
    HuggingFace, // Hugging Face
    DuckLake,    // DuckLake
}

// Secret metadata (simplified without environment)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretMetadata {
    pub id: Uuid,
    pub name: String, // User can name it "prod_s3", "dev_postgres", etc.
    pub secret_type: SecretType,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub scope: Option<String>, // DuckDB scope (path prefix)
}

// Secure credentials container
#[derive(Debug, Zeroize, ZeroizeOnDrop)]
pub struct SecretCredentials {
    #[zeroize(skip)] // Metadata doesn't need zeroing
    pub metadata: SecretMetadata,
    pub credentials: HashMap<String, SecureString>,
}

// Secure string with automatic memory zeroing
#[derive(Debug, Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecureString {
    data: Vec<u8>,
}

impl SecureString {
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            data: value.into().into_bytes(),
        }
    }
    
    pub fn expose(&self) -> &str {
        std::str::from_utf8(&self.data).unwrap_or_default()
    }
}

// Standard fields for DuckDB secrets
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretFields {
    // Common fields
    pub key_id: Option<String>,     // ACCESS_KEY_ID, CLIENT_EMAIL, etc.
    pub secret: Option<String>,      // SECRET_ACCESS_KEY, PRIVATE_KEY, PASSWORD, TOKEN
    
    // Connection fields
    pub host: Option<String>,        // For Postgres, MySQL
    pub port: Option<u16>,           // For Postgres, MySQL
    pub database: Option<String>,    // For Postgres, MySQL
    pub user: Option<String>,        // For Postgres, MySQL
    
    // Cloud-specific
    pub region: Option<String>,      // For S3, R2
    pub account_id: Option<String>,  // For R2, Azure
    pub tenant_id: Option<String>,   // For Azure
    pub client_id: Option<String>,   // For Azure
    pub client_secret: Option<String>, // For Azure
    
    // Optional fields
    pub endpoint: Option<String>,    // Custom endpoints
    pub session_token: Option<String>, // Temporary AWS credentials
    pub scope: Option<String>,        // Path-based scoping
}
```

### Keychain Storage Architecture

```
Service: "io.pondpilot.secrets.v1"
Account: "{secret_type}:{secret_id}"
Password: JSON-encoded credentials

Example:
Service: "io.pondpilot.secrets.v1"
Account: "s3:550e8400-e29b-41d4-a716-446655440000"
Password: {
    "key_id": "AKIA...",
    "secret": "...",
    "region": "us-east-1"
}
```

### API Design

```rust
use tauri::State;
use std::sync::Arc;

// Simplified secrets manager
pub struct SecretsManager {
    keychain: Arc<dyn KeychainProvider>,
    validator: Arc<SecretValidator>,
}

// Tauri Commands
#[tauri::command]
async fn save_secret(
    state: State<'_, SecretsManager>,
    secret_type: SecretType,
    name: String,
    fields: SecretFields,
    tags: Vec<String>,
    scope: Option<String>,
) -> Result<SecretMetadata, SecretError> {
    // Validate credentials format based on secret type
    state.validator.validate_fields(&secret_type, &fields)?;
    
    // Create metadata
    let metadata = SecretMetadata {
        id: Uuid::new_v4(),
        name,
        secret_type,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_used: None,
        tags,
        description: None,
        scope,
    };
    
    // Store in keychain
    state.keychain.store_secret(&metadata, fields).await?;
    
    Ok(metadata)
}

#[tauri::command]
async fn list_secrets(
    state: State<'_, SecretsManager>,
    secret_type: Option<SecretType>,
) -> Result<Vec<SecretMetadata>, SecretError> {
    state.keychain.list_secrets(secret_type).await
}

#[tauri::command]
async fn get_secret(
    state: State<'_, SecretsManager>,
    secret_id: Uuid,
) -> Result<SecretCredentials, SecretError> {
    // Load from keychain
    let secret = state.keychain.get_secret(&secret_id).await?;
    
    // Update usage stats
    state.keychain.update_last_used(&secret_id).await?;
    
    Ok(secret)
}

#[tauri::command]
async fn delete_secret(
    state: State<'_, SecretsManager>,
    secret_id: Uuid,
) -> Result<(), SecretError> {
    state.keychain.delete_secret(&secret_id).await
}

#[tauri::command]
async fn update_secret(
    state: State<'_, SecretsManager>,
    secret_id: Uuid,
    name: Option<String>,
    fields: Option<SecretFields>,
    tags: Option<Vec<String>>,
    scope: Option<String>,
) -> Result<SecretMetadata, SecretError> {
    state.keychain.update_secret(secret_id, name, fields, tags, scope).await
}

#[tauri::command]
async fn test_secret(
    state: State<'_, SecretsManager>,
    secret_id: Uuid,
) -> Result<bool, SecretError> {
    let secret = state.keychain.get_secret(&secret_id).await?;
    state.validator.test_connection(&secret).await
}

#[tauri::command]
async fn apply_secret_to_connection(
    state: State<'_, SecretsManager>,
    connection_id: String,
    secret_id: Uuid,
) -> Result<(), SecretError> {
    let secret = state.keychain.get_secret(&secret_id).await?;
    
    // Get connection from pool
    let conn_manager = state.get_connection_manager();
    let connection = conn_manager.get_connection(&connection_id).await?;
    
    // Inject secret into DuckDB as temporary secret
    let injector = DuckDBSecretInjector::new();
    injector.inject_secret(&connection, &secret).await?;
    
    Ok(())
}
```

### DuckDB Integration

```rust
use duckdb::Connection;

pub struct DuckDBSecretInjector;

impl DuckDBSecretInjector {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn inject_secret(
        &self,
        connection: &Connection,
        secret: &SecretCredentials,
    ) -> Result<()> {
        // Build SQL based on secret type
        let sql = self.build_create_secret(&secret)?;
        
        // Execute with proper error handling
        connection.execute(&sql, []).map_err(|e| {
            SecretError::DuckDBInjection {
                secret_type: format!("{:?}", secret.metadata.secret_type),
                error: e.to_string(),
            }
        })?;
        
        Ok(())
    }
    
    pub async fn clear_secrets(
        &self,
        connection: &Connection,
    ) -> Result<()> {
        // DuckDB doesn't have a "DROP ALL TEMPORARY SECRETS" command
        // Secrets are connection-scoped and cleared when connection closes
        Ok(())
    }

    fn build_create_secret(&self, secret: &SecretCredentials) -> Result<String> {
        let secret_name = format!("secret_{}", secret.metadata.id.to_string().replace("-", "_"));
        let creds = &secret.credentials;
        
        let sql = match secret.metadata.secret_type {
            SecretType::MotherDuck => {
                // MotherDuck will use OAuth flow, for now use token
                let token = creds.get("token")
                    .ok_or(SecretError::MissingCredential("token"))?;
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        TYPE MOTHERDUCK,
                        TOKEN '{}'
                    )",
                    secret_name,
                    escape_sql_string(token.expose())
                )
            },
            
            SecretType::S3 => {
                let mut params = vec![];
                
                // Required fields
                params.push(format!("TYPE S3"));
                
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                if let Some(region) = creds.get("region") {
                    params.push(format!("REGION '{}'", escape_sql_string(region.expose())));
                }
                if let Some(session_token) = creds.get("session_token") {
                    params.push(format!("SESSION_TOKEN '{}'", escape_sql_string(session_token.expose())));
                }
                if let Some(endpoint) = creds.get("endpoint") {
                    params.push(format!("ENDPOINT '{}'", escape_sql_string(endpoint.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::R2 => {
                // R2 is similar to S3 but requires ACCOUNT_ID
                let mut params = vec![format!("TYPE R2")];
                
                if let Some(account_id) = creds.get("account_id") {
                    params.push(format!("ACCOUNT_ID '{}'", escape_sql_string(account_id.expose())));
                }
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::GCS => {
                let mut params = vec![format!("TYPE GCS")];
                
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::Azure => {
                let mut params = vec![format!("TYPE AZURE")];
                
                if let Some(tenant_id) = creds.get("tenant_id") {
                    params.push(format!("TENANT_ID '{}'", escape_sql_string(tenant_id.expose())));
                }
                if let Some(client_id) = creds.get("client_id") {
                    params.push(format!("CLIENT_ID '{}'", escape_sql_string(client_id.expose())));
                }
                if let Some(client_secret) = creds.get("client_secret") {
                    params.push(format!("CLIENT_SECRET '{}'", escape_sql_string(client_secret.expose())));
                }
                if let Some(account_id) = creds.get("account_id") {
                    params.push(format!("ACCOUNT_ID '{}'", escape_sql_string(account_id.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::Postgres => {
                let mut params = vec![format!("TYPE POSTGRES")];
                
                if let Some(host) = creds.get("host") {
                    params.push(format!("HOST '{}'", escape_sql_string(host.expose())));
                }
                if let Some(port) = creds.get("port") {
                    params.push(format!("PORT {}", port.expose()));
                }
                if let Some(database) = creds.get("database") {
                    params.push(format!("DATABASE '{}'", escape_sql_string(database.expose())));
                }
                if let Some(user) = creds.get("user") {
                    params.push(format!("USER '{}'", escape_sql_string(user.expose())));
                }
                if let Some(password) = creds.get("secret") {
                    params.push(format!("PASSWORD '{}'", escape_sql_string(password.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::MySQL => {
                let mut params = vec![format!("TYPE MYSQL")];
                
                if let Some(host) = creds.get("host") {
                    params.push(format!("HOST '{}'", escape_sql_string(host.expose())));
                }
                if let Some(port) = creds.get("port") {
                    params.push(format!("PORT {}", port.expose()));
                }
                if let Some(database) = creds.get("database") {
                    params.push(format!("DATABASE '{}'", escape_sql_string(database.expose())));
                }
                if let Some(user) = creds.get("user") {
                    params.push(format!("USER '{}'", escape_sql_string(user.expose())));
                }
                if let Some(password) = creds.get("secret") {
                    params.push(format!("PASSWORD '{}'", escape_sql_string(password.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::HTTP => {
                let mut params = vec![format!("TYPE HTTP")];
                
                // HTTP secrets support bearer tokens or basic auth
                if let Some(token) = creds.get("token") {
                    params.push(format!("BEARER_TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::HuggingFace => {
                let mut params = vec![format!("TYPE HUGGINGFACE")];
                
                if let Some(token) = creds.get("token") {
                    params.push(format!("TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::DuckLake => {
                // DuckLake specific parameters
                let mut params = vec![format!("TYPE DUCKLAKE")];
                
                if let Some(token) = creds.get("token") {
                    params.push(format!("TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
        };
        
        // Add scope if provided
        if let Some(scope) = &secret.metadata.scope {
            Ok(format!("{}, SCOPE '{}')", 
                sql.trim_end_matches(')'),
                escape_sql_string(scope)
            ))
        } else {
            Ok(sql)
        }
    }
}

fn escape_sql_string(s: &str) -> String {
    s.replace('\'', "''")
        .replace('\\', "\\\\")
        .replace('\0', "")
}
```

## Security Considerations

### 1. Memory Security
- Use `SecureString` wrapper to zero memory on drop
- Avoid logging or serializing sensitive data
- Clear DuckDB temporary secrets on connection close

### 2. Access Control
- Implement rate limiting for secret access
- Audit log for secret usage
- Support for read-only vs read-write access

### 3. Platform-Specific Security

**macOS:**
- Request keychain access permission
- Handle TouchID authentication prompts
- Support for iCloud Keychain sync (optional)

**Windows:**
- Use Windows Credential Manager
- Support Windows Hello authentication
- Handle UAC prompts appropriately

**Linux:**
- Use Secret Service via DBus
- Handle keyring unlock prompts
- Support for GNOME Keyring and KWallet

### 4. Error Handling
- Never expose raw credentials in error messages
- Implement retry logic for transient keychain errors
- Graceful fallback for unsupported platforms

## Migration Path

### Phase 1: Core Infrastructure (Week 1-2)
1. Add `keyring-rs` dependency with platform features
2. Implement `SecretManager` service
3. Create basic CRUD operations
4. Add unit tests

### Phase 2: DuckDB Integration (Week 2-3)
1. Implement `DuckDBSecretInjector`
2. Modify connection handler to accept secrets
3. Add temporary secret lifecycle management
4. Integration tests

### Phase 3: UI Components (Week 3-4)
1. Create secret management UI
2. Add connection dialog with secret selection
3. Implement secret validation
4. End-to-end tests

### Phase 4: Advanced Features (Week 4-5)
1. Add OAuth flow support
2. Implement secret sharing/export
3. Add audit logging
4. Performance optimization

## Testing Strategy

### Unit Tests
- Test each secret type serialization/deserialization
- Verify secure memory clearing
- Test SQL injection prevention

### Integration Tests
- Test keychain operations on each platform
- Verify DuckDB secret injection
- Test connection with various secret types

### Security Tests
- Attempt SQL injection via credentials
- Verify memory is cleared after use
- Test access control and rate limiting

## Performance Considerations

### Caching Strategy
```rust
pub struct SecretCache {
    cache: Arc<RwLock<HashMap<Uuid, CachedSecret>>>,
    ttl: Duration,
}

struct CachedSecret {
    credentials: SecretCredentials,
    expires_at: Instant,
}
```

### Batch Operations
- Support bulk secret import/export
- Optimize keychain access patterns
- Implement connection pooling for secrets

## UI/UX Considerations

### Secret Management Screen
- List view with search and filtering
- Quick actions (copy, test connection, delete)
- Visual indicators for secret type
- Last used timestamp

### Connection Flow
1. User selects database type
2. Choose existing secret or create new
3. Test connection with selected secret
4. Save connection configuration

## Alternative Libraries Evaluation

### keyring-rs (Recommended)
- **Pros:** Mature, cross-platform, actively maintained
- **Cons:** Additional dependencies, platform quirks
- **License:** MIT/Apache-2.0

### tauri-plugin-keyring
- **Pros:** Tauri-specific integration
- **Cons:** Less mature, limited documentation
- **License:** MIT

### cryptex
- **Pros:** No external dependencies (except DBus)
- **Cons:** Less feature-rich, smaller community
- **License:** MIT

## Keychain Provider Implementation

```rust
use async_trait::async_trait;
use keyring::{Entry, Error as KeyringError};

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
    metadata_store: Arc<MetadataStore>, // SQLite for fast metadata queries
}

impl NativeKeychainProvider {
    pub fn new() -> Result<Self, SecretError> {
        let service_name = "io.pondpilot.secrets.v1".to_string();
        let metadata_store = Arc::new(MetadataStore::new()?);
        
        Ok(Self {
            service_name,
            metadata_store,
        })
    }
    
    fn build_account_name(&self, secret_type: &SecretType, secret_id: &Uuid) -> String {
        format!("{}:{}", 
            self.secret_type_to_string(secret_type),
            secret_id
        )
    }
    
    fn secret_type_to_string(&self, secret_type: &SecretType) -> String {
        match secret_type {
            SecretType::MotherDuck => "motherduck",
            SecretType::S3 => "s3",
            SecretType::R2 => "r2",
            SecretType::GCS => "gcs",
            SecretType::Azure => "azure",
            SecretType::Postgres => "postgres",
            SecretType::MySQL => "mysql",
            SecretType::HTTP => "http",
            SecretType::HuggingFace => "huggingface",
            SecretType::DuckLake => "ducklake",
        }.to_string()
    }
}

#[async_trait]
impl KeychainProvider for NativeKeychainProvider {
    async fn store_secret(
        &self,
        metadata: &SecretMetadata,
        fields: SecretFields,
    ) -> Result<(), SecretError> {
        let account = self.build_account_name(&metadata.secret_type, &metadata.id);
        
        // Convert fields to secure credentials
        let mut credentials = HashMap::new();
        
        // Map SecretFields to HashMap<String, SecureString>
        if let Some(v) = fields.key_id { credentials.insert("key_id".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.secret { credentials.insert("secret".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.host { credentials.insert("host".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.port { 
            credentials.insert("port".to_string(), SecureString::new(v.to_string())); 
        }
        if let Some(v) = fields.database { credentials.insert("database".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.user { credentials.insert("user".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.region { credentials.insert("region".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.account_id { credentials.insert("account_id".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.tenant_id { credentials.insert("tenant_id".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.client_id { credentials.insert("client_id".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.client_secret { credentials.insert("client_secret".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.endpoint { credentials.insert("endpoint".to_string(), SecureString::new(v)); }
        if let Some(v) = fields.session_token { credentials.insert("session_token".to_string(), SecureString::new(v)); }
        
        // For MotherDuck OAuth, we'll store the token
        if matches!(metadata.secret_type, SecretType::MotherDuck) {
            // Token will be obtained through OAuth flow
            if let Some(token) = fields.secret {
                credentials.insert("token".to_string(), SecureString::new(token));
            }
        }
        
        // For HTTP/HuggingFace/DuckLake that use tokens
        if matches!(metadata.secret_type, SecretType::HTTP | SecretType::HuggingFace | SecretType::DuckLake) {
            if let Some(token) = fields.secret {
                credentials.insert("token".to_string(), SecureString::new(token));
            }
        }
        
        // Serialize for storage
        let payload = serde_json::to_string(&credentials)?;
        
        // Store in keychain
        let entry = Entry::new(&self.service_name, &account)?;
        entry.set_password(&payload)?;
        
        // Store metadata in SQLite for fast queries
        self.metadata_store.store_metadata(metadata).await?;
        
        Ok(())
    }
    
    async fn get_secret(&self, secret_id: &Uuid) -> Result<SecretCredentials, SecretError> {
        // Get metadata from SQLite
        let metadata = self.metadata_store.get_metadata(secret_id).await?;
        
        // Build account name
        let account = self.build_account_name(&metadata.secret_type, secret_id);
        
        // Retrieve from keychain
        let entry = Entry::new(&self.service_name, &account)?;
        let password = entry.get_password()?;
        
        // Deserialize credentials
        let credentials: HashMap<String, SecureString> = serde_json::from_str(&password)?;
        
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
        // Get metadata to build account name
        let metadata = self.metadata_store.get_metadata(secret_id).await?;
        let account = self.build_account_name(&metadata.secret_type, secret_id);
        
        // Delete from keychain
        let entry = Entry::new(&self.service_name, &account)?;
        entry.delete_credential()?;
        
        // Delete metadata
        self.metadata_store.delete_metadata(secret_id).await?;
        
        Ok(())
    }
    
    async fn update_last_used(&self, secret_id: &Uuid) -> Result<(), SecretError> {
        self.metadata_store.update_last_used(secret_id).await
    }
    
    // ... other methods
}
```

## Conclusion

This simplified secrets management system provides:

### Security Benefits
- **Zero-knowledge architecture**: Secrets never stored unencrypted on disk
- **Platform-native security**: Leverages OS-level encryption and access controls
- **Memory protection**: Automatic zeroing of sensitive data with `zeroize` crate
- **Temporary DuckDB secrets**: Secrets injected at runtime, never persisted

### User Experience
- **Simple naming convention**: Users control environments via naming (e.g., "prod_s3", "dev_postgres")
- **System integration**: Works with native password managers
- **Biometric support**: TouchID, Windows Hello where available
- **Direct keychain access**: No caching complexity, fast enough for interactive use

### Developer Experience
- **DuckDB-native types**: Supports all DuckDB secret types (S3, R2, GCS, Azure, Postgres, MySQL, HTTP, HuggingFace, DuckLake)
- **MotherDuck OAuth**: Special handling for MotherDuck authentication
- **Type-safe API**: Strong typing with Rust
- **Clean architecture**: Simple design without over-engineering

The implementation uses `keyring-rs` for cross-platform keychain access, providing maximum security while keeping the design simple and maintainable.

## Appendix A: Secret Type Specifications

### MotherDuck
```json
{
  "token": "md_xxx",
  "endpoint": "https://app.motherduck.com" // optional
}
```

### S3
```json
{
  "access_key_id": "AKIA...",
  "secret_access_key": "xxx",
  "region": "us-east-1",
  "endpoint": "https://s3.amazonaws.com", // optional
  "session_token": "xxx" // optional for temporary credentials
}
```

### PostgreSQL
```json
{
  "host": "localhost",
  "port": "5432",
  "database": "mydb",
  "user": "username",
  "password": "xxx",
  "ssl_mode": "require" // optional
}
```

### MySQL
```json
{
  "host": "localhost",
  "port": "3306",
  "database": "mydb",
  "user": "username",
  "password": "xxx",
  "ssl_ca": "path/to/ca.pem" // optional
}
```

## Appendix B: Error Codes

```rust
pub enum SecretError {
    KeychainAccessDenied = 1001,
    SecretNotFound = 1002,
    InvalidCredentials = 1003,
    PlatformNotSupported = 1004,
    EncryptionFailed = 1005,
    DecryptionFailed = 1006,
    RateLimitExceeded = 1007,
    DuckDBIntegrationFailed = 1008,
}
```