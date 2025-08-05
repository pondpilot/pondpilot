use super::types::*;
use super::thread_safe_pool::{ThreadSafePool, PoolConfig};
use super::resource_manager::ResourceManager;
use super::query_builder::QueryHints;
use super::arrow_streaming::ArrowStreamingExecutor;
use crate::errors::Result;
use crate::system_resources::get_total_memory;
use std::sync::Arc;
use std::time::Instant;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
    "motherduck",
    "iceberg",
    "delta"
];

/// Validates and canonicalizes a file path for security
fn validate_file_path(path: &str) -> Result<PathBuf> {
    let path = Path::new(path);
    
    // Canonicalize to resolve symlinks and ../ components
    let canonical = path.canonicalize()
        .map_err(|e| crate::errors::DuckDBError::FileAccess {
            message: format!("Invalid path: {}", e),
        })?;
    
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
    let is_allowed = allowed_dirs.iter()
        .filter_map(|d| d.as_ref())
        .any(|dir| canonical.starts_with(dir));
    
    if !is_allowed {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Access denied: path outside allowed directories".to_string(),
        });
    }
    
    // Additional security checks
    if canonical.to_string_lossy().contains("..") {
        return Err(crate::errors::DuckDBError::FileAccess {
            message: "Path traversal detected".to_string(),
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
        });
    }
    
    // Check length
    if name.len() > 128 {
        return Err(crate::errors::DuckDBError::InvalidQuery {
            message: "Identifier too long (max 128 characters)".to_string(),
            sql: None,
        });
    }
    
    // Only allow alphanumeric, underscore, and dash
    // First character must be alphabetic or underscore
    let mut chars = name.chars();
    if let Some(first) = chars.next() {
        if !first.is_alphabetic() && first != '_' {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: format!("Invalid identifier '{}': must start with letter or underscore", name),
                sql: None,
            });
        }
    }
    
    // Check remaining characters
    for c in name.chars() {
        if !c.is_alphanumeric() && c != '_' && c != '-' {
            return Err(crate::errors::DuckDBError::InvalidQuery {
                message: format!("Invalid identifier '{}': contains illegal character '{}'", name, c),
                sql: None,
            });
        }
    }
    
    // Check against SQL keywords (basic list - expand as needed)
    let sql_keywords = ["select", "from", "where", "drop", "insert", "update", "delete", "table", "view"];
    if sql_keywords.contains(&name.to_lowercase().as_str()) {
        // If it's a keyword, we need to quote it
        return Ok(format!("\"{}\"", name));
    }
    
    Ok(name.to_string())
}

#[derive(Debug, Clone)]
pub struct DuckDBEngine {
    pool: Arc<ThreadSafePool>,
    resources: Arc<ResourceManager>,
    registered_files: Arc<tokio::sync::Mutex<HashMap<String, FileInfo>>>,
    db_path: PathBuf,
}

impl DuckDBEngine {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let pool_config = PoolConfig::default();
        let pool = Arc::new(ThreadSafePool::new(db_path.clone(), pool_config)?);
        
        let total_memory = get_total_memory();
        let resources = Arc::new(ResourceManager::new(total_memory, 10)); // 10 max connections
        
