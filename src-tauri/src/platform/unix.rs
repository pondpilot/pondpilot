use std::process::Command;

pub fn get_file_process_info(file_path: &str) -> String {
    // Try lsof
    if let Ok(output) = Command::new("lsof")
        .args(&[file_path])
        .output()
    {
        if let Ok(result) = String::from_utf8(output.stdout) {
            if !result.trim().is_empty() {
                return result;
            }
        }
    }
    
    // On Linux, try fuser as fallback
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("fuser")
            .args(&[file_path])
            .output()
        {
            if let Ok(result) = String::from_utf8(output.stdout) {
                if !result.trim().is_empty() {
                    return format!("Processes using {}: {}", file_path, result);
                }
            }
        }
    }
    
    String::new()
}