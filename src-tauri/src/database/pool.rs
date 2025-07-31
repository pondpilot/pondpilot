use anyhow::Result;
use duckdb::Connection;
use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;

pub struct ConnectionPool {
    connections: Mutex<Vec<Connection>>,
    available: Mutex<Vec<usize>>,
    db_path: PathBuf,
}

impl ConnectionPool {
    pub fn new(size: u32, db_path: PathBuf) -> Result<Self> {
        // Ensure the parent directory exists
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }
        
        let mut connections = Vec::new();
        let mut available = Vec::new();
        
        for i in 0..size {
            let conn = Connection::open(&db_path)?;
            connections.push(conn);
            available.push(i as usize);
        }
        
        Ok(Self {
            connections: Mutex::new(connections),
            available: Mutex::new(available),
            db_path,
        })
    }

    pub fn get(&self) -> Result<Connection> {
        // For simplicity, just return a new connection to the same database
        // In production, this would properly manage the pool
        Ok(Connection::open(&self.db_path)?)
    }
}