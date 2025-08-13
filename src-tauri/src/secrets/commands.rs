use tauri::State;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

use super::manager::SecretsManager;
use super::models::{SecretMetadata, SecretType, SecretFields};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveSecretRequest {
    pub secret_type: SecretType,
    pub name: String,
    pub fields: SecretFields,
    pub tags: Vec<String>,
    pub scope: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSecretRequest {
    pub secret_id: String,
    pub name: Option<String>,
    pub fields: Option<SecretFields>,
    pub tags: Option<Vec<String>>,
    pub scope: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplySecretRequest {
    pub connection_id: String,
    pub secret_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecretResponse {
    pub metadata: SecretMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecretListResponse {
    pub secrets: Vec<SecretMetadata>,
}

#[tauri::command]
pub async fn save_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    request: SaveSecretRequest,
) -> Result<SecretResponse, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    println!("[Secrets] Save secret request received:");
    println!("[Secrets]   - Type: {:?}", request.secret_type);
    println!("[Secrets]   - Name: {}", request.name);
    println!("[Secrets]   - Tags: {:?}", request.tags);
    println!("[Secrets]   - Fields provided:");
    
    // Log which fields are provided (without values for security)
    if request.fields.token.is_some() { println!("[Secrets]     - token: [PROVIDED]"); }
    if request.fields.key_id.is_some() { println!("[Secrets]     - key_id: [PROVIDED]"); }
    if request.fields.secret.is_some() { println!("[Secrets]     - secret: [PROVIDED]"); }
    if request.fields.host.is_some() { println!("[Secrets]     - host: [PROVIDED]"); }
    if request.fields.password.is_some() { println!("[Secrets]     - password: [PROVIDED]"); }
    
    let metadata = state
        .save_secret(
            request.secret_type,
            request.name,
            request.fields,
            request.tags,
            request.scope,
            request.description,
        )
        .await
        .map_err(|e| {
            eprintln!("[Secrets] Failed to save secret: {}", e);
            e.to_string()
        })?;
    
    println!("[Secrets] Secret saved successfully with ID: {}", metadata.id);
    
    Ok(SecretResponse { metadata })
}

#[tauri::command]
pub async fn list_secrets(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    secret_type: Option<SecretType>,
) -> Result<SecretListResponse, String> {
    // List secrets metadata is allowed from main and secrets windows
    // We only return metadata (no actual secret values), so this is relatively safe
    if window.label() != "secrets" && window.label() != "main" {
        return Err("Unauthorized: list_secrets only available from main or secrets window".into());
    }
    println!("[Secrets] Listing secrets with type filter: {:?}", secret_type);
    
    let secrets = state
        .list_secrets(secret_type)
        .await
        .map_err(|e| {
            eprintln!("[Secrets] Failed to list secrets: {}", e);
            e.to_string()
        })?;
    
    println!("[Secrets] Found {} secrets", secrets.len());
    for secret in &secrets {
        println!("[Secrets]   - {} ({:?}): {}", secret.name, secret.secret_type, secret.id);
    }
    
    Ok(SecretListResponse { secrets })
}

#[tauri::command]
pub async fn get_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    secret_id: String,
) -> Result<SecretResponse, String> {
    // Get secret metadata is allowed from main and secrets windows
    // NOTE: This only returns metadata, NOT the actual secret values
    if window.label() != "secrets" && window.label() != "main" {
        return Err("Unauthorized: get_secret only available from main or secrets window".into());
    }
    
    let id = Uuid::parse_str(&secret_id)
        .map_err(|e| format!("Invalid secret ID: {}", e))?;
    
    let secret = state
        .get_secret(id)
        .await
        .map_err(|e| e.to_string())?;
    
    // IMPORTANT: Only return metadata, never expose actual credentials to frontend
    Ok(SecretResponse { 
        metadata: secret.metadata.clone() 
    })
}

#[tauri::command]
pub async fn delete_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    secret_id: String,
) -> Result<(), String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    println!("[Secrets] Delete request for secret: {}", secret_id);
    
    let id = Uuid::parse_str(&secret_id)
        .map_err(|e| {
            eprintln!("[Secrets] Invalid secret ID format: {}", e);
            format!("Invalid secret ID: {}", e)
        })?;
    
    state
        .delete_secret(id)
        .await
        .map_err(|e| {
            eprintln!("[Secrets] Failed to delete secret {}: {}", secret_id, e);
            e.to_string()
        })?;
    
    println!("[Secrets] Secret {} deleted successfully", secret_id);
    Ok(())
}

