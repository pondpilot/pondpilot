use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Arc;
use uuid::Uuid;

use super::errors::ConnectionError;
use super::models::{ConnectionConfig, ConnectionType, ConnectionWithCredentials};
use crate::database::motherduck_token;
use crate::database::sql_utils::{escape_string_literal, validate_motherduck_url};
use crate::database::DuckDBEngine;
use crate::secrets::manager::SecretsManager;
use crate::secrets::models::{SecretCredentials, SecretType};

/// Manages database connections configuration and storage
/// Handles CRUD operations for connection metadata and integrates with the secrets manager
pub struct ConnectionsManager {
    db_path: PathBuf,
    secrets_manager: Arc<SecretsManager>,
    duckdb_engine: Option<Arc<DuckDBEngine>>,
}

impl ConnectionsManager {
    /// Create a new connections manager with the given secrets manager
    /// Initializes the local database for storing connection metadata
    pub fn new(secrets_manager: Arc<SecretsManager>) -> Result<Self, ConnectionError> {
        let app_dir = dirs::config_dir()
            .ok_or_else(|| {
                ConnectionError::StorageError("Could not find config directory".to_string())
            })?
            .join("pondpilot");

        std::fs::create_dir_all(&app_dir).map_err(|e| {
            ConnectionError::StorageError(format!("Failed to create app directory: {}", e))
        })?;

        let db_path = app_dir.join("connections.db");

        let manager = Self {
            db_path,
            secrets_manager,
            duckdb_engine: None,
        };

        manager.init_database()?;
        Ok(manager)
    }

    /// Set the DuckDB engine to use for attachments
    pub fn set_duckdb_engine(&mut self, engine: Arc<DuckDBEngine>) {
        self.duckdb_engine = Some(engine);
    }