        Ok(Self {
            pool,
            resources,
            registered_files: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            db_path,
        })
    }

    pub async fn initialize(&self, config: EngineConfig) -> Result<()> {
        // Thread-safe pool doesn't need initialization
        
        // Load extensions if specified
        if let Some(extensions) = config.extensions {
            for ext in extensions {
                self.load_extension(&ext).await?;
            }
        }
        
        Ok(())
    }



    async fn execute_session_modifying_statement(&self, sql: &str) -> Result<()> {
        let sql_owned = sql.to_string();
        
        // Execute using the pool's helper method
        self.pool.execute_with_connection(move |conn| {
            eprintln!("[ENGINE_V2] Executing session-modifying SQL: {}", sql_owned);
            
            // Validate SQL
            if sql_owned.trim().is_empty() {
                return Err(crate::errors::DuckDBError::QueryError {
                    message: "Empty SQL query".to_string(),
                    sql: Some(sql_owned),
                });
            }
            
            conn.execute(&sql_owned, [])
                .map_err(|e| crate::errors::DuckDBError::QueryError {
                    message: format!("Failed to execute statement: {}", e),
                    sql: Some(sql_owned.clone()),
                })?;
                
            Ok(())
        }).await
    }


    // Helper method to execute a query and collect all results
    async fn execute_and_collect(&self, sql: &str) -> Result<super::types::QueryResult> {
        use super::arrow_streaming::ArrowStreamMessage;
        
        let query_id = format!("C{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() % 100000);
        
        let executor = ArrowStreamingExecutor::new(
            self.pool.clone(),
            sql.to_string(),
            query_id,
            None
        );
        
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
                                if let Some(string_array) = column.as_any().downcast_ref::<StringArray>() {
                                    serde_json::Value::String(string_array.value(row_idx).to_string())
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

    pub async fn execute_query(&self, sql: &str, _params: Vec<serde_json::Value>) -> Result<super::types::QueryResult> {
        self.execute_and_collect(sql).await
    }

    pub async fn get_catalog(&self) -> Result<CatalogInfo> {
        let databases = self.get_databases().await?;
        Ok(CatalogInfo {
            current_database: "main".to_string(),
            databases,
        })
    }

    pub async fn get_databases(&self) -> Result<Vec<DatabaseInfo>> {
        let result = self.execute_and_collect("SELECT database_name, path FROM duckdb_databases").await?;
        
        let mut databases = Vec::new();
        for row in &result.rows {
            if let (Some(name), path) = (
                row.get("database_name").and_then(|v| v.as_str()),
                row.get("path").and_then(|v| v.as_str()).map(|s| s.to_string())
            ) {
                databases.push(DatabaseInfo {
                    name: name.to_string(),
                    path,
                });
            }
        }
        
        Ok(databases)
    }

    pub async fn get_tables(&self, database: &str) -> Result<Vec<TableInfo>> {
        let sql = format!(
            "SELECT table_name, estimated_size, column_count 
             FROM duckdb_tables 
             WHERE database_name = '{}'",
            database
        );
        
        let result = self.execute_and_collect(&sql).await?;
        
        let mut tables = Vec::new();
        for row in &result.rows {
            if let Some(name) = row.get("table_name").and_then(|v| v.as_str()) {
                tables.push(TableInfo {
                    database: database.to_string(),
                    schema: "main".to_string(),
                    name: name.to_string(),
                    row_count: row.get("estimated_size").and_then(|v| v.as_i64()).map(|v| v as usize),
                    size_bytes: None,
                });
            }
        }
        
        Ok(tables)
    }

    pub async fn get_columns(&self, database: &str, table: &str) -> Result<Vec<super::types::ColumnInfo>> {
        let sql = format!(
            "SELECT column_name, data_type, is_nullable 
             FROM duckdb_columns 
             WHERE database_name = '{}' AND table_name = '{}'
             ORDER BY column_index",
            database, table
        );
        
        let result = self.execute_and_collect(&sql).await?;
        
        let mut columns = Vec::new();
        for row in &result.rows {
            if let Some(name) = row.get("column_name").and_then(|v| v.as_str()) {
                columns.push(super::types::ColumnInfo {
                    name: name.to_string(),
                    type_name: row.get("data_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("UNKNOWN")
                        .to_string(),
                    nullable: row.get("is_nullable")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true),
                });
            }
        }
        
        Ok(columns)
    }

    pub async fn test_connection(&self) -> Result<()> {
        self.execute_and_collect("SELECT 1").await?;
        Ok(())
    }

    pub async fn load_extension(&self, extension_name: &str) -> Result<()> {
        // Security check
        if !ALLOWED_EXTENSIONS.contains(&extension_name) {
            return Err(crate::errors::DuckDBError::InvalidOperation {
                message: format!("Extension '{}' is not in the allowed list for security reasons", extension_name),
            });
        }

        let sql = format!("INSTALL {}; LOAD {};", extension_name, extension_name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn attach_database(&self, name: &str, path: &str) -> Result<()> {
        // Validate path and sanitize database name
        let validated_path = validate_file_path(path)?;
        let sanitized_name = sanitize_identifier(name)?;
        let path_str = validated_path.to_string_lossy().replace("'", "''");
        
        let sql = format!("ATTACH DATABASE '{}' AS {}", path_str, sanitized_name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn detach_database(&self, name: &str) -> Result<()> {
        let sanitized_name = sanitize_identifier(name)?;
        let sql = format!("DETACH DATABASE {}", sanitized_name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

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
            _ => return Err(crate::errors::DuckDBError::InvalidOperation {
                message: format!("Unsupported file type: {}", options.file_type),
            }),
        };

        self.execute_and_collect(&sql).await?;

        // Get actual file metadata
        let metadata = std::fs::metadata(&validated_path)
            .map_err(|e| crate::errors::DuckDBError::FileAccess {
                message: format!("Failed to get file metadata: {}", e),
            })?;

        // Store file info with actual metadata
        let mut files = self.registered_files.lock().await;
        files.insert(options.table_name.clone(), FileInfo {
            name: options.table_name,
            path: validated_path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            last_modified: metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
            file_type: options.file_type,
        });

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
    ) -> Result<tokio::sync::mpsc::Receiver<super::arrow_streaming::ArrowStreamMessage>> {
        let query_id = format!("A{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() % 100000);
        
        // Use the Arrow streaming executor
        let executor = ArrowStreamingExecutor::new(
            self.pool.clone(),
            sql,
            query_id,
            cancel_token
        );
        
        executor.execute_arrow_streaming().await
    }

    pub async fn get_xlsx_sheet_names(&self, file_path: &str) -> Result<Vec<String>> {
        // Validate the file path first
        let _validated_path = validate_file_path(file_path)?;
        
        // TODO: Implement XLSX sheet name extraction
        Ok(vec![])
    }
}