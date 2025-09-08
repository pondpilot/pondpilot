use rusqlite::{Connection, params};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::path::PathBuf;

use super::models::{SecretMetadata, SecretType};
use super::errors::SecretError;

pub struct MetadataStore {
    conn: Arc<Mutex<Connection>>,
}

impl MetadataStore {
    pub fn new() -> Result<Self, SecretError> {
        let db_path = Self::get_db_path()?;
        let conn = Connection::open(db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS secret_metadata (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                secret_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_used TEXT,
                tags TEXT,
                description TEXT,
                scope TEXT
            )",
            [],
        )?;
        
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
    
    fn get_db_path() -> Result<PathBuf, SecretError> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| SecretError::DatabaseError("Failed to get data directory".to_string()))?;
        let app_dir = data_dir.join("pondpilot");
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| SecretError::DatabaseError(e.to_string()))?;
        Ok(app_dir.join("secrets_metadata.db"))
    }
    
    pub async fn store_metadata(&self, metadata: &SecretMetadata) -> Result<(), SecretError> {
        let conn = self.conn.lock().await;
        let tags_json = serde_json::to_string(&metadata.tags)?;
        
        conn.execute(
            "INSERT OR REPLACE INTO secret_metadata 
            (id, name, secret_type, created_at, updated_at, last_used, tags, description, scope)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                metadata.id.to_string(),
                metadata.name,
                metadata.secret_type.to_string(),
                metadata.created_at.to_rfc3339(),
                metadata.updated_at.to_rfc3339(),
                metadata.last_used.map(|dt| dt.to_rfc3339()),
                tags_json,
                metadata.description,
                metadata.scope,
            ],
        )?;
        
        Ok(())
    }
    
    pub async fn get_metadata(&self, secret_id: &Uuid) -> Result<SecretMetadata, SecretError> {
        let conn = self.conn.lock().await;
        
        let mut stmt = conn.prepare(
            "SELECT id, name, secret_type, created_at, updated_at, last_used, tags, description, scope
            FROM secret_metadata WHERE id = ?1"
        )?;
        
        let metadata = stmt.query_row(params![secret_id.to_string()], |row| {
            let id_str: String = row.get(0)?;
            let name: String = row.get(1)?;
            let secret_type_str: String = row.get(2)?;
            let created_at_str: String = row.get(3)?;
            let updated_at_str: String = row.get(4)?;
            let last_used_str: Option<String> = row.get(5)?;
            let tags_json: String = row.get(6)?;
            let description: Option<String> = row.get(7)?;
            let scope: Option<String> = row.get(8)?;
            
            let id = Uuid::parse_str(&id_str).map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                0, rusqlite::types::Type::Text, Box::new(e)
            ))?;
            
            let secret_type = SecretType::from_string(&secret_type_str)
                .ok_or_else(|| rusqlite::Error::FromSqlConversionFailure(
                    2, rusqlite::types::Type::Text, "Invalid secret type".into()
                ))?;
            
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                    3, rusqlite::types::Type::Text, Box::new(e)
                ))?
                .with_timezone(&Utc);
            
            let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                    4, rusqlite::types::Type::Text, Box::new(e)
                ))?
                .with_timezone(&Utc);
            
            let last_used = last_used_str.map(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }).flatten();
            
            let tags: Vec<String> = serde_json::from_str(&tags_json)
                .unwrap_or_else(|_| Vec::new());
            
            Ok(SecretMetadata {
                id,
                name,
                secret_type,
                created_at,
                updated_at,
                last_used,
                tags,
                description,
                scope,
            })
        }).map_err(|e| {
            eprintln!("[MetadataStore] Failed to get metadata for secret {}: {:?}", secret_id, e);
            SecretError::SecretNotFound { 
                id: secret_id.to_string() 
            }
        })?;
        
        Ok(metadata)
    }
    
    pub async fn list_metadata(&self, secret_type: Option<SecretType>) -> Result<Vec<SecretMetadata>, SecretError> {
        let conn = self.conn.lock().await;
        
        let query = if let Some(secret_type) = secret_type {
            format!(
                "SELECT id, name, secret_type, created_at, updated_at, last_used, tags, description, scope
                FROM secret_metadata WHERE secret_type = '{}' ORDER BY updated_at DESC",
                secret_type.to_string()
            )
        } else {
            "SELECT id, name, secret_type, created_at, updated_at, last_used, tags, description, scope
            FROM secret_metadata ORDER BY updated_at DESC".to_string()
        };
        
        let mut stmt = conn.prepare(&query)?;
        
        let metadata_iter = stmt.query_map([], |row| {
            let id_str: String = row.get(0)?;
            let name: String = row.get(1)?;
            let secret_type_str: String = row.get(2)?;
            let created_at_str: String = row.get(3)?;
            let updated_at_str: String = row.get(4)?;
            let last_used_str: Option<String> = row.get(5)?;
            let tags_json: String = row.get(6)?;
            let description: Option<String> = row.get(7)?;
            let scope: Option<String> = row.get(8)?;
            
            let id = Uuid::parse_str(&id_str).map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                0, rusqlite::types::Type::Text, Box::new(e)
            ))?;
            
            let secret_type = SecretType::from_string(&secret_type_str)
                .ok_or_else(|| rusqlite::Error::FromSqlConversionFailure(
                    2, rusqlite::types::Type::Text, "Invalid secret type".into()
                ))?;
            
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                    3, rusqlite::types::Type::Text, Box::new(e)
                ))?
                .with_timezone(&Utc);
            
            let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                    4, rusqlite::types::Type::Text, Box::new(e)
                ))?
                .with_timezone(&Utc);
            
            let last_used = last_used_str.map(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }).flatten();
            
            let tags: Vec<String> = serde_json::from_str(&tags_json)
                .unwrap_or_else(|_| Vec::new());
            
            Ok(SecretMetadata {
                id,
                name,
                secret_type,
                created_at,
                updated_at,
                last_used,
                tags,
                description,
                scope,
            })
        })?;
        
        let mut metadata_list = Vec::new();
        for metadata in metadata_iter {
            metadata_list.push(metadata?);
        }
        
        Ok(metadata_list)
    }
    
    pub async fn delete_metadata(&self, secret_id: &Uuid) -> Result<(), SecretError> {
        let conn = self.conn.lock().await;
        
        conn.execute(
            "DELETE FROM secret_metadata WHERE id = ?1",
            params![secret_id.to_string()],
        )?;
        
        Ok(())
    }
    
    pub async fn update_last_used(&self, secret_id: &Uuid) -> Result<(), SecretError> {
        let conn = self.conn.lock().await;
        let now = Utc::now();
        
        conn.execute(
            "UPDATE secret_metadata SET last_used = ?1 WHERE id = ?2",
            params![now.to_rfc3339(), secret_id.to_string()],
        )?;
        
        Ok(())
    }
    
    pub async fn update_metadata(&self, metadata: &SecretMetadata) -> Result<(), SecretError> {
        self.store_metadata(metadata).await
    }
}