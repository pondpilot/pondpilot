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
use std::path::PathBuf;
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
        let sql = format!("ATTACH DATABASE '{}' AS {}", path, name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn detach_database(&self, name: &str) -> Result<()> {
        let sql = format!("DETACH DATABASE {}", name);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn use_database(&self, database: &str) -> Result<()> {
        let sql = format!("USE {}", database);
        self.execute_and_collect(&sql).await?;
        Ok(())
    }

    pub async fn register_file(&self, options: FileRegistration) -> Result<()> {
        let sql = match options.file_type.as_str() {
            "csv" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_csv('{}', AUTO_DETECT=TRUE)",
                options.table_name, options.path
            ),
            "parquet" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_parquet('{}')",
                options.table_name, options.path
            ),
            "json" => format!(
                "CREATE OR REPLACE TABLE {} AS SELECT * FROM read_json_auto('{}')",
                options.table_name, options.path
            ),
            _ => return Err(crate::errors::DuckDBError::InvalidOperation {
                message: format!("Unsupported file type: {}", options.file_type),
            }),
        };

        self.execute_and_collect(&sql).await?;

        // Store file info
        let mut files = self.registered_files.lock().await;
        files.insert(options.table_name.clone(), FileInfo {
            name: options.table_name,
            path: options.path,
            size_bytes: 0, // TODO: Get actual file size
            last_modified: 0, // TODO: Get actual timestamp
            file_type: options.file_type,
        });

        Ok(())
    }

    pub async fn drop_file(&self, name: &str) -> Result<()> {
        let sql = format!("DROP TABLE IF EXISTS {}", name);
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

    pub async fn get_xlsx_sheet_names(&self, _file_path: &str) -> Result<Vec<String>> {
        // TODO: Implement XLSX sheet name extraction
        Ok(vec![])
    }
}