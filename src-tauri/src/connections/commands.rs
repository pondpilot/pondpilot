use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use super::manager::ConnectionsManager;
use super::models::{ConnectionConfig, ConnectionType, SslMode};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveConnectionRequest {
    pub name: String,
    pub connection_type: ConnectionType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub secret_id: String,
    pub read_only: Option<bool>,
    pub ssl_mode: Option<SslMode>,
    pub connect_timeout: Option<u32>,
    pub query_timeout: Option<u32>,
    pub max_connections: Option<u32>,
    pub schema: Option<String>,
    pub tags: Vec<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConnectionRequest {
    pub connection_id: String,
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub secret_id: Option<String>,
    pub read_only: Option<Option<bool>>,
    pub ssl_mode: Option<SslMode>,
    pub connect_timeout: Option<Option<u32>>,
    pub query_timeout: Option<Option<u32>>,
    pub max_connections: Option<Option<u32>>,
    pub schema: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub description: Option<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionResponse {
    pub connection: ConnectionConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionListResponse {
    pub connections: Vec<ConnectionConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionTypeInfo {
    pub value: String,
    pub label: String,
    pub default_port: u16,
    pub supported_ssl_modes: Vec<String>,
}

#[tauri::command]
pub async fn save_connection(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    request: SaveConnectionRequest,
) -> Result<ConnectionResponse, String> {
    // Verify this command is called from the main window
    if window.label() != "main" {
        return Err("Unauthorized: connection commands only available from main window".into());
    }

    tracing::info!("[Connections] Save connection request received");
    tracing::info!("[Connections]   - Name: {}", request.name);
    tracing::info!("[Connections]   - Type: {:?}", request.connection_type);
    tracing::info!("[Connections]   - Host: {}", request.host);
    tracing::info!("[Connections]   - Port: {}", request.port);
    tracing::info!("[Connections]   - Database: {}", request.database);
    tracing::info!("[Connections]   - Secret ID: {}", request.secret_id);

    let secret_id =
        Uuid::parse_str(&request.secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    let mut config = ConnectionConfig::new(
        request.name,
        request.connection_type,
        request.host,
        request.port,
        request.database,
        secret_id,
    );

    // Set optional fields
    config.read_only = request.read_only;
    config.ssl_mode = request.ssl_mode;
    config.connect_timeout = request.connect_timeout;
    config.query_timeout = request.query_timeout;
    config.max_connections = request.max_connections;
    config.schema = request.schema;
    config.tags = request.tags;
    config.description = request.description;

    let connection = state.save_connection(config).await.map_err(|e| {
        tracing::error!("[Connections] Failed to save connection: {}", e);
        e.to_string()
    })?;

    tracing::info!(
        "[Connections] Connection saved successfully with ID: {}",
        connection.id
    );

    Ok(ConnectionResponse { connection })
}

#[tauri::command]
pub async fn list_connections(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_type: Option<ConnectionType>,
) -> Result<ConnectionListResponse, String> {
    // Allow listing connections from main window
    if window.label() != "main" {
        return Err("Unauthorized: list_connections only available from main window".into());
    }

    tracing::info!(
        "[Connections] Listing connections with type filter: {:?}",
        connection_type
    );

    let connections = state.list_connections(connection_type).await.map_err(|e| {
        tracing::error!("[Connections] Failed to list connections: {}", e);
        e.to_string()
    })?;

    tracing::info!("[Connections] Found {} connections", connections.len());
    for connection in &connections {
        tracing::info!(
            "[Connections]   - {} ({:?}): {}",
            connection.name,
            connection.connection_type,
            connection.id
        );
    }

    Ok(ConnectionListResponse { connections })
}

#[tauri::command]
pub async fn get_connection(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
) -> Result<ConnectionResponse, String> {
    // Allow getting connection metadata from main window
    if window.label() != "main" {
        return Err("Unauthorized: get_connection only available from main window".into());
    }

    let id =
        Uuid::parse_str(&connection_id).map_err(|e| format!("Invalid connection ID: {}", e))?;

    let connection = state.get_connection(id).await.map_err(|e| {
        tracing::error!(
            "[Connections] Failed to get connection {}: {}",
            connection_id,
            e
        );
        e.to_string()
    })?;

    Ok(ConnectionResponse { connection })
}

#[tauri::command]
pub async fn delete_connection(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
) -> Result<(), String> {
    // Verify this command is called from the main window
    if window.label() != "main" {
        return Err("Unauthorized: connection commands only available from main window".into());
    }

    tracing::info!(
        "[Connections] Delete request for connection: {}",
        connection_id
    );

    let id = Uuid::parse_str(&connection_id).map_err(|e| {
        tracing::error!("[Connections] Invalid connection ID format: {}", e);
        format!("Invalid connection ID: {}", e)
    })?;

    state.delete_connection(id).await.map_err(|e| {
        tracing::error!(
            "[Connections] Failed to delete connection {}: {}",
            connection_id,
            e
        );
        e.to_string()
    })?;

    tracing::info!(
        "[Connections] Connection {} deleted successfully",
        connection_id
    );
    Ok(())
}

#[tauri::command]
pub async fn update_connection(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    request: UpdateConnectionRequest,
) -> Result<ConnectionResponse, String> {
    // Verify this command is called from the main window
    if window.label() != "main" {
        return Err("Unauthorized: connection commands only available from main window".into());
    }

    tracing::info!(
        "[Connections] Update request for connection: {}",
        request.connection_id
    );

    let id = Uuid::parse_str(&request.connection_id)
        .map_err(|e| format!("Invalid connection ID: {}", e))?;

    let secret_id = request
        .secret_id
        .map(|s| Uuid::parse_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid secret ID: {}", e))?;

    let connection = state
        .update_connection(
            id,
            request.name,
            request.host,
            request.port,
            request.database,
            secret_id,
            request.read_only,
            request.ssl_mode,
            request.connect_timeout,
            request.query_timeout,
            request.max_connections,
            request.schema,
            request.tags,
            request.description,
        )
        .await
        .map_err(|e| {
            tracing::error!(
                "[Connections] Failed to update connection {}: {}",
                request.connection_id,
                e
            );
            e.to_string()
        })?;

    tracing::info!(
        "[Connections] Connection {} updated successfully",
        request.connection_id
    );

    Ok(ConnectionResponse { connection })
}

#[tauri::command]
pub async fn test_database_connection(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
) -> Result<bool, String> {
    // Verify this command is called from the main window
    if window.label() != "main" {
        return Err("Unauthorized: connection commands only available from main window".into());
    }

    tracing::info!(
        "[Connections] Test request for connection: {}",
        connection_id
    );

    let id =
        Uuid::parse_str(&connection_id).map_err(|e| format!("Invalid connection ID: {}", e))?;

    let is_successful = state.test_connection(id).await.map_err(|e| {
        tracing::error!(
            "[Connections] Failed to test connection {}: {}",
            connection_id,
            e
        );
        e.to_string()
    })?;

    if is_successful {
        tracing::info!("[Connections] Connection {} test successful", connection_id);
    } else {
        tracing::info!("[Connections] Connection {} test failed", connection_id);
    }

    Ok(is_successful)
}

#[tauri::command]
pub async fn test_database_connection_config(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    config: super::models::ConnectionTestConfig,
    secret_id: String,
) -> Result<bool, String> {
    // Verify this command is called from the main window
    if window.label() != "main" {
        return Err("Unauthorized: connection commands only available from main window".into());
    }

    tracing::info!(
        "[Connections] Test request for connection config with secret: {}",
        secret_id
    );

    let secret_uuid =
        Uuid::parse_str(&secret_id).map_err(|e| format!("Invalid secret ID: {}", e))?;

    let is_successful = state
        .test_connection_config(config, secret_uuid)
        .await
        .map_err(|e| {
            tracing::error!("[Connections] Failed to test connection config: {}", e);
            e.to_string()
        })?;

    if is_successful {
        tracing::info!("[Connections] Connection config test successful");
    } else {
        tracing::info!("[Connections] Connection config test failed");
    }

    Ok(is_successful)
}

#[tauri::command]
pub async fn get_connection_types(
    window: tauri::Window,
) -> Result<Vec<ConnectionTypeInfo>, String> {
    // This is a read-only metadata command, allow from main window
    if window.label() != "main" {
        return Err("Unauthorized: get_connection_types only available from main window".into());
    }

    let types = vec![
        ConnectionTypeInfo {
            value: "postgres".to_string(),
            label: "PostgreSQL".to_string(),
            default_port: 5432,
            supported_ssl_modes: vec![
                "disable".to_string(),
                "allow".to_string(),
                "prefer".to_string(),
                "require".to_string(),
                "verify-ca".to_string(),
                "verify-full".to_string(),
            ],
        },
        ConnectionTypeInfo {
            value: "mysql".to_string(),
            label: "MySQL".to_string(),
            default_port: 3306,
            supported_ssl_modes: vec!["disable".to_string(), "require".to_string()],
        },
    ];

    Ok(types)
}

#[tauri::command]
pub async fn get_connection_with_credentials(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
) -> Result<String, String> {
    // SECURITY: This is a sensitive command that returns credentials
    // Restrict to main window only and log access
    if window.label() != "main" {
        return Err(
            "Unauthorized: get_connection_with_credentials only available from main window".into(),
        );
    }

    tracing::info!(
        "[Connections] Get credentials request for connection: {}",
        connection_id
    );

    let id =
        Uuid::parse_str(&connection_id).map_err(|e| format!("Invalid connection ID: {}", e))?;

    let connection_with_creds = state
        .get_connection_with_credentials(id)
        .await
        .map_err(|e| {
            tracing::error!(
                "[Connections] Failed to get connection with credentials {}: {}",
                connection_id,
                e
            );
            e.to_string()
        })?;

    // Return a redacted connection string to avoid exposing secrets to the renderer
    let safe_connection_string = connection_with_creds.get_safe_connection_string();

    tracing::info!(
        "[Connections] Safe connection string generated for {}",
        connection_id
    );

    Ok(safe_connection_string)
}

#[tauri::command]
pub async fn register_motherduck_attachment(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    database_url: String,
) -> Result<(), String> {
    // Security check
    if window.label() != "main" {
        return Err(
            "Unauthorized: register_motherduck_attachment only available from main window".into(),
        );
    }

    // Validate it's a MotherDuck URL
    if !database_url.starts_with("md:") {
        return Err("Invalid MotherDuck URL: must start with 'md:'".into());
    }

    state
        .register_motherduck_attachment(database_url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn attach_remote_database(
    window: tauri::Window,
    state: State<'_, ConnectionsManager>,
    connection_id: String,
    database_alias: String,
) -> Result<(), String> {
    // SECURITY: This command attaches remote databases, restrict to main window
    if window.label() != "main" {
        return Err("Unauthorized: attach_remote_database only available from main window".into());
    }

    let id = uuid::Uuid::parse_str(&connection_id)
        .map_err(|e| format!("Invalid connection ID: {}", e))?;

    state
        .attach_remote_database(id, database_alias)
        .await
        .map_err(|e| e.to_string())
}
