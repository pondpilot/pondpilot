use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionInfoForLoad {
    pub name: String,
    #[serde(rename = "type")]
    pub extension_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    #[serde(rename = "type")]
    pub engine_type: String,
    pub storage_type: Option<String>,
    pub storage_path: Option<String>,
    pub extensions: Option<Vec<ExtensionInfoForLoad>>,
    pub options: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub rows: Vec<HashMap<String, serde_json::Value>>,
    pub columns: Vec<ColumnInfo>,
    pub row_count: usize,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub database: String,
    pub schema: String,
    pub name: String,
    pub row_count: Option<usize>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRegistration {
    pub table_name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub path: String,
    pub handle: Option<serde_json::Value>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub last_modified: u64,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogInfo {
    pub databases: Vec<DatabaseInfo>,
    pub current_database: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineCapabilities {
    pub supports_streaming: bool,
    pub supports_transactions: bool,
    pub supports_savepoints: bool,
    pub supports_prepared_statements: bool,
    pub max_connections: usize,
    pub extensions: Vec<String>,
}