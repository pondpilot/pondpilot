use super::types::*;
use super::pool::ConnectionPool;
use anyhow::Result;
use duckdb::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;
use std::collections::HashMap;
use std::path::PathBuf;

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
        let pool = self.pool.lock().await;
        let conn = pool.get()?;
        
        // For DML statements, execute and return affected rows
        if sql.trim_start().to_uppercase().starts_with("INSERT") 
            || sql.trim_start().to_uppercase().starts_with("UPDATE")
            || sql.trim_start().to_uppercase().starts_with("DELETE")
            || sql.trim_start().to_uppercase().starts_with("CREATE")
            || sql.trim_start().to_uppercase().starts_with("DROP")
            || sql.trim_start().to_uppercase().starts_with("ALTER") {
            
            let affected = conn.execute(sql, [])?;
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
        
        let query = format!(
            "SELECT table_name, table_schema 
             FROM information_schema.tables 
             WHERE table_catalog = '{}'
             AND table_type = 'BASE TABLE'",
            database
        );
        
        let mut stmt = conn.prepare(&query)?;
        let mut tables = Vec::new();
        
        let mut rows = stmt.query([])?;
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
        
        let query = format!(
            "SELECT column_name, data_type, is_nullable 
             FROM information_schema.columns 
             WHERE table_catalog = '{}' 
             AND table_name = '{}'",
            database, table
        );
        
        let mut stmt = conn.prepare(&query)?;
        let mut columns = Vec::new();
        
        let mut rows = stmt.query([])?;
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

    fn load_extension(&self, conn: &Connection, name: &str) -> Result<()> {
        conn.execute(&format!("INSTALL {}", name), [])?;
        conn.execute(&format!("LOAD {}", name), [])?;
        Ok(())
    }
}