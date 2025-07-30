// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;

use database::DuckDBEngine;
use std::sync::Arc;
use tokio::sync::Mutex;

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
    // Create DuckDB engine
    let engine = Arc::new(Mutex::new(
        DuckDBEngine::new().expect("Failed to create DuckDB engine")
    ));

    tauri::Builder::default()
        .manage(engine)
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
            commands::create_connection,
            commands::connection_execute,
            commands::connection_close,
            commands::checkpoint,
            commands::export_database,
            commands::import_database,
            commands::load_extension,
            commands::list_extensions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}