#[tauri::command]
pub async fn update_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    request: UpdateSecretRequest,
) -> Result<SecretResponse, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    let id = Uuid::parse_str(&request.secret_id)
        .map_err(|e| format!("Invalid secret ID: {}", e))?;
    
    let metadata = state
        .update_secret(
            id,
            request.name,
            request.fields,
            request.tags,
            request.scope,
        )
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(SecretResponse { metadata })
}

#[tauri::command]
pub async fn test_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    secret_id: String,
) -> Result<bool, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    let id = Uuid::parse_str(&secret_id)
        .map_err(|e| format!("Invalid secret ID: {}", e))?;
    
    state
        .test_secret(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_secret_to_connection(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    request: ApplySecretRequest,
) -> Result<(), String> {
    // SECURITY: Restrict this command to only the main window
    // This command can set environment variables with secret values,
    // so we need to be careful about who can call it
    if window.label() != "main" {
        return Err("Unauthorized: apply_secret_to_connection only available from main window".into());
    }
    
    // Additional validation: Check that the connection_id starts with known safe prefixes
    let allowed_prefixes = vec!["motherduck_list", "motherduck_attach", "motherduck_reconnect_"];
    let is_allowed = allowed_prefixes.iter().any(|prefix| request.connection_id.starts_with(prefix));
    if !is_allowed {
        eprintln!("[Secrets] Invalid connection_id: {}", request.connection_id);
        return Err("Invalid connection_id".into());
    }
    
    println!("[Secrets] Applying secret to connection: connection_id={}, secret_id={}", 
             request.connection_id, request.secret_id);
    
    let secret_id = Uuid::parse_str(&request.secret_id)
        .map_err(|e| format!("Invalid secret ID: {}", e))?;
    
    let secret = state
        .get_secret(secret_id)
        .await
        .map_err(|e| {
            eprintln!("[Secrets] Failed to get secret: {}", e);
            e.to_string()
        })?;
    
    println!("[Secrets] Retrieved secret type: {:?}", secret.metadata.secret_type);
    
    // For MotherDuck, we need to set the environment variable for now
    // since DuckDB's MotherDuck extension reads from environment
    match secret.metadata.secret_type {
        SecretType::MotherDuck => {
            if let Some(token) = secret.credentials.get("token") {
                // Clear any existing token first to ensure DuckDB picks up the new one
                println!("[Secrets] Clearing existing MOTHERDUCK_TOKEN environment variable");
                std::env::remove_var("MOTHERDUCK_TOKEN");
                
                println!("[Secrets] Setting new MOTHERDUCK_TOKEN environment variable");
                std::env::set_var("MOTHERDUCK_TOKEN", token.expose());
                println!("[Secrets] MOTHERDUCK_TOKEN set successfully");
            } else {
                eprintln!("[Secrets] No token field found in MotherDuck secret");
                return Err("MotherDuck secret missing token field".to_string());
            }
        },
        _ => {
            println!("[Secrets] Secret type {:?} not handled for direct connection application", 
                     secret.metadata.secret_type);
            // Other secret types would be injected directly into connections
            // This will be handled by the connection creation/execution logic
        }
    }
    
    Ok(())
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SecretTypeInfo {
    pub value: String,
    pub label: String,
    pub category: String,
    pub required_fields: Vec<String>,
    pub optional_fields: Vec<String>,
}

#[tauri::command]
pub async fn cleanup_orphaned_secrets(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
) -> Result<String, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    println!("[Secrets] Starting cleanup of orphaned secrets");
    
    let all_secrets = state
        .list_secrets(None)
        .await
        .map_err(|e| e.to_string())?;
    
    let mut cleaned = 0;
    let mut failed = 0;
    
    for secret in all_secrets {
        // Try to get the full secret (which includes keychain data)
        match state.get_secret(secret.id).await {
            Ok(_) => {
                // Secret is valid, skip
                println!("[Secrets] Secret {} is valid", secret.id);
            },
            Err(_) => {
                // Secret is orphaned (metadata exists but keychain doesn't)
                println!("[Secrets] Found orphaned secret: {} ({})", secret.name, secret.id);
                
                // Try to delete it
                match state.delete_secret(secret.id).await {
                    Ok(_) => {
                        println!("[Secrets] Successfully cleaned up orphaned secret: {}", secret.id);
                        cleaned += 1;
                    },
                    Err(e) => {
                        eprintln!("[Secrets] Failed to clean up orphaned secret {}: {}", secret.id, e);
                        failed += 1;
                    }
                }
            }
        }
    }
    
    Ok(format!("Cleanup complete: {} orphaned secrets removed, {} failed", cleaned, failed))
}

#[tauri::command]
pub async fn debug_secret(
    window: tauri::Window,
    state: State<'_, SecretsManager>,
    secret_id: String,
) -> Result<String, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    println!("[Secrets Debug] Checking secret: {}", secret_id);
    
    let id = Uuid::parse_str(&secret_id)
        .map_err(|e| format!("Invalid secret ID: {}", e))?;
    
    // Try to get the full secret
    match state.get_secret(id).await {
        Ok(secret) => {
            let mut debug_info = format!("Secret found!\n");
            debug_info.push_str(&format!("Name: {}\n", secret.metadata.name));
            debug_info.push_str(&format!("Type: {:?}\n", secret.metadata.secret_type));
            debug_info.push_str(&format!("Credential fields: {:?}\n", 
                secret.credentials.keys().collect::<Vec<_>>()));
            Ok(debug_info)
        }
        Err(e) => {
            Err(format!("Failed to get secret: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_secret_types(window: tauri::Window) -> Result<Vec<SecretTypeInfo>, String> {
    // This is a read-only metadata command, allow from both windows
    if window.label() != "secrets" && window.label() != "main" {
        return Err("Unauthorized: get_secret_types only available from main or secrets window".into());
    }
    let types = vec![
        SecretTypeInfo {
            value: "S3".to_string(),
            label: "Amazon S3".to_string(),
            category: "cloud".to_string(),
            required_fields: vec!["name".to_string(), "key_id".to_string(), "secret".to_string()],
            optional_fields: vec!["region".to_string(), "session_token".to_string(), "endpoint".to_string()],
        },
        SecretTypeInfo {
            value: "R2".to_string(),
            label: "Cloudflare R2".to_string(),
            category: "cloud".to_string(),
            required_fields: vec!["name".to_string(), "key_id".to_string(), "secret".to_string()],
            optional_fields: vec!["endpoint".to_string()],
        },
        SecretTypeInfo {
            value: "Azure".to_string(),
            label: "Azure Blob Storage".to_string(),
            category: "cloud".to_string(),
            required_fields: vec!["name".to_string(), "account_name".to_string(), "secret".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "GCS".to_string(),
            label: "Google Cloud Storage".to_string(),
            category: "cloud".to_string(),
            required_fields: vec!["name".to_string(), "key_id".to_string(), "secret".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "DuckLake".to_string(),
            label: "DuckLake".to_string(),
            category: "cloud".to_string(),
            required_fields: vec!["name".to_string(), "token".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "MotherDuck".to_string(),
            label: "MotherDuck".to_string(),
            category: "database".to_string(),
            required_fields: vec!["name".to_string(), "token".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "Postgres".to_string(),
            label: "PostgreSQL".to_string(),
            category: "database".to_string(),
            required_fields: vec!["name".to_string(), "host".to_string(), "port".to_string(), "database".to_string(), "username".to_string(), "password".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "MySQL".to_string(),
            label: "MySQL".to_string(),
            category: "database".to_string(),
            required_fields: vec!["name".to_string(), "host".to_string(), "port".to_string(), "database".to_string(), "username".to_string(), "password".to_string()],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "HTTP".to_string(),
            label: "HTTP Bearer/Basic Auth".to_string(),
            category: "api".to_string(),
            required_fields: vec!["name".to_string()],
            optional_fields: vec!["bearer_token".to_string(), "basic_username".to_string(), "basic_password".to_string()],
        },
        SecretTypeInfo {
            value: "HuggingFace".to_string(),
            label: "Hugging Face".to_string(),
            category: "api".to_string(),
            required_fields: vec!["name".to_string(), "token".to_string()],
            optional_fields: vec![],
        },
    ];
    
    Ok(types)
}