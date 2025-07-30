// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod commands;

use database::DuckDBEngine;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Initialize DuckDB engine
    let engine = match DuckDBEngine::new() {
        Ok(engine) => Arc::new(Mutex::new(engine)),
        Err(e) => {
            eprintln!("Failed to initialize DuckDB engine: {}", e);
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            commands::initialize_duckdb,
            commands::execute_query,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}