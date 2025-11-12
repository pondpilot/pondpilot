use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::database::motherduck_token;

use super::manager::SecretsManager;
use super::models::{SecretFields, SecretMetadata, SecretType};

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
#[serde(rename_all = "snake_case")]
pub enum SecretApplyOperation {
    MotherduckList,
    MotherduckAttach,
    MotherduckReconnect,
    PostgresTest,
    PostgresSave,
    MysqlTest,
    MysqlSave,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplySecretRequest {
    pub connection_id: String,
    pub secret_id: String,
    #[serde(default)]
    pub operation: Option<SecretApplyOperation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecretResponse {
    pub metadata: SecretMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecretListResponse {
    pub secrets: Vec<SecretMetadata>,
}

fn build_secret_alias(id: &Uuid) -> String {
    format!("secret_{}", id.to_string().replace('-', "_"))
}

#[tauri::command]
pub async fn save_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    request: SaveSecretRequest,
) -> Result<SecretResponse, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    #[cfg(debug_assertions)]
    {
        println!("[Secrets] Save secret request received:");
        println!("[Secrets]   - Type: {:?}", request.secret_type);
        println!("[Secrets]   - Name: {}", request.name);
        println!("[Secrets]   - Tags: {:?}", request.tags);
        println!("[Secrets]   - Fields provided:");
    }

    // Log which fields are provided (without values for security)
    #[cfg(debug_assertions)]
    {
        if request.fields.token.is_some() {
            println!("[Secrets]     - token: [PROVIDED]");
        }
        if request.fields.key_id.is_some() {
            println!("[Secrets]     - key_id: [PROVIDED]");
        }
        if request.fields.secret.is_some() {
            println!("[Secrets]     - secret: [PROVIDED]");
        }
        if request.fields.host.is_some() {
            println!("[Secrets]     - host: [PROVIDED]");
        }
        if request.fields.password.is_some() {
            println!("[Secrets]     - password: [PROVIDED]");
        }
    }

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

    #[cfg(debug_assertions)]
    println!(
        "[Secrets] Secret saved successfully with ID: {}",
        metadata.id
    );

    Ok(SecretResponse { metadata })
}

#[tauri::command]
pub async fn list_secrets(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    secret_type: Option<SecretType>,
) -> Result<SecretListResponse, String> {
    // List secrets metadata is allowed from main and secrets windows
    // We only return metadata (no actual secret values), so this is relatively safe
    if window.label() != "secrets" && window.label() != "main" {
        return Err("Unauthorized: list_secrets only available from main or secrets window".into());
    }
    #[cfg(debug_assertions)]
    println!(
        "[Secrets] Listing secrets with type filter: {:?}",
        secret_type
    );

    let secrets = state.list_secrets(secret_type).await.map_err(|e| {
        eprintln!("[Secrets] Failed to list secrets: {}", e);
        e.to_string()
    })?;

    #[cfg(debug_assertions)]
    {
        println!("[Secrets] Found {} secrets", secrets.len());
        for secret in &secrets {
            println!(
                "[Secrets]   - {} ({:?}): {}",
                secret.name, secret.secret_type, secret.id
            );
        }
    }

    Ok(SecretListResponse { secrets })
}

#[tauri::command]
pub async fn get_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    secret_id: String,
) -> Result<SecretResponse, String> {
    // Get secret metadata is allowed from main and secrets windows
    // NOTE: This only returns metadata, NOT the actual secret values
    if window.label() != "secrets" && window.label() != "main" {
        return Err("Unauthorized: get_secret only available from main or secrets window".into());
    }

    let id = Uuid::parse_str(&secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    let secret = state.get_secret(id).await.map_err(|e| e.to_string())?;

    // IMPORTANT: Only return metadata, never expose actual credentials to frontend
    Ok(SecretResponse {
        metadata: secret.metadata.clone(),
    })
}

#[tauri::command]
pub async fn delete_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    engine: tauri::State<'_, Arc<crate::database::DuckDBEngine>>,
    secret_id: String,
) -> Result<(), String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    #[cfg(debug_assertions)]
    println!("[Secrets] Delete request for secret: {}", secret_id);

    let id = Uuid::parse_str(&secret_id).map_err(|e| {
        eprintln!("[Secrets] Invalid secret ID format: {}", e);
        format!("Invalid secret ID: {}", e)
    })?;

    let secret = state.get_secret(id).await.map_err(|e| {
        #[cfg(debug_assertions)]
        eprintln!("[Secrets] Failed to load secret {} before deletion: {}", secret_id, e);
        e.to_string()
    })?;

    state.delete_secret(id).await.map_err(|e| {
        #[cfg(debug_assertions)]
        eprintln!("[Secrets] Failed to delete secret {}: {}", secret_id, e);
        e.to_string()
    })?;

    if matches!(secret.metadata.secret_type, SecretType::MotherDuck) {
        engine.clear_motherduck_token().await;
    }

    #[cfg(debug_assertions)]
    println!("[Secrets] Secret {} deleted successfully", secret_id);
    Ok(())
}

