#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub mod unix;

#[cfg(target_os = "windows")]
pub use windows::get_file_process_info;

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub use unix::get_file_process_info;

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn get_file_process_info(_file_path: &str) -> String {
    String::new()
}
