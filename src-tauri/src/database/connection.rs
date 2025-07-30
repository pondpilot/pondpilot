use duckdb::Connection;
use uuid::Uuid;

pub struct DuckDBConnection {
    pub id: String,
    pub conn: Connection,
}

impl DuckDBConnection {
    pub fn new(conn: Connection) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conn,
        }
    }

    pub fn is_open(&self) -> bool {
        // DuckDB connections are always "open" until dropped
        true
    }
}