use super::types::*;
use super::pool::ConnectionPool;
use crate::errors::Result;
use duckdb::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;
use std::collections::HashMap;
use std::path::PathBuf;

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

pub struct DuckDBEngine {
    pool: Arc<Mutex<ConnectionPool>>,
    registered_files: Arc<Mutex<HashMap<String, FileInfo>>>,
}

impl DuckDBEngine {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let pool = ConnectionPool::new(5, db_path)?;
        Ok(Self {
            pool: Arc::new(Mutex::new(pool)),
            registered_files: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn initialize(&self, config: EngineConfig) -> Result<()> {
        // Initialize with config if needed
        if let Some(extensions) = config.extensions {
            let pool = self.pool.lock().await;
            for ext in extensions {
                let ext_clone = ext.clone();
                pool.execute_with_retry(move |conn| {
                    Self::load_extension_static(conn, &ext_clone)
                }).await?;
            }
        }
        Ok(())
    }

    pub async fn execute_query(&self, sql: &str, _params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let start = Instant::now();
        let query_id = format!("Q{}", start.elapsed().as_nanos() % 100000);
        eprintln!("[QUERY-{}] ===== STARTING QUERY =====", query_id);
        eprintln!("[QUERY-{}] SQL: {}", query_id, sql.chars().take(200).collect::<String>());
        eprintln!("[QUERY-{}] Thread: {:?}", query_id, std::thread::current().id());
        
        // Check if this is a session-modifying statement
        let sql_upper = sql.trim().to_uppercase();
        let is_session_modifying = sql_upper.starts_with("ATTACH") || 
                                  sql_upper.starts_with("DETACH") || 
                                  sql_upper.starts_with("LOAD");
        
        if is_session_modifying {
            eprintln!("[QUERY-{}] Acquiring engine pool lock for session-modifying statement...", query_id);
            let pool = self.pool.lock().await;
            eprintln!("[QUERY-{}] Engine pool lock acquired after {:?}", query_id, start.elapsed());
            
            // Use special handling for session-modifying statements
            eprintln!("[QUERY-{}] Executing session-modifying statement", query_id);
            let result = pool.execute_session_modifying_statement(sql).await;
            eprintln!("[QUERY-{}] Session-modifying statement completed, releasing lock", query_id);
            drop(pool);
            eprintln!("[QUERY-{}] Engine pool lock released", query_id);
            
            result?;
            
            // Return empty result for these statements
            return Ok(QueryResult {
                row_count: 0,
                rows: vec![],
                columns: vec![],
                execution_time_ms: start.elapsed().as_millis() as u64,
            });
        }
        
        // For regular queries, use the pool's execute_with_retry method
        eprintln!("[QUERY-{}] Using connection pool for query execution...", query_id);
        
        let pool = self.pool.lock().await;
        eprintln!("[QUERY-{}] Engine pool lock acquired after {:?}", query_id, start.elapsed());
        
        // Clone necessary data for the blocking task
        let sql_owned = sql.to_string();
        let start_clone = start.clone();
        let query_id_clone = query_id.clone();
        
        eprintln!("[QUERY-{}] Executing query via pool...", query_id);
        let result = pool.execute_with_retry(move |conn| {
            eprintln!("[QUERY-{}] Inside execute_with_retry closure", query_id_clone);
            let res = Self::execute_query_on_connection_ref(conn, &sql_owned, start_clone);
            eprintln!("[QUERY-{}] Query execution completed with result: {}", query_id_clone, res.is_ok());
            res
        }).await;
        
        eprintln!("[QUERY-{}] execute_with_retry completed, releasing lock", query_id);
        drop(pool);
        eprintln!("[QUERY-{}] Engine pool lock released after {:?}", query_id, start.elapsed());
        eprintln!("[QUERY-{}] ===== QUERY COMPLETE =====", query_id);
        
        result
    }
    
    fn execute_query_on_connection(mut conn: duckdb::Connection, sql: &str, start: Instant) -> Result<QueryResult> {
        Self::execute_query_on_connection_ref(&mut conn, sql, start)
    }
    
    fn execute_query_on_connection_ref(conn: &mut duckdb::Connection, sql: &str, start: Instant) -> Result<QueryResult> {
        
        // For DML statements, execute and return affected rows
        if sql.trim_start().to_uppercase().starts_with("INSERT") 
            || sql.trim_start().to_uppercase().starts_with("UPDATE")
            || sql.trim_start().to_uppercase().starts_with("DELETE")
            || sql.trim_start().to_uppercase().starts_with("CREATE")
            || sql.trim_start().to_uppercase().starts_with("DROP")
            || sql.trim_start().to_uppercase().starts_with("ALTER")
            || sql.trim_start().to_uppercase().starts_with("ATTACH")
            || sql.trim_start().to_uppercase().starts_with("DETACH")
            || sql.trim_start().to_uppercase().starts_with("LOAD") {
            
            let affected = match conn.execute(sql, []) {
                Ok(count) => count,
                Err(e) => {
                    // Check if this is a LOAD command for an extension that needs to be installed
                    if sql.trim_start().to_uppercase().starts_with("LOAD") 
                        && e.to_string().contains("not found")
                        && e.to_string().contains("Install it first using") {
                        
                        // Extract extension name from the LOAD command
                        let parts: Vec<&str> = sql.trim().split_whitespace().collect();
                        if parts.len() >= 2 {
                            let extension_name = parts[1];
                            // Try to install and load the extension
                            match Self::load_extension_static(conn, extension_name) {
                                Ok(_) => {
                                    // Return success as the extension is now loaded
                                    return Ok(QueryResult {
                                        row_count: 0,
                                        rows: vec![],
                                        columns: vec![],
                                        execution_time_ms: start.elapsed().as_millis() as u64,
                                    });
                                },
                                Err(install_err) => {
                                    return Err(crate::errors::DuckDBError::QueryError {
                                        message: format!("Failed to load extension '{}': {}. Auto-install failed: {}", 
                                                       extension_name, e, install_err),
                                        sql: Some(sql.to_string()),
                                    }.into());
                                }
                            }
                        }
                    }
                    
                    return Err(crate::errors::DuckDBError::QueryError {
                        message: format!("Failed to execute query: {}", e),
                        sql: Some(sql.to_string()),
                    }.into());
                }
            };
            let execution_time_ms = start.elapsed().as_millis() as u64;
            
            return Ok(QueryResult {
                row_count: affected,
                rows: vec![],
                columns: vec![],
                execution_time_ms,
            });
        }
        
        // For SELECT queries
        let mut stmt = conn.prepare(sql)?;
        let mut columns = Vec::new();
        let mut rows = Vec::new();
        
        // Execute and collect results
        let mut result_rows = stmt.query([])?;
        
        // Get column names from the first row if available
        let mut has_columns = false;
        while let Some(row) = result_rows.next()? {
            if !has_columns {
                // Get column count from row
                let column_count = row.as_ref().column_count();
                for i in 0..column_count {
                    columns.push(ColumnInfo {
                        name: row.as_ref().column_name(i).unwrap_or(&format!("col{}", i)).to_string(),
                        type_name: "TEXT".to_string(), // Simplified for now
                        nullable: true,
                    });
                }
                has_columns = true;
            }
            
            let mut map = HashMap::new();
            for (i, col) in columns.iter().enumerate() {
                // Try to get value as different types
                let value = if let Ok(v) = row.get::<_, i64>(i) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.get::<_, f64>(i) {
                    serde_json::Number::from_f64(v)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
                } else if let Ok(v) = row.get::<_, String>(i) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.get::<_, bool>(i) {
                    serde_json::Value::Bool(v)
                } else {
                    serde_json::Value::Null
                };
                map.insert(col.name.clone(), value);
            }
            rows.push(map);
        }
        
        let execution_time_ms = start.elapsed().as_millis() as u64;
        
        Ok(QueryResult {
            row_count: rows.len(),
            rows,
            columns,
            execution_time_ms,
        })
    }

    pub async fn get_catalog(&self) -> Result<CatalogInfo> {
        eprintln!("[CATALOG] Getting catalog");
        let databases = self.get_databases().await?;
        eprintln!("[CATALOG] Catalog retrieved");
        Ok(CatalogInfo {
            current_database: "main".to_string(),
            databases,
        })
    }

    pub async fn get_databases(&self) -> Result<Vec<DatabaseInfo>> {
        let start = Instant::now();
        eprintln!("[DATABASES] Creating new connection for database listing...");
        
        let pool = self.pool.lock().await;
        eprintln!("[DATABASES] Engine pool lock acquired after {:?}", start.elapsed());
        
        let result = pool.execute_with_retry(|conn| {
            eprintln!("[DATABASES] Executing duckdb_databases() query");
            // Use duckdb_databases system table for consistency with web version
            let mut stmt = conn.prepare("SELECT database_name, path FROM duckdb_databases()")?;
            let mut databases = Vec::new();
            
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                databases.push(DatabaseInfo {
                    name: row.get(0)?,
                    path: row.get(1).ok(),
                });
            }
            eprintln!("[DATABASES] Query completed, found {} databases", databases.len());
            
            Ok(databases)
        }).await;
        
        eprintln!("[DATABASES] Releasing engine pool lock");
        drop(pool);
        eprintln!("[DATABASES] Engine pool lock released after {:?}", start.elapsed());
        
        result
    }

    pub async fn get_tables(&self, database: &str) -> Result<Vec<TableInfo>> {
        let start = Instant::now();
        eprintln!("[TABLES] Getting tables for database '{}'", database);
        
        // Get a new connection without holding the engine lock
        let conn = {
            eprintln!("[TABLES] Acquiring engine pool lock...");
            let pool = self.pool.lock().await;
            eprintln!("[TABLES] Engine pool lock acquired after {:?}", start.elapsed());
            let conn = pool.get()?;
            eprintln!("[TABLES] Connection created, releasing engine pool lock");
            drop(pool);
            eprintln!("[TABLES] Engine pool lock released");
            conn
        };
        
        let database_owned = database.to_string();
        
        // Execute query on separate connection
        let result = tokio::task::spawn_blocking(move || -> Result<Vec<TableInfo>> {
            eprintln!("[TABLES] Executing information_schema.tables query");
            let query = "SELECT table_name, table_schema 
                         FROM information_schema.tables 
                         WHERE table_catalog = ?
                         AND table_type = 'BASE TABLE'";
            
            let mut stmt = conn.prepare(query)?;
            let mut tables = Vec::new();
            
            let mut rows = stmt.query([&database_owned])?;
            while let Some(row) = rows.next()? {
                tables.push(TableInfo {
                    name: row.get(0)?,
                    schema: row.get(1)?,
                    row_count: None,
                    estimated_size: None,
                });
            }
            eprintln!("[TABLES] Query completed, found {} tables", tables.len());
            
            Ok(tables)
        }).await
            .map_err(|e| crate::errors::DuckDBError::QueryError {
                message: format!("Task execution error: {}", e),
                sql: Some("SELECT FROM information_schema.tables".to_string()),
            })??;
        
        eprintln!("[TABLES] Total time: {:?}", start.elapsed());
        
        Ok(result)
    }

    pub async fn get_columns(&self, database: &str, table: &str) -> Result<Vec<ColumnInfo>> {
        let start = Instant::now();
        eprintln!("[COLUMNS] Getting columns for table '{}.{}'", database, table);
        
        // Get a new connection without holding the engine lock
        let conn = {
            eprintln!("[COLUMNS] Acquiring engine pool lock...");
            let pool = self.pool.lock().await;
            eprintln!("[COLUMNS] Engine pool lock acquired after {:?}", start.elapsed());
            let conn = pool.get()?;
            eprintln!("[COLUMNS] Connection created, releasing engine pool lock");
            drop(pool);
            eprintln!("[COLUMNS] Engine pool lock released");
            conn
        };
        
        let database_owned = database.to_string();
        let table_owned = table.to_string();
        
        // Execute query on separate connection
        let result = tokio::task::spawn_blocking(move || -> Result<Vec<ColumnInfo>> {
            eprintln!("[COLUMNS] Executing information_schema.columns query");
            let query = "SELECT column_name, data_type, is_nullable 
                         FROM information_schema.columns 
                         WHERE table_catalog = ? 
                         AND table_name = ?";
            
            let mut stmt = conn.prepare(query)?;
            let mut columns = Vec::new();
            
            let mut rows = stmt.query([&database_owned, &table_owned])?;
            while let Some(row) = rows.next()? {
                columns.push(ColumnInfo {
                    name: row.get(0)?,
                    type_name: row.get(1)?,
                    nullable: row.get::<_, String>(2)? == "YES",
                });
            }
            eprintln!("[COLUMNS] Query completed, found {} columns", columns.len());
            
            Ok(columns)
        }).await
            .map_err(|e| crate::errors::DuckDBError::QueryError {
                message: format!("Task execution error: {}", e),
                sql: Some("SELECT FROM information_schema.columns".to_string()),
            })??;
        
        eprintln!("[COLUMNS] Total time: {:?}", start.elapsed());
        
        Ok(result)
    }

    pub async fn register_file(&self, options: FileRegistration) -> Result<()> {
        let mut files = self.registered_files.lock().await;
        
        if let Some(path) = &options.path {
            files.insert(
                options.name.clone(),
                FileInfo {
                    name: options.name,
                    path: path.clone(),
                    size: None,
                },
            );
        }
        
        Ok(())
    }

    pub async fn drop_file(&self, name: &str) -> Result<()> {
        let mut files = self.registered_files.lock().await;
        files.remove(name);
        Ok(())
    }

    pub async fn list_files(&self) -> Result<Vec<FileInfo>> {
        let files = self.registered_files.lock().await;
        Ok(files.values().cloned().collect())
    }

    pub async fn get_xlsx_sheet_names(&self, file_path: &str) -> Result<Vec<String>> {
        use calamine::{open_workbook_auto, Reader};
        
        // Use calamine to read sheet names efficiently
        match open_workbook_auto(file_path) {
            Ok(workbook) => {
                let sheet_names = workbook.sheet_names()
                    .into_iter()
                    .map(|s| s.to_string())
                    .collect();
                Ok(sheet_names)
            },
            Err(e) => {
                // Propagate the error instead of masking it
                Err(crate::errors::DuckDBError::QueryError {
                    message: format!("Failed to read Excel file: {}", e),
                    sql: None,
                })
            }
        }
    }

    
    fn load_extension_static(conn: &mut Connection, name: &str) -> Result<()> {
        // Validate extension name against whitelist
        let extension_name = name.trim().to_lowercase();
        if !ALLOWED_EXTENSIONS.contains(&extension_name.as_str()) {
            return Err(crate::errors::DuckDBError::UnsupportedExtension(
                format!("Extension '{}' is not in the allowed list", name)
            ));
        }
        
        // Use parameterized queries isn't supported for INSTALL/LOAD,
        // but we've validated the input against a whitelist
        conn.execute(&format!("INSTALL {}", extension_name), [])?;
        conn.execute(&format!("LOAD {}", extension_name), [])?;
        Ok(())
    }
    
    pub async fn get_streaming_semaphore(&self) -> Arc<tokio::sync::Semaphore> {
        let pool = self.pool.lock().await;
        pool.get_streaming_semaphore()
    }
    
    pub async fn create_streaming_connection(&self) -> Result<duckdb::Connection> {
        let pool = self.pool.lock().await;
        pool.create_streaming_connection().await
    }
    
    // Get both semaphore and create connection in one go to minimize lock time
    pub async fn prepare_streaming(&self) -> Result<(Arc<tokio::sync::Semaphore>, duckdb::Connection)> {
        let pool = self.pool.lock().await;
        let sem = pool.get_streaming_semaphore();
        // Get a pooled connection for streaming
        let conn = pool.get_pooled_connection().await?;
        Ok((sem, conn))
    }
    
    // Return a streaming connection to the pool
    pub async fn return_streaming_connection(&self, conn: duckdb::Connection) {
        eprintln!("[ENGINE] Returning streaming connection to pool");
        let pool = self.pool.lock().await;
        pool.return_connection(conn).await;
    }
}