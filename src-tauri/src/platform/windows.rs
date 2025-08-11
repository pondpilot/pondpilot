use std::process::Command;
use base64::Engine;

pub fn get_file_process_info(file_path: &str) -> String {
    // Validate input - ensure it's a valid path
    if file_path.is_empty() || file_path.contains('\0') {
        return String::new();
    }
    
    // Try using handle.exe (requires Sysinternals tools)
    if let Ok(output) = Command::new("handle")
        .args(&[file_path])
        .output()
    {
        if let Ok(result) = String::from_utf8(output.stdout) {
            if !result.trim().is_empty() {
                return result;
            }
        }
    }
    
    // Try PowerShell approach
    let ps_script = format!(
        "$path = '{}'; Get-Process | Where-Object {{ $_.Modules.FileName -contains $path }}",
        file_path.replace('\'', "''")
    );
    
    // Convert to UTF-16 and then Base64 for -EncodedCommand parameter
    let utf16_bytes: Vec<u8> = ps_script
        .encode_utf16()
        .flat_map(|c| c.to_le_bytes())
        .collect();
    let encoded_command = base64::engine::general_purpose::STANDARD.encode(&utf16_bytes);
    
    if let Ok(output) = Command::new("powershell")
        .args(&["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded_command])
        .output()
    {
        if let Ok(result) = String::from_utf8(output.stdout) {
            if !result.trim().is_empty() {
                return result;
            }
        }
    }
    
    String::new()
}