use std::path::Path;
use crate::platform;

pub struct StartupError {
    pub title: String,
    pub message: String,
    // TODO: Use for recoverable error handling
    #[allow(dead_code)]
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


pub fn check_database_lock(db_path: &Path) -> Result<(), StartupError> {
    let lock_file = db_path.with_extension("db.wal");
    
    if lock_file.exists() {
        // Check if another process has the database open (platform-specific)
        let db_path_str = db_path.to_string_lossy();
        let process_info = platform::get_file_process_info(&db_path_str);
        
        if !process_info.is_empty() {
            return Err(StartupError::new(
                "Database Already in Use",
                format!(
                    "Another instance of PondPilot appears to be running.\n\n\
                    Database: {}\n\n\
                    Process information:\n{}\n\n\
                    Please close the other instance before starting a new one.",
                    db_path_str, process_info
                ),
                false,
            ));
        }
    }
    
    Ok(())
}

