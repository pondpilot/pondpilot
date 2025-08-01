use super::types::*;
use super::pool::ConnectionPool;
use crate::errors::Result;
use duckdb::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;
use std::collections::{HashMap, HashSet};
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
            let conn = pool.get()?;
            for ext in extensions {
                self.load_extension(&conn, &ext)?;
            }
        }
        Ok(())
    }

    pub async fn execute_query(&self, sql: &str, _params: Vec<serde_json::Value>) -> Result<QueryResult> {
        let start = Instant::now();
        
        // Log ATTACH queries for debugging (optional)
        // Removed space-in-path check as it's not a real DuckDB limitation
        
        // Clone necessary data for the blocking task
        let sql_owned = sql.to_string();
        let pool_clone = Arc::clone(&self.pool);
        
        // Run DuckDB operations in a blocking task with panic protection
        let result = tokio::task::spawn_blocking(move || {
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let pool = pool_clone.blocking_lock();
                let conn = pool.get()?;
                Self::execute_query_on_connection(conn, &sql_owned, start)
            }))
        }).await;
        
        match result {
            Ok(Ok(query_result)) => query_result,
            Ok(Err(panic_err)) => {
                let panic_msg = if let Some(s) = panic_err.downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = panic_err.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic occurred".to_string()
                };
                
                eprintln!("PANIC in DuckDB operation: {}", panic_msg);
                eprintln!("Query that caused panic: {}", sql);
                
                Err(crate::errors::DuckDBError::QueryError {
                    message: format!("DuckDB internal error (panic): {}. This might be due to database corruption or version incompatibility.", panic_msg),
                    sql: Some(sql.to_string()),
                }.into())
            }
            Err(join_err) => {
                Err(crate::errors::DuckDBError::QueryError {
                    message: format!("Task execution error: {}", join_err),
                    sql: Some(sql.to_string()),
                }.into())
            }
        }
    }
    
    fn execute_query_on_connection(mut conn: duckdb::Connection, sql: &str, start: Instant) -> Result<QueryResult> {
        
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
                            match Self::load_extension_static(&mut conn, extension_name) {
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
        let databases = self.get_databases().await?;
        Ok(CatalogInfo {
            current_database: "main".to_string(),
            databases,
        })
    }

    pub async fn get_databases(&self) -> Result<Vec<DatabaseInfo>> {
        let pool = self.pool.lock().await;
        let conn = pool.get()?;
        
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
        
        Ok(databases)
    }

    pub async fn get_tables(&self, database: &str) -> Result<Vec<TableInfo>> {
        let pool = self.pool.lock().await;
        let conn = pool.get()?;
        
        let query = "SELECT table_name, table_schema 
                     FROM information_schema.tables 
                     WHERE table_catalog = ?
                     AND table_type = 'BASE TABLE'";
        
        let mut stmt = conn.prepare(query)?;
        let mut tables = Vec::new();
        
        let mut rows = stmt.query([database])?;
        while let Some(row) = rows.next()? {
            tables.push(TableInfo {
                name: row.get(0)?,
                schema: row.get(1)?,
                row_count: None,
                estimated_size: None,
            });
        }
        
        Ok(tables)
    }

    pub async fn get_columns(&self, database: &str, table: &str) -> Result<Vec<ColumnInfo>> {
        let pool = self.pool.lock().await;
        let conn = pool.get()?;
        
        let query = "SELECT column_name, data_type, is_nullable 
                     FROM information_schema.columns 
                     WHERE table_catalog = ? 
                     AND table_name = ?";
        
        let mut stmt = conn.prepare(query)?;
        let mut columns = Vec::new();
        
        let mut rows = stmt.query([database, table])?;
        while let Some(row) = rows.next()? {
            columns.push(ColumnInfo {
                name: row.get(0)?,
                type_name: row.get(1)?,
                nullable: row.get::<_, String>(2)? == "YES",
            });
        }
        
        Ok(columns)
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

    fn load_extension(&self, conn: &Connection, name: &str) -> Result<()> {
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
}