    async fn apply_motherduck_secret(&self, secret_id: Uuid) -> Result<(), ConnectionError> {
        let secret = self.secrets_manager.get_secret(secret_id).await?;

        if secret.metadata.secret_type != SecretType::MotherDuck {
            return Err(ConnectionError::ConnectionTestFailed {
                error: "Secret is not a MotherDuck token".to_string(),
            });
        }

        let token = secret
            .credentials
            .get("token")
            .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                error: "MotherDuck secret missing token value".to_string(),
            })?
            .expose()
            .to_string();

        let engine =
            self.duckdb_engine
                .as_ref()
                .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                    error: "DuckDB engine not initialized".to_string(),
                })?;

        engine.set_motherduck_token(&token).await;
        Ok(())
    }

    fn init_database(&self) -> Result<(), ConnectionError> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                connection_type TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                database_name TEXT NOT NULL,
                secret_id TEXT NOT NULL,
                read_only INTEGER,
                ssl_mode TEXT,
                connect_timeout INTEGER,
                query_timeout INTEGER,
                max_connections INTEGER,
                schema_name TEXT,
                options TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_used TEXT,
                tags TEXT,
                description TEXT
            )
            "#,
            [],
        )?;

        // Create index on name for faster lookups
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name)",
            [],
        )?;

        // Create index on connection_type for filtering
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_connections_type ON connections(connection_type)",
            [],
        )?;

        Ok(())
    }

    pub async fn save_connection(
        &self,
        mut config: ConnectionConfig,
    ) -> Result<ConnectionConfig, ConnectionError> {
        config.validate()?;

        // Verify the secret exists
        self.secrets_manager.get_secret(config.secret_id).await?;

        config.updated_at = Utc::now();

        let conn = Connection::open(&self.db_path)?;

        let options_json = config
            .options
            .as_ref()
            .map(|opts| serde_json::to_string(opts))
            .transpose()?;

        let tags_json = serde_json::to_string(&config.tags)?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO connections (
                id, name, connection_type, host, port, database_name, secret_id,
                read_only, ssl_mode, connect_timeout, query_timeout, max_connections,
                schema_name, options, created_at, updated_at, last_used, tags, description
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
            )
            "#,
            params![
                config.id.to_string(),
                config.name,
                config.connection_type.to_string(),
                config.host,
                config.port,
                config.database,
                config.secret_id.to_string(),
                config.read_only.map(|r| if r { 1 } else { 0 }),
                config.ssl_mode.as_ref().map(|s| s.to_string()),
                config.connect_timeout,
                config.query_timeout,
                config.max_connections,
                config.schema,
                options_json,
                config.created_at.to_rfc3339(),
                config.updated_at.to_rfc3339(),
                config.last_used.as_ref().map(|t| t.to_rfc3339()),
                tags_json,
                config.description,
            ],
        )?;

        Ok(config)
    }

    pub async fn list_connections(
        &self,
        connection_type: Option<ConnectionType>,
    ) -> Result<Vec<ConnectionConfig>, ConnectionError> {
        let conn = Connection::open(&self.db_path)?;

        let (query, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match connection_type {
            Some(conn_type) => (
                "SELECT * FROM connections WHERE connection_type = ?1 ORDER BY updated_at DESC"
                    .to_string(),
                vec![Box::new(conn_type.to_string())],
            ),
            None => (
                "SELECT * FROM connections ORDER BY updated_at DESC".to_string(),
                vec![],
            ),
        };

        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            self.row_to_connection_config(row)
        })?;

        let mut connections = Vec::new();
        for row in rows {
            connections.push(row?);
        }

        Ok(connections)
    }

    pub async fn get_connection(
        &self,
        connection_id: Uuid,
    ) -> Result<ConnectionConfig, ConnectionError> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare("SELECT * FROM connections WHERE id = ?1")?;
        let config = stmt.query_row([connection_id.to_string()], |row| {
            self.row_to_connection_config(row)
        })?;

        Ok(config)
    }

    pub async fn get_connection_with_credentials(
        &self,
        connection_id: Uuid,
    ) -> Result<ConnectionWithCredentials, ConnectionError> {
        let config = self.get_connection(connection_id).await?;
        let secret = self.secrets_manager.get_secret(config.secret_id).await?;

        let username = self.extract_username(&secret)?;
        let password = self.extract_password(&secret)?;

        // Update last_used timestamp
        self.update_last_used(connection_id).await?;

        Ok(ConnectionWithCredentials {
            config,
            username,
            password,
        })
    }

    pub async fn delete_connection(&self, connection_id: Uuid) -> Result<(), ConnectionError> {
        let conn = Connection::open(&self.db_path)?;

        let rows_affected = conn.execute(
            "DELETE FROM connections WHERE id = ?1",
            [connection_id.to_string()],
        )?;

        if rows_affected == 0 {
            return Err(ConnectionError::ConnectionNotFound {
                id: connection_id.to_string(),
            });
        }

        Ok(())
    }

    pub async fn update_connection(
        &self,
        connection_id: Uuid,
        name: Option<String>,
        host: Option<String>,
        port: Option<u16>,
        database: Option<String>,
        secret_id: Option<Uuid>,
        read_only: Option<Option<bool>>,
        ssl_mode: Option<super::models::SslMode>,
        connect_timeout: Option<Option<u32>>,
        query_timeout: Option<Option<u32>>,
        max_connections: Option<Option<u32>>,
        schema: Option<Option<String>>,
        tags: Option<Vec<String>>,
        description: Option<Option<String>>,
    ) -> Result<ConnectionConfig, ConnectionError> {
        let mut config = self.get_connection(connection_id).await?;

        // Update fields if provided
        if let Some(name) = name {
            config.name = name;
        }
        if let Some(host) = host {
            config.host = host;
        }
        if let Some(port) = port {
            config.port = port;
        }
        if let Some(database) = database {
            config.database = database;
        }
        if let Some(secret_id) = secret_id {
            // Verify the new secret exists
            self.secrets_manager.get_secret(secret_id).await?;
            config.secret_id = secret_id;
        }
        if let Some(read_only) = read_only {
            config.read_only = read_only;
        }
        if let Some(ssl_mode) = ssl_mode {
            config.ssl_mode = Some(ssl_mode);
        }
        if let Some(connect_timeout) = connect_timeout {
            config.connect_timeout = connect_timeout;
        }
        if let Some(query_timeout) = query_timeout {
            config.query_timeout = query_timeout;
        }
        if let Some(max_connections) = max_connections {
            config.max_connections = max_connections;
        }
        if let Some(schema) = schema {
            config.schema = schema;
        }
        if let Some(tags) = tags {
            config.tags = tags;
        }
        if let Some(description) = description {
            config.description = description;
        }

        self.save_connection(config).await
    }

    pub async fn test_connection(&self, connection_id: Uuid) -> Result<bool, ConnectionError> {
        let connection_with_creds = self.get_connection_with_credentials(connection_id).await?;

        match connection_with_creds.config.connection_type {
            ConnectionType::Postgres => self.test_postgres_connection(&connection_with_creds).await,
            ConnectionType::MySQL => self.test_mysql_connection(&connection_with_creds).await,
        }
    }

    pub async fn test_connection_config(
        &self,
        test_config: super::models::ConnectionTestConfig,
        secret_id: Uuid,
    ) -> Result<bool, ConnectionError> {
        // Validate the connection config
        test_config.validate()?;

        // Convert to full ConnectionConfig for testing
        let config = test_config.to_connection_config(secret_id);

        // Get the secret credentials
        let secret_credentials = self
            .secrets_manager
            .get_secret(secret_id)
            .await
            .map_err(|e| ConnectionError::SecretError(format!("Failed to get secret: {}", e)))?;

        // Extract username and password from credentials
        let username = secret_credentials
            .credentials
            .get("username")
            .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                error: "Secret missing username".to_string(),
            })?;

        let password = secret_credentials
            .credentials
            .get("password")
            .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                error: "Secret missing password".to_string(),
            })?;

        // Create ConnectionWithCredentials for testing
        let connection_with_creds = ConnectionWithCredentials {
            config,
            username: username.expose().to_string(),
            password: password.expose().to_string(),
        };

        // Test the connection
        match connection_with_creds.config.connection_type {
            ConnectionType::Postgres => self.test_postgres_connection(&connection_with_creds).await,
            ConnectionType::MySQL => self.test_mysql_connection(&connection_with_creds).await,
        }
    }

    async fn test_remote_db_connection(
        &self,
        connection: &ConnectionWithCredentials,
        db_type: &str,
        extension_name: &str,
        secret_type: crate::secrets::models::SecretType,
    ) -> Result<bool, ConnectionError> {
        // Validate credentials
        if connection.username.is_empty() || connection.password.is_empty() {
            return Err(ConnectionError::ConnectionTestFailed {
                error: "Missing username or password".to_string(),
            });
        }

        tracing::info!(
            "[Connections] Testing {} connection to {}:{}",
            db_type,
            connection.config.host,
            connection.config.port
        );

        // Create an in-memory DuckDB connection for testing
        let duckdb_conn = duckdb::Connection::open_in_memory().map_err(|e| {
            ConnectionError::ConnectionTestFailed {
                error: format!("Failed to create test DuckDB connection: {}", e),
            }
        })?;

        // Install and load the extension
        let install_cmd = format!("INSTALL {}; LOAD {};", extension_name, extension_name);
        if let Err(e) = duckdb_conn.execute_batch(&install_cmd) {
            tracing::warn!(
                "[Connections] Failed to install/load {} extension: {}",
                extension_name,
                e
            );
            return Err(ConnectionError::ConnectionTestFailed {
                error: format!("{} extension not available: {}", db_type, e),
            });
        }

        // Create a unique database alias for testing
        let test_alias = format!(
            "test_{}_{}",
            extension_name,
            uuid::Uuid::new_v4().simple()
        );

        // Get the existing secret from the secrets manager
        let existing_secret = self
            .secrets_manager
            .get_secret(connection.config.secret_id)
            .await
            .map_err(|e| ConnectionError::ConnectionTestFailed {
                error: format!("Failed to get existing secret: {}", e),
            })?;

        // Build connection string with parameters (but not credentials)
        let mut connection_params = vec![
            format!("host={}", connection.config.host),
            format!("port={}", connection.config.port),
        ];

        // Use appropriate database parameter name based on type
        if db_type == "POSTGRES" {
            connection_params.push(format!("dbname={}", connection.config.database));
        } else {
            connection_params.push(format!("database={}", connection.config.database));
        }

        // Add SSL mode if specified (PostgreSQL only)
        if db_type == "POSTGRES" {
            if let Some(ssl_mode) = &connection.config.ssl_mode {
                connection_params.push(format!("sslmode={}", ssl_mode.to_string()));
            }
        }

        let connection_string = connection_params.join(" ");

        // Get the secret name from the existing secret metadata
        let secret_name = format!(
            "secret_{}",
            existing_secret.metadata.id.to_string().replace("-", "_")
        );

        // Create a temporary secret with only the authentication credentials
        let mut temp_credentials = std::collections::HashMap::new();
        if let Some(username) = existing_secret.credentials.get("username") {
            temp_credentials.insert(
                "username".to_string(),
                crate::secrets::models::SecureString::new(username.expose()),
            );
        }
        if let Some(password) = existing_secret.credentials.get("password") {
            temp_credentials.insert(
                "password".to_string(),
                crate::secrets::models::SecureString::new(password.expose()),
            );
        }

        let temp_secret_metadata = crate::secrets::models::SecretMetadata {
            id: existing_secret.metadata.id,
            name: secret_name.clone(),
            secret_type,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_used: None,
            tags: vec![],
            description: Some("Temporary secret for connection testing".to_string()),
            scope: None,
        };

        let temp_secret_credentials = crate::secrets::models::SecretCredentials {
            metadata: temp_secret_metadata,
            credentials: temp_credentials,
        };

        // Create the secret injector and build the CREATE SECRET SQL
        let injector = crate::secrets::injector::DuckDBSecretInjector::new();
        let create_secret_sql = match injector.build_create_secret(&temp_secret_credentials) {
            Ok(sql) => sql,
            Err(e) => {
                tracing::warn!(
                    "[Connections] Failed to build {} secret SQL: {}",
                    db_type,
                    e
                );
                return Err(ConnectionError::ConnectionTestFailed {
                    error: format!("Failed to create {} secret: {}", db_type, e),
                });
            }
        };

        // Execute the CREATE SECRET command
        if let Err(e) = duckdb_conn.execute(&create_secret_sql, []) {
            tracing::warn!("[Connections] Failed to execute CREATE SECRET: {}", e);
            return Err(ConnectionError::ConnectionTestFailed {
                error: format!("Failed to create {} secret: {}", db_type, e),
            });
        }

        // Use ATTACH with the secret and connection parameters
        let attach_query = format!(
            "ATTACH {} AS {} (TYPE {}, SECRET {})",
            escape_string_literal(&connection_string),
            test_alias,
            db_type,
            secret_name
        );

        match duckdb_conn.execute(&attach_query, []) {
            Ok(_) => {
                // Test connectivity with a simple query
                let test_query = format!(
                    "SELECT 1 FROM {}.information_schema.tables LIMIT 1",
                    test_alias
                );
                match duckdb_conn.execute(&test_query, []) {
                    Ok(_) => {
                        // Clean up: detach the database and drop the secret
                        let _ = duckdb_conn.execute(&format!("DETACH {}", test_alias), []);
                        let _ = duckdb_conn.execute(&format!("DROP SECRET {}", secret_name), []);
                        tracing::info!("[Connections] {} connection test successful", db_type);
                        Ok(true)
                    }
                    Err(e) => {
                        let _ = duckdb_conn.execute(&format!("DETACH {}", test_alias), []);
                        let _ = duckdb_conn.execute(&format!("DROP SECRET {}", secret_name), []);
                        tracing::warn!("[Connections] {} query test failed: {}", db_type, e);
                        Err(ConnectionError::ConnectionTestFailed {
                            error: format!("Database query failed: {}", e),
                        })
                    }
                }
            }
            Err(e) => {
                // Clean up the secret even if attach failed
                let _ = duckdb_conn.execute(&format!("DROP SECRET {}", secret_name), []);
                tracing::warn!("[Connections] {} attach failed: {}", db_type, e);
                Err(ConnectionError::ConnectionTestFailed {
                    error: format!("Failed to connect to {}: {}", db_type, e),
                })
            }
        }
    }

    async fn test_postgres_connection(
        &self,
        connection: &ConnectionWithCredentials,
    ) -> Result<bool, ConnectionError> {
        self.test_remote_db_connection(
            connection,
            "POSTGRES",
            "postgres",
            crate::secrets::models::SecretType::Postgres,
        )
        .await
    }

    async fn test_mysql_connection(
        &self,
        connection: &ConnectionWithCredentials,
    ) -> Result<bool, ConnectionError> {
        self.test_remote_db_connection(
            connection,
            "MYSQL",
            "mysql",
            crate::secrets::models::SecretType::MySQL,
        )
        .await
    }

    async fn update_last_used(&self, connection_id: Uuid) -> Result<(), ConnectionError> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "UPDATE connections SET last_used = ?1 WHERE id = ?2",
            [Utc::now().to_rfc3339(), connection_id.to_string()],
        )?;

        Ok(())
    }

    fn extract_username(&self, secret: &SecretCredentials) -> Result<String, ConnectionError> {
        secret
            .credentials
            .get("username")
            .or_else(|| secret.credentials.get("user"))
            .map(|s| s.expose().to_string())
            .ok_or_else(|| ConnectionError::MissingRequiredField {
                field: "username".to_string(),
            })
    }

    fn extract_password(&self, secret: &SecretCredentials) -> Result<String, ConnectionError> {
        secret
            .credentials
            .get("password")
            .map(|s| s.expose().to_string())
            .ok_or_else(|| ConnectionError::MissingRequiredField {
                field: "password".to_string(),
            })
    }

    fn row_to_connection_config(&self, row: &rusqlite::Row) -> rusqlite::Result<ConnectionConfig> {
        let options_json: Option<String> = row.get("options")?;
        let options = options_json
            .map(|json| serde_json::from_str(&json))
            .transpose()
            .map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;

        let tags_json: String = row.get("tags")?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?;

        let connection_type_str: String = row.get("connection_type")?;
        let connection_type =
            ConnectionType::from_string(&connection_type_str).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Invalid connection type",
                    )),
                )
            })?;

        let ssl_mode_str: Option<String> = row.get("ssl_mode")?;
        let ssl_mode = match ssl_mode_str {
            Some(s) => Some(super::models::SslMode::from_string(&s).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Invalid SSL mode",
                    )),
                )
            })?),
            None => None,
        };

        let created_at_str: String = row.get("created_at")?;
        let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
            .map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?
            .with_timezone(&chrono::Utc);

        let updated_at_str: String = row.get("updated_at")?;
        let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_at_str)
            .map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?
            .with_timezone(&chrono::Utc);

        let last_used_str: Option<String> = row.get("last_used")?;
        let last_used = last_used_str
            .map(|s| chrono::DateTime::parse_from_rfc3339(&s))
            .transpose()
            .map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?
            .map(|dt| dt.with_timezone(&chrono::Utc));

        let read_only_int: Option<i64> = row.get("read_only")?;
        let read_only = read_only_int.map(|i| i != 0);

        // FIX: Validate port number range (0-65535) to prevent silent truncation
        let port_i64 = row.get::<_, i64>("port")?;
        let port = u16::try_from(port_i64).map_err(|_| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Integer,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Port {} out of valid range 0-65535", port_i64),
                )),
            )
        })?;

        // FIX: Validate timeout values to prevent silent truncation
        let connect_timeout = row
            .get::<_, Option<i64>>("connect_timeout")?
            .map(|i| {
                u32::try_from(i).map_err(|_| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Integer,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!("connect_timeout {} out of valid range", i),
                        )),
                    )
                })
            })
            .transpose()?;

        let query_timeout = row
            .get::<_, Option<i64>>("query_timeout")?
            .map(|i| {
                u32::try_from(i).map_err(|_| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Integer,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!("query_timeout {} out of valid range", i),
                        )),
                    )
                })
            })
            .transpose()?;

        let max_connections = row
            .get::<_, Option<i64>>("max_connections")?
            .map(|i| {
                u32::try_from(i).map_err(|_| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Integer,
                        Box::new(std::io::Error::new(
                            std::io::ErrorKind::InvalidData,
                            format!("max_connections {} out of valid range", i),
                        )),
                    )
                })
            })
            .transpose()?;

        Ok(ConnectionConfig {
            id: Uuid::parse_str(&row.get::<_, String>("id")?).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?,
            name: row.get("name")?,
            connection_type,
            host: row.get("host")?,
            port,
            database: row.get("database_name")?,
            secret_id: Uuid::parse_str(&row.get::<_, String>("secret_id")?).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?,
            read_only,
            ssl_mode,
            connect_timeout,
            query_timeout,
            max_connections,
            schema: row.get("schema_name")?,
            options,
            created_at,
            updated_at,
            last_used,
            tags,
            description: row.get("description")?,
        })
    }

    pub async fn register_motherduck_attachment(
        &self,
        database_url: String,
        secret_id: Option<Uuid>,
    ) -> Result<(), ConnectionError> {
        tracing::info!(
            "[Connections] Registering MotherDuck attachment: url={}",
            database_url
        );

        if let Some(secret_id) = secret_id {
            tracing::info!(
                "[Connections] Applying MotherDuck secret {} before attachment",
                secret_id
            );
            self.apply_motherduck_secret(secret_id).await?;
            tracing::debug!(
                "[Connections] MotherDuck secret {} applied successfully",
                secret_id
            );
        } else {
            tracing::debug!(
                "[Connections] register_motherduck_attachment called without secret_id (cached token present: {})",
                motherduck_token::has_token()
            );
        }

        if let Err(err) = validate_motherduck_url(&database_url) {
            return Err(ConnectionError::ConnectionTestFailed {
                error: err.to_string(),
            });
        }

        // Check if DuckDB engine is available
        let engine = self
            .duckdb_engine
            .as_ref()
            .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                error: "DuckDB engine not initialized".to_string(),
            })?;

        tracing::info!(
            "[Connections] MotherDuck token cached in backend: {}",
            motherduck_token::has_token()
        );

        // Extract database name from URL (md:database_name)
        let db_name = if database_url.starts_with("md:") {
            database_url[3..].to_string()
        } else {
            return Err(ConnectionError::ConnectionTestFailed {
                error: "Invalid MotherDuck URL format".to_string(),
            });
        };

        // MotherDuck doesn't use secrets
        // IMPORTANT: Apply the attachment to all existing connections
        // This ensures MotherDuck databases appear in duckdb_databases across all connections
        engine
            .attach_motherduck_to_all_connections(database_url.clone())
            .await
            .map_err(|e| ConnectionError::ConnectionTestFailed {
                error: format!("Failed to attach MotherDuck database: {}", e),
            })?;

        // Register with the pool for re-attachment on new connections
        // MotherDuck doesn't need a secret, so we pass empty string for secret_sql
        engine
            .register_database_attachment(
                db_name.clone(),
                database_url.clone(),
                "MOTHERDUCK".to_string(),
                String::new(), // No secret SQL for MotherDuck
            )
            .await;

        tracing::info!(
            "[Connections] Attached and registered MotherDuck database '{}' for all connections",
            db_name
        );

        Ok(())
    }

    pub async fn attach_remote_database(
        &self,
        connection_id: Uuid,
        database_alias: String,
    ) -> Result<(), ConnectionError> {
        tracing::info!(
            "[Connections] Attaching remote database: connection_id={}, alias={}",
            connection_id,
            database_alias
        );

        // Check if DuckDB engine is available
        let engine =
            self.duckdb_engine
                .as_ref()
                .ok_or_else(|| ConnectionError::ConnectionTestFailed {
                    error: "DuckDB engine not initialized".to_string(),
                })?;

        // Get the connection configuration
        let connection_config = self.get_connection(connection_id).await?;

        // Get the secret credentials
        let secret_credentials = self
            .secrets_manager
            .get_secret(connection_config.secret_id)
            .await
            .map_err(|e| ConnectionError::SecretError(format!("Failed to get secret: {}", e)))?;

        // Validate that credentials exist
        if !secret_credentials.credentials.contains_key("username") {
            return Err(ConnectionError::ConnectionTestFailed {
                error: "Secret missing username".to_string(),
            });
        }

        if !secret_credentials.credentials.contains_key("password") {
            return Err(ConnectionError::ConnectionTestFailed {
                error: "Secret missing password".to_string(),
            });
        }

        // Get the secret name from the existing secret metadata
        let secret_name = format!(
            "secret_{}",
            secret_credentials.metadata.id.to_string().replace("-", "_")
        );

        // Create a temporary secret with only the authentication credentials from the existing secret
        let mut temp_credentials = std::collections::HashMap::new();
        if let Some(username) = secret_credentials.credentials.get("username") {
            temp_credentials.insert(
                "username".to_string(),
                crate::secrets::models::SecureString::new(username.expose()),
            );
        }
        if let Some(password) = secret_credentials.credentials.get("password") {
            temp_credentials.insert(
                "password".to_string(),
                crate::secrets::models::SecureString::new(password.expose()),
            );
        }

        let temp_secret_metadata = crate::secrets::models::SecretMetadata {
            id: secret_credentials.metadata.id, // Use the same ID as the existing secret
            name: secret_name.clone(),
            secret_type: match connection_config.connection_type {
                ConnectionType::Postgres => crate::secrets::models::SecretType::Postgres,
                ConnectionType::MySQL => crate::secrets::models::SecretType::MySQL,
            },
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_used: None,
            tags: vec![],
            description: Some("Temporary secret for remote database attachment".to_string()),
            scope: None,
        };

        let temp_secret_credentials = crate::secrets::models::SecretCredentials {
            metadata: temp_secret_metadata,
            credentials: temp_credentials,
        };

        // Create the secret injector and build the CREATE SECRET SQL (only with auth credentials)
        let injector = crate::secrets::injector::DuckDBSecretInjector::new();
        let create_secret_sql = match injector.build_create_secret(&temp_secret_credentials) {
            Ok(sql) => sql,
            Err(e) => {
                tracing::warn!("[Connections] Failed to build secret SQL: {}", e);
                return Err(ConnectionError::ConnectionTestFailed {
                    error: format!("Failed to create secret: {}", e),
                });
            }
        };

        // Build connection string with parameters (but NOT credentials or secret)
        let connection_string = match connection_config.connection_type {
            ConnectionType::Postgres => {
                let mut params = vec![
                    format!("host={}", connection_config.host),
                    format!("port={}", connection_config.port),
                    format!("dbname={}", connection_config.database),
                ];

                // Add SSL mode if specified
                if let Some(ssl_mode) = &connection_config.ssl_mode {
                    params.push(format!("sslmode={}", ssl_mode.to_string()));
                }

                params.join(" ")
            }
            ConnectionType::MySQL => vec![
                format!("host={}", connection_config.host),
                format!("port={}", connection_config.port),
                format!("database={}", connection_config.database),
            ]
            .join(" "),
        };

        // Use the DuckDB engine to attach the database with the secret
        let database_type = match connection_config.connection_type {
            ConnectionType::Postgres => "POSTGRES",
            ConnectionType::MySQL => "MYSQL",
        };

        engine
            .attach_remote_database(
                database_alias.clone(),
                connection_string,
                database_type.to_string(),
                create_secret_sql,
                secret_name,
            )
            .await
            .map_err(|e| ConnectionError::ConnectionTestFailed {
                error: format!("Failed to attach remote database: {}", e),
            })?;

        tracing::info!(
            "[Connections] Remote database attached successfully: {}",
            database_alias
        );

        // Update the last used timestamp for the connection
        self.update_last_used(connection_id).await?;

        Ok(())
    }
}
