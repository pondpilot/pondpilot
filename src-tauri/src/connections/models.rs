use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Supported database connection types for external database integration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum ConnectionType {
    /// PostgreSQL database connection
    Postgres,
    /// MySQL database connection  
    MySQL,
}

impl ConnectionType {
    /// Convert the connection type to its string representation
    pub fn to_string(&self) -> String {
        match self {
            ConnectionType::Postgres => "postgres",
            ConnectionType::MySQL => "mysql",
        }
        .to_string()
    }

    /// Parse a connection type from its string representation
    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "postgres" | "postgresql" => Some(ConnectionType::Postgres),
            "mysql" => Some(ConnectionType::MySQL),
            _ => None,
        }
    }
}

/// SSL connection modes for secure database connections
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SslMode {
    /// Disable SSL/TLS encryption
    Disable,
    /// Allow SSL/TLS if available, fallback to plain connection
    Allow,
    /// Prefer SSL/TLS but allow plain connection if SSL fails
    Prefer,
    /// Require SSL/TLS, fail if not available
    Require,
    /// Require SSL/TLS and verify the server certificate against CA
    VerifyCa,
    /// Require SSL/TLS, verify CA and server hostname
    VerifyFull,
}

impl SslMode {
    pub fn to_string(&self) -> String {
        match self {
            SslMode::Disable => "disable",
            SslMode::Allow => "allow",
            SslMode::Prefer => "prefer",
            SslMode::Require => "require",
            SslMode::VerifyCa => "verify-ca",
            SslMode::VerifyFull => "verify-full",
        }
        .to_string()
    }

    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "disable" => Some(SslMode::Disable),
            "allow" => Some(SslMode::Allow),
            "prefer" => Some(SslMode::Prefer),
            "require" => Some(SslMode::Require),
            "verify-ca" => Some(SslMode::VerifyCa),
            "verify-full" => Some(SslMode::VerifyFull),
            _ => None,
        }
    }
}

/// Configuration for testing database connections before saving them
/// Used to validate connection parameters without persisting the connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestConfig {
    pub name: String,
    pub connection_type: ConnectionType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub read_only: Option<bool>,
    pub ssl_mode: Option<SslMode>,
    pub connect_timeout: Option<u32>,
    pub query_timeout: Option<u32>,
    pub max_connections: Option<u32>,
    pub schema: Option<String>,
    pub options: Option<std::collections::HashMap<String, String>>,
}

/// Complete configuration for a saved database connection
/// Contains all metadata and connection parameters needed to connect to an external database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: Uuid,
    pub name: String,
    pub connection_type: ConnectionType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub secret_id: Uuid,
    pub read_only: Option<bool>,
    pub ssl_mode: Option<SslMode>,
    pub connect_timeout: Option<u32>,
    pub query_timeout: Option<u32>,
    pub max_connections: Option<u32>,
    pub schema: Option<String>,
    pub options: Option<std::collections::HashMap<String, String>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub description: Option<String>,
}

impl ConnectionTestConfig {
    pub fn validate(&self) -> Result<(), super::errors::ConnectionError> {
        if self.name.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "name".to_string(),
            });
        }

        if self.host.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "host".to_string(),
            });
        }

        // Validate host format - basic security check
        let host = self.host.trim();
        if host.contains('\0') || host.contains('\n') || host.contains('\r') {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Host contains invalid characters".to_string(),
            });
        }

        if self.database.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "database".to_string(),
            });
        }

        if self.port == 0 {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Port must be greater than 0".to_string(),
            });
        }

        // Port validation - u16 already ensures it's <= 65535

        // Validate database name format - basic security check
        let database = self.database.trim();
        if database.contains('\0') || database.contains('\n') || database.contains('\r') {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Database name contains invalid characters".to_string(),
            });
        }

        Ok(())
    }

    pub fn to_connection_config(&self, secret_id: Uuid) -> ConnectionConfig {
        let now = Utc::now();
        ConnectionConfig {
            id: Uuid::new_v4(),
            name: self.name.clone(),
            connection_type: self.connection_type,
            host: self.host.clone(),
            port: self.port,
            database: self.database.clone(),
            secret_id,
            read_only: self.read_only,
            ssl_mode: self.ssl_mode,
            connect_timeout: self.connect_timeout,
            query_timeout: self.query_timeout,
            max_connections: self.max_connections,
            schema: self.schema.clone(),
            options: self.options.clone(),
            created_at: now,
            updated_at: now,
            last_used: None,
            tags: vec![],
            description: None,
        }
    }
}

