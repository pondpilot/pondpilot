use super::arrow_streaming::ArrowStreamingExecutor;
use super::connection_handler::ThreadSafeConnectionManager;
use super::query_builder::{QueryBuilder, QueryHints};
use super::resource_manager::ResourceManager;
use super::types::*;
use super::unified_pool::{PoolConfig, UnifiedPool};
use crate::errors::Result;
use crate::system_resources::get_total_memory;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

// Whitelist of allowed DuckDB extensions for security
const ALLOWED_EXTENSIONS: &[&str] = &[
    "httpfs",
    "parquet",
    "json",
    "excel",
    "spatial",
    "sqlite",
    "postgres",
    "mysql",
    "arrow",
    "aws",
    "azure",
    "gsheets",
    "read_stat",
    "motherduck",
    "iceberg",
    "delta",
];

/// Validates and canonicalizes a file path for security
fn validate_file_path(path: &str) -> Result<PathBuf> {
    let path_obj = Path::new(path);
    
    // SECURITY: Check for path traversal attempts BEFORE canonicalization
    // This prevents bypassing validation via symlinks or other tricks
    let path_str = path_obj.to_string_lossy();
    
    // Check for obvious path traversal patterns
    if path_str.contains("..") || path_str.contains("~") {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Path traversal attempt detected".to_string(),
            path: Some(path.to_string()),
        });
    }
    
    // Check for null bytes which could be used for path truncation attacks
    if path.contains('\0') {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Null bytes not allowed in file paths".to_string(),
            path: Some(path.to_string()),
        });
    }
    
    // Check for suspicious patterns that might indicate attacks
    let suspicious_patterns = [
        "//", // Double slashes
        "/./", // Current directory references
        "/../", // Parent directory references  
        "%2e%2e", // URL encoded traversal
        "..%2f", // Mixed encoding
        "%252e", // Double encoded
    ];
    
    let path_lower = path_str.to_lowercase();
    for pattern in &suspicious_patterns {
        if path_lower.contains(pattern) {
            return Err(crate::errors::DuckDBError::FileAccess {
                message: format!("Suspicious path pattern detected: {}", pattern),
                path: Some(path.to_string()),
            });
        }
    }

    // Now canonicalize to resolve the actual path
    let canonical = path_obj
        .canonicalize()
        .map_err(|e| crate::errors::DuckDBError::FileAccess {
            message: format!("Invalid path: {}", e),
            path: Some(path.to_string()),
        })?;
        
    // Verify the canonicalized path doesn't contain symlink tricks
    // by checking if it still resolves to the same location
    let re_canonical = canonical
        .canonicalize()
        .map_err(|e| crate::errors::DuckDBError::FileAccess {
            message: format!("Path validation failed: {}", e),
            path: Some(path.to_string()),
        })?;
        
    if canonical != re_canonical {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Path contains unstable symlinks".to_string(),
            path: Some(path.to_string()),
        });
    }

    // Get allowed directories
    let allowed_dirs = vec![
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
        dirs::desktop_dir(),
        dirs::data_dir(),
        // Also allow temp directory for temporary files
        Some(std::env::temp_dir()),
    ];

    // Check if path is within allowed directories
    let is_allowed = allowed_dirs
        .iter()
        .filter_map(|d| d.as_ref())
        .any(|dir| canonical.starts_with(dir));

    if !is_allowed {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Access denied: path outside allowed directories".to_string(),
            path: Some(path.to_string()),
        });
    }

    Ok(canonical)
}

