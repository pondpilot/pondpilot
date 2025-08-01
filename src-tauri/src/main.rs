// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod persistence;
mod errors;

use database::DuckDBEngine;
use persistence::PersistenceState;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn test_connection() -> Result<String, String> {
    Ok("Tauri backend is working!".to_string())
}

#[tokio::main]
async fn main() {
    // Set up panic hook to catch and log panics
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("PANIC occurred: {}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!("Panic occurred in file '{}' at line {}", 
                location.file(), 
                location.line()
            );
        }
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Get the app data directory
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            
            // Create database paths in app data directory
            let duckdb_path = app_data_dir.join("pondpilot.db");
            let sqlite_path = app_data_dir.join("pondpilot_state.db");
            println!("DuckDB path: {:?}", duckdb_path);
            println!("SQLite path: {:?}", sqlite_path);
            
            // Create DuckDB engine with persistent database
            let engine = Arc::new(Mutex::new(
                DuckDBEngine::new(duckdb_path).expect("Failed to create DuckDB engine")
            ));
            
            // Create SQLite persistence state
            let persistence = PersistenceState::new(sqlite_path)
                .expect("Failed to create persistence state");
            
            // Store both in app state
            app.manage(engine);
            app.manage(persistence);
            
            // Enable devtools in debug mode
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            test_connection,
            commands::initialize_duckdb,
            commands::shutdown_duckdb,
            commands::execute_query,
            commands::stream_query,
            commands::prepare_statement,
            commands::prepared_statement_execute,
            commands::prepared_statement_close,
            commands::get_catalog,
            commands::get_databases,
            commands::get_tables,
            commands::get_columns,
            commands::register_file,
            commands::drop_file,
            commands::list_files,
            commands::get_xlsx_sheet_names,
            commands::create_connection,
            commands::connection_execute,
            commands::connection_close,
            commands::checkpoint,
            commands::export_database,
            commands::import_database,
            commands::load_extension,
            commands::list_extensions,
            // Persistence commands
            persistence::sqlite_get,
            persistence::sqlite_put,
            persistence::sqlite_delete,
            persistence::sqlite_clear,
            persistence::sqlite_get_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}