impl ConnectionConfig {
    /// Create a new connection configuration with default values
    pub fn new(
        name: String,
        connection_type: ConnectionType,
        host: String,
        port: u16,
        database: String,
        secret_id: Uuid,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            connection_type,
            host,
            port,
            database,
            secret_id,
            read_only: None,
            ssl_mode: None,
            connect_timeout: None,
            query_timeout: None,
            max_connections: None,
            schema: None,
            options: None,
            created_at: now,
            updated_at: now,
            last_used: None,
            tags: Vec::new(),
            description: None,
        }
    }

    pub fn validate(&self) -> Result<(), super::errors::ConnectionError> {
        if self.name.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "name".to_string(),
            });
        }

        if self.host.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "host".to_string(),
            });
        }

        // Validate host format - basic security check
        let host = self.host.trim();
        if host.contains('\0') || host.contains('\n') || host.contains('\r') {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Host contains invalid characters".to_string(),
            });
        }

        if self.database.trim().is_empty() {
            return Err(super::errors::ConnectionError::MissingRequiredField {
                field: "database".to_string(),
            });
        }

        if self.port == 0 {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Port must be greater than 0".to_string(),
            });
        }

        // Port validation - u16 already ensures it's <= 65535

        // Validate database name format - basic security check
        let database = self.database.trim();
        if database.contains('\0') || database.contains('\n') || database.contains('\r') {
            return Err(super::errors::ConnectionError::InvalidConfiguration {
                error: "Database name contains invalid characters".to_string(),
            });
        }

        Ok(())
    }

    pub fn get_connection_string_template(&self) -> String {
        match self.connection_type {
            ConnectionType::Postgres => {
                let ssl_mode = self
                    .ssl_mode
                    .as_ref()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "prefer".to_string());

                let mut conn_str = format!(
                    "postgresql://{{username}}:{{password}}@{}:{}/{}?sslmode={}",
                    self.host, self.port, self.database, ssl_mode
                );

                if let Some(ref schema) = self.schema {
                    conn_str.push_str(&format!("&search_path={}", schema));
                }

                if let Some(timeout) = self.connect_timeout {
                    conn_str.push_str(&format!("&connect_timeout={}", timeout));
                }

                conn_str
            }
            ConnectionType::MySQL => {
                let mut conn_str = format!(
                    "mysql://{{username}}:{{password}}@{}:{}/{}",
                    self.host, self.port, self.database
                );

                if let Some(timeout) = self.connect_timeout {
                    conn_str.push_str(&format!("?connect_timeout={}", timeout));
                }

                conn_str
            }
        }
    }
}

/// A connection configuration combined with its associated credentials
/// Used when creating actual database connections with authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionWithCredentials {
    pub config: ConnectionConfig,
    pub username: String,
    pub password: String,
}

impl ConnectionWithCredentials {
    /// Generate a complete connection string with embedded credentials
    /// WARNING: Contains sensitive information, use carefully
    pub fn get_connection_string(&self) -> String {
        let template = self.config.get_connection_string_template();
        template
            .replace("{username}", &self.username)
            .replace("{password}", &self.password)
    }

    /// Generate a connection string with masked credentials for logging/display
    pub fn get_safe_connection_string(&self) -> String {
        let template = self.config.get_connection_string_template();
        template
            .replace("{username}", &self.username)
            .replace("{password}", "***")
    }
}