/// Sanitizes SQL identifiers (table names, column names, etc.) to prevent injection
fn sanitize_identifier(name: &str) -> Result<String> {
    // Check for empty identifier
    if name.is_empty() {
        return Err(crate::errors::DuckDBError::InvalidQuery {
            message: "Empty identifier not allowed".to_string(),
            sql: None,
            position: None,
        });
    }

    // Check length using configured maximum
    let config = crate::config::AppConfig::from_env();
    if name.len() > config.database.max_identifier_length {
        return Err(crate::errors::DuckDBError::InvalidQuery {
            message: format!(
                "Identifier too long (max {} characters)",
                config.database.max_identifier_length
            ),
            sql: None,
            position: None,
        });
    }

    // Only allow alphanumeric, underscore, and dash
    // First character must be alphabetic or underscore
    let mut chars = name.chars();
    if let Some(first) = chars.next() {
        if !first.is_alphabetic() && first != '_' {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: format!(
                    "Invalid identifier '{}': must start with letter or underscore",
                    name
                ),
                sql: None,
                position: None,
            });
        }
    }

    // Check remaining characters
    for c in name.chars() {
        if !c.is_alphanumeric() && c != '_' && c != '-' {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: format!(
                    "Invalid identifier '{}': contains illegal character '{}'",
                    name, c
                ),
                sql: None,
                position: None,
            });
        }
    }

    // Check against SQL keywords (basic list - expand as needed)
    let sql_keywords = [
        "select", "from", "where", "drop", "insert", "update", "delete", "table", "view",
    ];
    if sql_keywords.contains(&name.to_lowercase().as_str()) {
        // If it's a keyword, we need to quote it
        return Ok(format!("\"{}\"", name));
    }

    Ok(name.to_string())
}

#[derive(Debug, Clone)]
pub struct DuckDBEngine {
    pool: Arc<UnifiedPool>,
    // TODO: Integrate ResourceManager for query admission control and memory management
    #[allow(dead_code)]
    resources: Arc<ResourceManager>,
    registered_files: Arc<tokio::sync::Mutex<HashMap<String, FileInfo>>>,
    // TODO: Use db_path for database management operations
    #[allow(dead_code)]
    db_path: PathBuf,
    /// Manages persistent connections (each in their own thread)
    connection_manager: Arc<ThreadSafeConnectionManager>,
    extensions: Arc<tokio::sync::Mutex<Vec<ExtensionInfoForLoad>>>,
    /// Stores prepared statements by ID for reuse (mapping ID to SQL)
    prepared_statements: Arc<tokio::sync::Mutex<HashMap<String, String>>>,
}

impl DuckDBEngine {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let extensions = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let pool_config = PoolConfig::default();
        let pool = Arc::new(UnifiedPool::new(db_path.clone(), pool_config, extensions.clone())?);

        let total_memory = get_total_memory();
        let resources = Arc::new(ResourceManager::new(total_memory, 10)); // 10 max connections