#[tauri::command]
pub async fn update_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    engine: tauri::State<'_, Arc<crate::database::DuckDBEngine>>,
    request: UpdateSecretRequest,
) -> Result<SecretResponse, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    let id =
        Uuid::parse_str(&request.secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

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

    if metadata.secret_type == SecretType::MotherDuck {
        match state.get_secret(id).await {
            Ok(secret) => {
                if let Some(token) = secret.credentials.get("token") {
                    engine.set_motherduck_token(token.expose()).await;
                } else {
                    engine.clear_motherduck_token().await;
                }
            }
            Err(err) => {
                tracing::warn!(
                    "[Secrets] Unable to refresh MotherDuck token after update: {}",
                    err
                );
            }
        }
    }

    Ok(SecretResponse { metadata })
}

#[tauri::command]
pub async fn test_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    secret_id: String,
) -> Result<bool, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    let id = Uuid::parse_str(&secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    state.test_secret(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_secret_to_connection(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    engine: tauri::State<'_, Arc<crate::database::DuckDBEngine>>,
    request: ApplySecretRequest,
) -> Result<(), String> {
    // SECURITY: Restrict this command to only the main window
    // This command can set environment variables with secret values,
    // so we need to be careful about who can call it
    if window.label() != "main" {
        return Err(
            "Unauthorized: apply_secret_to_connection only available from main window".into(),
        );
    }

    // Preferred validation path: explicit operation enum
    let is_allowed = if let Some(op) = &request.operation {
        matches!(
            op,
            SecretApplyOperation::MotherduckList
                | SecretApplyOperation::MotherduckAttach
                | SecretApplyOperation::MotherduckReconnect
                | SecretApplyOperation::PostgresTest
                | SecretApplyOperation::PostgresSave
                | SecretApplyOperation::MysqlTest
                | SecretApplyOperation::MysqlSave
        )
    } else {
        // Backward compatibility: prefix-based whitelist of connection_id
        let allowed_prefixes = vec![
            "motherduck_list",
            "motherduck_attach",
            "motherduck_reconnect_",
            "postgres_test_",
            "postgres_save_",
            "mysql_test_",
            "mysql_save_",
        ];
        allowed_prefixes
            .iter()
            .any(|prefix| request.connection_id.starts_with(prefix))
    };
    if !is_allowed {
        // SECURITY AUDIT: Log denied secret access attempts for security monitoring
        // Redact sensitive IDs to prevent information disclosure in logs
        let connection_prefix = request.connection_id.chars().take(10).collect::<String>();
        #[cfg(debug_assertions)]
        eprintln!(
            "[SECURITY AUDIT] Denied secret access attempt - connection_prefix: {}..., window: {}",
            connection_prefix,
            window.label()
        );
        tracing::warn!("[SECURITY AUDIT] Secret access denied for connection pattern check");
        return Err("Invalid connection_id".into());
    }

    let conn_preview = request
        .connection_id
        .chars()
        .take(24)
        .collect::<String>();
    tracing::info!(
        "[Secrets] Applying secret {} to connection {} (operation: {:?})",
        request.secret_id,
        conn_preview,
        request.operation
    );

    let secret_id =
        Uuid::parse_str(&request.secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    let secret = state.get_secret(secret_id).await.map_err(|e| {
        eprintln!("[Secrets] Failed to get secret: {}", e);
        e.to_string()
    })?;

    tracing::debug!(
        "[Secrets] Retrieved secret type {:?} for connection {}",
        secret.metadata.secret_type,
        conn_preview
    );

    match secret.metadata.secret_type {
        SecretType::MotherDuck => {
            if let Some(token) = secret.credentials.get("token") {
                let token_value = token.expose();
                motherduck_token::set_token(token_value);
                tracing::info!(
                    "[Secrets] MotherDuck token cached and propagated for connection {}",
                    conn_preview
                );
                engine.set_motherduck_token(token_value).await;
            } else {
                eprintln!("[Secrets] No token field found in MotherDuck secret");
                return Err("MotherDuck secret missing token field".to_string());
            }
        }
        SecretType::Postgres | SecretType::MySQL => {
            #[cfg(debug_assertions)]
            println!(
                "[Secrets] Database secret type {:?} applied successfully for testing",
                secret.metadata.secret_type
            );
            // For database secrets, we don't set environment variables
            // Instead, the connection testing will use CREATE SECRET + ATTACH pattern
        }
        _ => {
            #[cfg(debug_assertions)]
            println!(
                "[Secrets] Secret type {:?} not handled for direct connection application",
                secret.metadata.secret_type
            );
            // Other secret types would be injected directly into connections
            // This will be handled by the connection creation/execution logic
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn register_storage_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    engine: tauri::State<'_, Arc<crate::database::DuckDBEngine>>,
    secret_id: String,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err(
            "Unauthorized: register_storage_secret only available from main window".into(),
        );
    }

    let id = Uuid::parse_str(&secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;
    let secret = state.get_secret(id).await.map_err(|e| e.to_string())?;

    match secret.metadata.secret_type {
        SecretType::S3
        | SecretType::R2
        | SecretType::GCS
        | SecretType::Azure
        | SecretType::HTTP
        | SecretType::HuggingFace
        | SecretType::DuckLake => {}
        _ => {
            return Err("Secret type not supported for cloud/API attachments".into());
        }
    }

    let injector = crate::secrets::injector::DuckDBSecretInjector::new();
    let secret_sql = injector
        .build_create_secret(&secret)
        .map_err(|e| e.to_string())?;

    engine
        .register_secret_sql(secret_sql)
        .await
        .map_err(|e| e.to_string())?;

    Ok(build_secret_alias(&secret.metadata.id))
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
    state: State<'_, Arc<SecretsManager>>,
) -> Result<String, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    #[cfg(debug_assertions)]
    println!("[Secrets] Starting cleanup of orphaned secrets");

    let all_secrets = state.list_secrets(None).await.map_err(|e| e.to_string())?;

    let mut cleaned = 0;
    let mut failed = 0;

    for secret in all_secrets {
        // Try to get the full secret (which includes keychain data)
        match state.get_secret(secret.id).await {
            Ok(_) => {
                // Secret is valid, skip
                #[cfg(debug_assertions)]
                println!("[Secrets] Secret {} is valid", secret.id);
            }
            Err(_) => {
                // Secret is orphaned (metadata exists but keychain doesn't)
                #[cfg(debug_assertions)]
                println!(
                    "[Secrets] Found orphaned secret: {} ({})",
                    secret.name, secret.id
                );

                // Try to delete it
                match state.delete_secret(secret.id).await {
                    Ok(_) => {
                        #[cfg(debug_assertions)]
                        println!(
                            "[Secrets] Successfully cleaned up orphaned secret: {}",
                            secret.id
                        );
                        cleaned += 1;
                    }
                    Err(e) => {
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[Secrets] Failed to clean up orphaned secret {}: {}",
                            secret.id, e
                        );
                        failed += 1;
                    }
                }
            }
        }
    }

    Ok(format!(
        "Cleanup complete: {} orphaned secrets removed, {} failed",
        cleaned, failed
    ))
}

#[tauri::command]
pub async fn debug_secret(
    window: tauri::Window,
    state: State<'_, Arc<SecretsManager>>,
    secret_id: String,
) -> Result<String, String> {
    // Verify this command is called from the secrets window
    if window.label() != "secrets" {
        return Err("Unauthorized: secrets commands only available from secrets window".into());
    }
    #[cfg(debug_assertions)]
    println!("[Secrets Debug] Checking secret: {}", secret_id);

    let id = Uuid::parse_str(&secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    // Try to get the full secret
    match state.get_secret(id).await {
        Ok(secret) => {
            let mut debug_info = format!("Secret found!\n");
            debug_info.push_str(&format!("Name: {}\n", secret.metadata.name));
            debug_info.push_str(&format!("Type: {:?}\n", secret.metadata.secret_type));
            debug_info.push_str(&format!(
                "Credential fields: {:?}\n",
                secret.credentials.keys().collect::<Vec<_>>()
            ));
            Ok(debug_info)
        }
        Err(e) => Err(format!("Failed to get secret: {}", e)),
    }
}

#[tauri::command]
pub async fn get_secret_types(window: tauri::Window) -> Result<Vec<SecretTypeInfo>, String> {
    // This is a read-only metadata command, allow from both windows
    if window.label() != "secrets" && window.label() != "main" {
        return Err(
            "Unauthorized: get_secret_types only available from main or secrets window".into(),
        );
    }
    let types = vec![
        SecretTypeInfo {
            value: "S3".to_string(),
            label: "Amazon S3".to_string(),
            category: "cloud".to_string(),
            required_fields: vec![
                "name".to_string(),
                "key_id".to_string(),
                "secret".to_string(),
            ],
            optional_fields: vec![
                "region".to_string(),
                "session_token".to_string(),
                "endpoint".to_string(),
            ],
        },
        SecretTypeInfo {
            value: "R2".to_string(),
            label: "Cloudflare R2".to_string(),
            category: "cloud".to_string(),
            required_fields: vec![
                "name".to_string(),
                "key_id".to_string(),
                "secret".to_string(),
            ],
            optional_fields: vec!["endpoint".to_string()],
        },
        SecretTypeInfo {
            value: "Azure".to_string(),
            label: "Azure Blob Storage".to_string(),
            category: "cloud".to_string(),
            required_fields: vec![
                "name".to_string(),
                "account_name".to_string(),
                "secret".to_string(),
            ],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "GCS".to_string(),
            label: "Google Cloud Storage".to_string(),
            category: "cloud".to_string(),
            required_fields: vec![
                "name".to_string(),
                "key_id".to_string(),
                "secret".to_string(),
            ],
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
            required_fields: vec![
                "name".to_string(),
                "username".to_string(),
                "password".to_string(),
            ],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "MySQL".to_string(),
            label: "MySQL".to_string(),
            category: "database".to_string(),
            required_fields: vec![
                "name".to_string(),
                "username".to_string(),
                "password".to_string(),
            ],
            optional_fields: vec![],
        },
        SecretTypeInfo {
            value: "HTTP".to_string(),
            label: "HTTP Bearer/Basic Auth".to_string(),
            category: "api".to_string(),
            required_fields: vec!["name".to_string()],
            optional_fields: vec![
                "bearer_token".to_string(),
                "basic_username".to_string(),
                "basic_password".to_string(),
            ],
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
