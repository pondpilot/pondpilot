use std::net::TcpListener;
use std::path::Path;
use std::process::Command;

pub struct StartupError {
    pub title: String,
    pub message: String,
    pub recoverable: bool,
}

impl StartupError {
    fn new(title: impl Into<String>, message: impl Into<String>, recoverable: bool) -> Self {
        Self {
            title: title.into(),
            message: message.into(),
            recoverable,
        }
    }
}

pub fn check_port_availability(port: u16) -> Result<(), StartupError> {
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => Ok(()),
        Err(_) => {
            // Try to find what's using the port
            let lsof_output = Command::new("lsof")
                .args(&["-i", &format!(":{}", port)])
                .output()
                .ok()
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .unwrap_or_default();
            
            let process_info = if !lsof_output.is_empty() {
                format!("\n\nProcess using port {}:\n{}", port, lsof_output)
            } else {
                String::new()
            };
            
            Err(StartupError::new(
                "Port Already in Use",
                format!(
                    "Port {} is already in use by another process.{}\n\n\
                    Please either:\n\
                    1. Stop the other process\n\
                    2. Change the port in vite.config.mjs\n\
                    3. Update devUrl in src-tauri/tauri.conf.json",
                    port, process_info
                ),
                false,
            ))
        }
    }
}

pub fn check_database_lock(db_path: &Path) -> Result<(), StartupError> {
    let lock_file = db_path.with_extension("db.wal");
    
    if lock_file.exists() {
        // Check if another process has the database open
        let db_path_str = db_path.to_string_lossy();
        let lsof_output = Command::new("lsof")
            .arg(&db_path_str.to_string())
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .unwrap_or_default();
        
        if !lsof_output.is_empty() {
            return Err(StartupError::new(
                "Database Already in Use",
                format!(
                    "Another instance of PondPilot appears to be running.\n\n\
                    Database: {}\n\n\
                    Process information:\n{}\n\n\
                    Please close the other instance before starting a new one.",
                    db_path_str, lsof_output
                ),
                false,
            ));
        }
    }
    
    Ok(())
}

pub fn find_available_port(start_port: u16, max_attempts: u16) -> Option<u16> {
    for offset in 0..max_attempts {
        let port = start_port + offset;
        if TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return Some(port);
        }
    }
    None
}