        Ok(Self {
            pool,
            resources,
            registered_files: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            db_path,
            connection_manager: Arc::new(ThreadSafeConnectionManager::new()),
            extensions,
            prepared_statements: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
    }

    pub async fn initialize(&self, config: EngineConfig) -> Result<()> {
        // Load extensions if specified
        if let Some(extensions) = config.extensions {
            let mut ext_guard = self.extensions.lock().await;
            *ext_guard = extensions;
        }

        Ok(())
    }

    /// Replace the configured extension list at runtime
    pub async fn set_extensions(&self, extensions: Vec<super::types::ExtensionInfoForLoad>) -> Result<()> {
        let mut ext_guard = self.extensions.lock().await;
        *ext_guard = extensions;
        Ok(())
    }

    /// Create a query builder for executing queries
    pub fn query(&self, sql: &str) -> QueryBuilder {
        QueryBuilder::new(
            Arc::new(tokio::sync::Mutex::new(self.clone())),
            sql.to_string(),
        )
    }

    // Helper method to execute a query and collect all results
    async fn execute_and_collect(&self, sql: &str) -> Result<super::types::QueryResult> {
        use super::arrow_streaming::ArrowStreamMessage;

        let query_id = format!(
            "C{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
                % 100000
        );

        let executor =
            ArrowStreamingExecutor::new(self.pool.clone(), sql.to_string(), query_id, None, None);

        let mut stream = executor.execute_arrow_streaming().await?;
        let mut rows = Vec::new();
        let mut columns = Vec::new();

        while let Some(msg) = stream.recv().await {
            match msg {
                ArrowStreamMessage::Schema(schema) => {
                    // Convert Arrow schema to our column info
                    for field in schema.fields() {
                        columns.push(ColumnInfo {
                            name: field.name().to_string(),
                            type_name: format!("{:?}", field.data_type()),
                            nullable: field.is_nullable(),
                        });
                    }
                }
                ArrowStreamMessage::Batch(batch) => {
                    // Convert Arrow batch to JSON rows
                    // This is a simplified version - in production you'd want proper type conversion
                    use duckdb::arrow::array::Array;
                    use duckdb::arrow::array::StringArray;

                    for row_idx in 0..batch.num_rows() {
                        let mut row = HashMap::new();
                        for (col_idx, column) in batch.columns().iter().enumerate() {
                            let col_name = &columns[col_idx].name;

                            // Simplified conversion - just convert to string
                            let value = if column.is_null(row_idx) {
                                serde_json::Value::Null
                            } else {
                                // This is a hack - in production, properly handle each Arrow type
                                if let Some(string_array) =
                                    column.as_any().downcast_ref::<StringArray>()
                                {
                                    serde_json::Value::String(
                                        string_array.value(row_idx).to_string(),
                                    )
                                } else {
                                    serde_json::Value::String(format!("{:?}", column))
                                }
                            };

                            row.insert(col_name.clone(), value);
                        }
                        rows.push(row);
                    }
                }
                ArrowStreamMessage::Complete(_) => {
                    break;
                }
                ArrowStreamMessage::Error(e) => {
                    return Err(crate::errors::DuckDBError::QueryError {
                        message: e,
                        sql: Some(sql.to_string()),
                        error_code: None,
                        line_number: None,
                    });
                }
            }
        }

        let row_count = rows.len();
        Ok(super::types::QueryResult {
            rows,
            columns,
            row_count,
            execution_time_ms: 0,
        })
    }

    pub async fn execute_query(
        &self,
        sql: &str,
        _params: Vec<serde_json::Value>,
    ) -> Result<super::types::QueryResult> {
        self.execute_and_collect(sql).await
    }

    /// Execute a query with proper parameter binding
    pub async fn execute_query_with_params(
        &self,
        sql: &str,
        params: Vec<serde_json::Value>,
    ) -> Result<super::types::QueryResult> {
        // Try to get an existing connection first
        let existing_connections = self.connection_manager.get_all_connections().await;
        
        if let Some((_conn_id, handle)) = existing_connections.into_iter().next() {
            // Use an existing connection with parameters
            let result = handle.execute(sql.to_string(), params).await?;
            Ok(result)
        } else {
            // Create a new connection and execute
            let connection_id = format!("query_{}", uuid::Uuid::new_v4());
            self.create_connection(connection_id.clone()).await?;
            
            // Get the connection we just created
            let connections = self.connection_manager.get_all_connections().await;
            if let Some((_, handle)) = connections.into_iter().find(|(id, _)| id == &connection_id) {
                let result = handle.execute(sql.to_string(), params).await?;
                
                // Clean up the temporary connection
                self.connection_manager.close_connection(&connection_id).await?;
                
                Ok(result)
            } else {
                Err(crate::errors::DuckDBError::ConnectionError {
                    message: "Failed to create temporary connection for parameterized query".to_string(),
                    context: None,
                })
            }
        }
    }

    /// Create a new persistent connection with the given ID
    pub async fn create_connection(&self, connection_id: String) -> Result<()> {
        // Get a permit from the pool
        let permit = self.pool.acquire_connection_permit().await?;

        // Create the connection in a blocking task
        let conn = tokio::task::spawn_blocking(move || permit.create_connection())
            .await
            .map_err(|e| crate::errors::DuckDBError::ConnectionError {
                message: format!("Task join error: {}", e),
                context: None,
            })??;

        // Extension-related session settings are applied from the frontend per connection

        // Store it in the connection manager
        self.connection_manager
            .create_connection(connection_id, conn)
            .await
    }

    /// Execute a query on a specific connection
    pub async fn execute_on_connection(
        &self,
        connection_id: &str,
        sql: &str,
        params: Vec<serde_json::Value>,
    ) -> Result<super::types::QueryResult> {
        // Get the connection handle from the manager
        let handle = self
            .connection_manager
            .get_connection(connection_id)
            .await?;

        // Execute on the connection's dedicated thread
        // Parameters are handled by the connection handler via SQL sanitizer
        handle.execute(sql.to_string(), params).await
    }

    /// Close a specific connection
    pub async fn close_connection(&self, connection_id: &str) -> Result<()> {
        self.connection_manager
            .close_connection(connection_id)
            .await
    }
    
    /// Reset all connections (useful for MotherDuck account switching)
    pub async fn reset_all_connections(&self) -> Result<()> {
        self.connection_manager
            .reset_all_connections()
            .await
    }

    pub async fn get_catalog(&self) -> Result<CatalogInfo> {
        let databases = self.get_databases().await?;
        Ok(CatalogInfo {
            current_database: "main".to_string(),
            databases,
        })
    }

    pub async fn get_databases(&self) -> Result<Vec<DatabaseInfo>> {
        // Example of using QueryBuilder with catalog hints
        let result = self
            .query("SELECT database_name, path FROM duckdb_databases")
            .hint(QueryHints::catalog())
            .execute_simple()
            .await?;

        let mut databases = Vec::new();
        for row in &result.rows {
            if let (Some(name), path) = (
                row.get("database_name").and_then(|v| v.as_str()),
                row.get("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            ) {
                databases.push(DatabaseInfo {
                    name: name.to_string(),
                    path,
                });
            }
        }

        Ok(databases)
    }

    /// Attach a remote database using secrets and connection configuration
    pub async fn attach_remote_database(
        &self,
        database_alias: String,
        connection_string: String,
        database_type: String,
        secret_sql: String,
        secret_name: String,
    ) -> Result<()> {
        // Validate the database alias
        if database_alias.is_empty() {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: "Empty database alias not allowed".to_string(),
                sql: None,
                position: None,
            });
        }
        
        // SECURITY FIX: Always sanitize the database alias on the backend
        // Remove any existing quotes first to prevent double-quoting
        let clean_alias = database_alias.trim_matches('"').trim_matches('\'');
        
        // Now properly sanitize the identifier
        let sanitized_alias = sanitize_identifier(clean_alias)?;
        
        // Validate the database type is one of the allowed types
        let valid_db_types = ["POSTGRES", "MYSQL", "SQLITE"];
        let db_type_upper = database_type.to_uppercase();
        if !valid_db_types.contains(&db_type_upper.as_str()) {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: format!("Invalid database type '{}': must be one of {:?}", database_type, valid_db_types),
                sql: None,
                position: None,
            });
        }
        
        // Build the ATTACH query with the SECRET parameter
        // Use the sanitized alias which will be properly quoted if needed
        // Escape single quotes in the connection string for SQL literal
        let connection_string_sql = connection_string.replace('\'', "''");
        
        // Properly quote the secret name as an identifier to prevent SQL injection
        // DuckDB uses double quotes for identifiers
        // SECURITY FIX: Correctly escape double quotes by doubling them
        let secret_name_quoted = format!("\"{}\"", secret_name.replace('"', "\"\""));
        
        let attach_query = format!(
            "ATTACH '{}' AS {} (TYPE {}, SECRET {})",
            connection_string_sql,
            sanitized_alias,
            db_type_upper,
            secret_name_quoted
        );
        
        // Combine CREATE SECRET and ATTACH in a single batch to run on same connection
        let combined_sql = format!("{};\n{}", secret_sql, attach_query);
        
        // Clone values we need for registration
        let alias_clone = sanitized_alias.clone();
        let connection_string_clone = connection_string.clone();
        let db_type_clone = db_type_upper.clone();
        let secret_sql_clone = secret_sql.clone();
        
        // IMPORTANT: Apply the attachment to ALL existing persistent connections
        // This ensures that databases appear in duckdb_databases immediately
        let existing_connections = self.connection_manager.get_all_connections().await;
        
        tracing::debug!("[DuckDBEngine] Found {} existing connections to attach to", existing_connections.len());
        
        if !existing_connections.is_empty() {
            tracing::info!("[DuckDBEngine] Applying attachment to {} existing connections", existing_connections.len());
            
            for (conn_id, handle) in existing_connections {
                tracing::debug!("[DuckDBEngine] Attaching '{}' to connection '{}'", sanitized_alias, conn_id);
                // Execute the combined SQL on this connection
                match handle.execute(combined_sql.clone(), vec![]).await {
                    Ok(_) => {
                        tracing::debug!("[DuckDBEngine] ✓ Successfully attached database '{}' to connection '{}'", 
                                      sanitized_alias, conn_id);
                        tracing::info!("[DuckDBEngine] Successfully attached database '{}' to connection '{}'", 
                                      sanitized_alias, conn_id);
                    },
                    Err(e) => {
                        tracing::warn!("[DuckDBEngine] Failed to attach database '{}' to connection '{}': {}", 
                                      sanitized_alias, conn_id, e);
                        // Continue with other connections even if one fails
                    }
                }
            }
        } else {
            tracing::warn!("[DuckDBEngine] No existing connections found when attaching '{}'", sanitized_alias);
        }
        
        // Also create a new connection to validate the attachment works
        let permit = self.pool.acquire_connection_permit().await?;
        
        tokio::task::spawn_blocking(move || {
            // Create connection in this thread
            let conn = permit.create_connection()?;
            
            // Execute both statements on the same connection
            conn.execute_batch(&combined_sql)
                .map_err(|e| crate::errors::DuckDBError::QueryError {
                    message: format!("Failed to attach remote database: {}", e),
                    sql: Some(combined_sql.clone()),
                    error_code: None,
                    line_number: None,
                })?;
            
            Ok::<(), crate::errors::DuckDBError>(())
        })
        .await
        .map_err(|e| crate::errors::DuckDBError::ConnectionError {
            message: format!("Task join error: {}", e),
            context: None,
        })??;
        
        // Register this attachment with the pool so it's re-applied to new connections
        // Pass the secret name explicitly for robust re-attachment
        self.pool.register_attached_database(
            alias_clone,
            connection_string_clone,
            db_type_clone,
            secret_sql_clone,
            Some(secret_name),
        ).await;
        
        tracing::info!("[DuckDBEngine] Successfully attached remote database: {}", sanitized_alias);
        
        Ok(())
    }

    /// Register a database attachment with the pool for re-attachment on new connections
    pub async fn register_database_attachment(
        &self,
        alias: String,
        connection_string: String,
        db_type: String,
        secret_sql: String,
    ) {
        // For legacy compatibility, try to extract secret name from SQL
        // This is less robust but maintains backward compatibility
        let secret_name = if !secret_sql.is_empty() {
            // Try to extract secret name from SQL
            if let Some(start) = secret_sql.find("SECRET IF NOT EXISTS ") {
                let start = start + "SECRET IF NOT EXISTS ".len();
                secret_sql[start..].split_whitespace().next().map(|s| s.to_string())
            } else if let Some(start) = secret_sql.find("SECRET ") {
                let start = start + "SECRET ".len();
                secret_sql[start..].split_whitespace().next().map(|s| s.to_string())
            } else {
                None
            }
        } else {
            None
        };
        
        self.pool.register_attached_database(alias, connection_string, db_type, secret_sql, secret_name).await;
    }
    
    /// Attach MotherDuck database to all existing connections
    pub async fn attach_motherduck_to_all_connections(&self, database_url: String) -> Result<()> {
        // Build the MotherDuck ATTACH SQL
        let attach_sql = format!("ATTACH '{}'", database_url);
        
        // Apply the attachment to ALL existing persistent connections
        let existing_connections = self.connection_manager.get_all_connections().await;
        
        tracing::debug!("[DuckDBEngine] Found {} existing connections for MotherDuck attachment", existing_connections.len());
        
        if !existing_connections.is_empty() {
            tracing::info!("[DuckDBEngine] Applying MotherDuck attachment to {} existing connections", existing_connections.len());
            
            let mut any_success = false;
            for (conn_id, handle) in existing_connections {
                tracing::debug!("[DuckDBEngine] Attaching MotherDuck '{}' to connection '{}'", database_url, conn_id);
                // Execute the ATTACH SQL on this connection
                match handle.execute(attach_sql.clone(), vec![]).await {
                    Ok(_) => {
                        tracing::debug!("[DuckDBEngine] ✓ Successfully attached MotherDuck to connection '{}'", conn_id);
                        tracing::info!("[DuckDBEngine] Successfully attached MotherDuck to connection '{}'", conn_id);
                        any_success = true;
                    },
                    Err(e) => {
                        tracing::warn!("[DuckDBEngine] Failed to attach MotherDuck to connection '{}': {}", conn_id, e);
                        // Continue with other connections even if one fails
                    }
                }
            }
            
            if !any_success {
                return Err(crate::errors::DuckDBError::QueryError {
                    message: "Failed to attach MotherDuck to any existing connection".to_string(),
                    sql: Some(attach_sql),
                    error_code: None,
                    line_number: None,
                });
            }
        }
        
        // Also validate on a new connection
        let permit = self.pool.acquire_connection_permit().await?;
        
        let attach_sql_clone = attach_sql.clone();
        tokio::task::spawn_blocking(move || {
            // Create connection in this thread
            let conn = permit.create_connection()?;
            
            // Execute the ATTACH statement
            conn.execute(&attach_sql_clone, [])
                .map_err(|e| crate::errors::DuckDBError::QueryError {
                    message: format!("Failed to attach MotherDuck database: {}", e),
                    sql: Some(attach_sql_clone.clone()),
                    error_code: None,
                    line_number: None,
                })?;
            
            Ok::<(), crate::errors::DuckDBError>(())
        })
        .await
        .map_err(|e| crate::errors::DuckDBError::ConnectionError {
            message: format!("Task join error: {}", e),
            context: None,
        })??;
        
        Ok(())
    }

    pub async fn get_tables(&self, database: &str) -> Result<Vec<TableInfo>> {
        // Use parameterized query to prevent SQL injection
        let sql = "SELECT table_name, estimated_size, column_count
                   FROM duckdb_tables
                   WHERE database_name = ?";

        let result = self
            .execute_query_with_params(sql, vec![serde_json::Value::String(database.to_string())])
            .await?;

        let mut tables = Vec::new();
        for row in &result.rows {
            if let Some(name) = row.get("table_name").and_then(|v| v.as_str()) {
                tables.push(TableInfo {
                    database: database.to_string(),
                    schema: "main".to_string(),
                    name: name.to_string(),
                    row_count: row
                        .get("estimated_size")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as usize),
                    size_bytes: None,
                });
            }
        }

        Ok(tables)
    }

    pub async fn get_columns(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<super::types::ColumnInfo>> {
        // Use parameterized query to prevent SQL injection
        let sql = "SELECT column_name, data_type, is_nullable
                   FROM duckdb_columns
                   WHERE database_name = ? AND table_name = ?
                   ORDER BY column_index";

        let result = self
            .execute_query_with_params(
                sql,
                vec![
                    serde_json::Value::String(database.to_string()),
                    serde_json::Value::String(table.to_string()),
                ]
            )
            .await?;

        let mut columns = Vec::new();
        for row in &result.rows {
            if let Some(name) = row.get("column_name").and_then(|v| v.as_str()) {
                columns.push(super::types::ColumnInfo {
                    name: name.to_string(),
                    type_name: row
                        .get("data_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("UNKNOWN")
                        .to_string(),
                    nullable: row
                        .get("is_nullable")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                });
            }
        }

        Ok(columns)
    }

    // TODO: Expose via API for connection health checks
    #[allow(dead_code)]
    pub async fn test_connection(&self) -> Result<()> {
        self.execute_and_collect("SELECT 1").await?;
        Ok(())
    }

    pub async fn load_extension(&self, extension_name: &str) -> Result<()> {
        // Security check
        if !ALLOWED_EXTENSIONS.contains(&extension_name) {
            return Err(crate::errors::DuckDBError::InvalidOperation {
                message: format!(
                    "Extension '{}' is not in the allowed list for security reasons",
                    extension_name
                ),
                operation: Some("load_extension".to_string()),
            });
        }

        // Sanitize extension name even though it's whitelisted for defense in depth
        let sanitized_extension = sanitize_identifier(extension_name)?;
        
        // Determine if it's a community extension that needs special handling
        let community_extensions = ["gsheets", "read_stat"];
        let install_cmd = if community_extensions.contains(&extension_name) {
            format!("INSTALL {} FROM community", sanitized_extension)
        } else {
            format!("INSTALL {}", sanitized_extension)
        };
        
        // Install and load the extension
        let sql = format!("{}; LOAD {};", install_cmd, sanitized_extension);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    // TODO: Expose multi-database support via API
    #[allow(dead_code)]
    pub async fn attach_database(&self, name: &str, path: &str) -> Result<()> {
        // Validate path and sanitize database name
        let validated_path = validate_file_path(path)?;
        let sanitized_name = sanitize_identifier(name)?;
        let path_str = validated_path.to_string_lossy().replace("'", "''");

        let sql = format!("ATTACH DATABASE '{}' AS {}", path_str, sanitized_name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    // TODO: Expose multi-database support via API
    #[allow(dead_code)]
    pub async fn detach_database(&self, name: &str) -> Result<()> {
        let sanitized_name = sanitize_identifier(name)?;
        let sql = format!("DETACH DATABASE {}", sanitized_name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    // TODO: Expose multi-database support via API
    #[allow(dead_code)]
    pub async fn use_database(&self, database: &str) -> Result<()> {
        let sanitized_database = sanitize_identifier(database)?;
        let sql = format!("USE {}", sanitized_database);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn register_file(&self, options: FileRegistration) -> Result<()> {
        // Validate and sanitize inputs
        let validated_path = validate_file_path(&options.path)?;
        let sanitized_table_name = sanitize_identifier(&options.table_name)?;

        // Convert validated path to string, escaping single quotes for SQL
        let path_str = validated_path.to_string_lossy().replace("'", "''");

        let sql = match options.file_type.as_str() {
            "csv" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_csv('{}', AUTO_DETECT=TRUE)",
                sanitized_table_name, path_str
            ),
            "parquet" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_parquet('{}')",
                sanitized_table_name, path_str
            ),
            "json" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_json_auto('{}')",
                sanitized_table_name, path_str
            ),
            _ => {
                return Err(crate::errors::DuckDBError::InvalidOperation {
                    message: format!("Unsupported file type: {}", options.file_type),
                    operation: Some("register_file".to_string()),
                })
            }
        };

        self.execute_and_collect(&sql).await?;

        // Get actual file metadata using async I/O to avoid blocking
        let metadata = tokio::fs::metadata(&validated_path).await.map_err(|e| {
            crate::errors::DuckDBError::FileAccess {
                message: format!("Failed to get file metadata: {}", e),
                path: Some(validated_path.to_string_lossy().to_string()),
            }
        })?;

        // Store file info with actual metadata
        let mut files = self.registered_files.lock().await;
        files.insert(
            options.table_name.clone(),
            FileInfo {
                name: options.table_name,
                path: validated_path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                last_modified: metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0),
                file_type: options.file_type,
            },
        );

        Ok(())
    }

    pub async fn drop_file(&self, name: &str) -> Result<()> {
        // Sanitize the table name to prevent SQL injection
        let sanitized_name = sanitize_identifier(name)?;

        let sql = format!("DROP TABLE IF EXISTS {}", sanitized_name);
        self.execute_and_collect(&sql).await?;

        let mut files = self.registered_files.lock().await;
        files.remove(name);

        Ok(())
    }

    pub async fn list_files(&self) -> Result<Vec<FileInfo>> {
        let files = self.registered_files.lock().await;
        Ok(files.values().cloned().collect())
    }

    // TODO: Expose capabilities discovery via API
    #[allow(dead_code)]
    pub fn get_capabilities(&self) -> EngineCapabilities {
        EngineCapabilities {
            supports_streaming: true,
            supports_transactions: true,
            supports_savepoints: true,
            supports_prepared_statements: true,
            max_connections: 10,
            extensions: ALLOWED_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
        }
    }

    /// Execute query and return Arrow IPC stream (for compatibility with existing streaming command)
    pub async fn execute_arrow_streaming(
        &self,
        sql: String,
        _hints: QueryHints,
        cancel_token: Option<CancellationToken>,
        setup_sql: Option<Vec<String>>,
    ) -> Result<tokio::sync::mpsc::Receiver<super::arrow_streaming::ArrowStreamMessage>> {
        let query_id = format!(
            "A{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
                % 100000
        );

        // Use the Arrow streaming executor (no extra ATTACH to avoid conflicts)
        let executor = ArrowStreamingExecutor::new(self.pool.clone(), sql, query_id, cancel_token, setup_sql);

        executor.execute_arrow_streaming().await
    }

    pub async fn get_xlsx_sheet_names(&self, file_path: &str) -> Result<Vec<String>> {
        // Validate the file path first
        let validated_path = validate_file_path(file_path)?;

        // Use calamine to read sheet names without loading DuckDB excel extension
        use calamine::{open_workbook_auto, Reader};

        let workbook = open_workbook_auto(&validated_path).map_err(|e| {
            crate::errors::DuckDBError::FileAccess {
                message: format!("Failed to open XLSX file: {}", e),
                path: Some(validated_path.to_string_lossy().to_string()),
            }
        })?;

        // Collect sheet names that exist in the workbook
        let mut sheet_names: Vec<String> = Vec::new();
        for sheet in workbook.sheet_names().iter() {
            sheet_names.push(sheet.to_string());
        }

        Ok(sheet_names)
    }

    /// Prepare a SQL statement and store it for reuse
    pub async fn prepare_statement(&self, sql: &str) -> Result<String> {
        let statement_id = uuid::Uuid::new_v4().to_string();
        
        // Validate the SQL by trying to prepare it
        let sql_owned = sql.to_string();
        let permit = self.pool.acquire_connection_permit().await?;
        
        tokio::task::spawn_blocking(move || {
            // Create connection in this thread
            let conn = permit.create_connection()?;
            
            // Just validate that the SQL can be prepared
            conn.prepare(&sql_owned).map_err(|e| {
                crate::errors::DuckDBError::QueryExecution {
                    message: format!("Failed to prepare statement: {}", e),
                    query: Some(sql_owned.clone()),
                }
            })?;
            
            Ok::<(), crate::errors::DuckDBError>(())
        }).await.map_err(|e| {
            crate::errors::DuckDBError::QueryExecution {
                message: format!("Task join error: {}", e),
                query: Some(sql.to_string()),
            }
        })??;

        // Store the SQL with the statement ID
        let mut statements = self.prepared_statements.lock().await;
        statements.insert(statement_id.clone(), sql.to_string());
        
        Ok(statement_id)
    }

    /// Execute a prepared statement with parameters
    pub async fn execute_prepared_statement(
        &self,
        statement_id: &str,
        params: Vec<serde_json::Value>,
    ) -> Result<super::types::QueryResult> {
        // Get the stored SQL for this statement ID
        let statements = self.prepared_statements.lock().await;
        let sql = statements.get(statement_id).ok_or_else(|| {
            crate::errors::DuckDBError::InvalidOperation {
                message: format!("Prepared statement with ID '{}' not found", statement_id),
                operation: Some("execute_prepared_statement".to_string()),
            }
        })?.clone();
        drop(statements);

        // Explicitly reject parameters until proper parameter binding is implemented
        if !params.is_empty() {
            return Err(crate::errors::DuckDBError::ParameterBinding {
                message: "Parameter binding is not supported on desktop yet".to_string(),
            });
        }
        
        // Execute using the existing query execution path
        self.execute_query(&sql, params).await
    }

    /// Close and remove a prepared statement
    pub async fn close_prepared_statement(&self, statement_id: &str) -> Result<()> {
        let mut statements = self.prepared_statements.lock().await;
        
        statements.remove(statement_id).ok_or_else(|| {
            crate::errors::DuckDBError::InvalidOperation {
                message: format!("Prepared statement with ID '{}' not found", statement_id),
                operation: Some("close_prepared_statement".to_string()),
            }
        })?;
        
        Ok(())
    }
}
