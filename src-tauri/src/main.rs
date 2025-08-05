// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod persistence;
mod errors;
mod streaming;
mod system_resources;
mod startup_checks;

use database::{DuckDBEngine, EngineConfig};
use persistence::PersistenceState;
use streaming::StreamManager;
use std::sync::Arc;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn test_connection() -> Result<String, String> {
    Ok("Tauri backend is working!".to_string())
}

fn main() {
    // Configure tokio runtime with more blocking threads for DuckDB operations
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .max_blocking_threads(128) // Reduce from default 512 but still enough for concurrent DuckDB operations
        .enable_all()
        .build()
        .expect("Failed to build tokio runtime");
    
    runtime.block_on(async {
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
            
            // Check for database lock before trying to create engine
            if let Err(e) = startup_checks::check_database_lock(&duckdb_path) {
                eprintln!("Database lock check failed: {}", e.message);
                eprintln!("STARTUP ERROR: {}", e.title);
                eprintln!("{}", e.message);
                return Err("Database is locked by another process".into());
            }
            
            // Create DuckDB engine with persistent database
            let engine = match DuckDBEngine::new(duckdb_path.clone()) {
                Ok(engine) => Arc::new(engine),
                Err(e) => {
                    eprintln!("STARTUP ERROR: Database Connection Failed");
                    eprintln!(
                        "Failed to connect to the database:\n\n{}\n\n\
                        This might be because:\n\
                        1. Another instance of PondPilot is running\n\
                        2. The database file is corrupted\n\
                        3. Insufficient permissions\n\n\
                        Try closing all PondPilot instances and restarting.",
                        e
                    );
                    return Err("Failed to create DuckDB engine".into());
                }
            };
            
            // Schedule engine initialization after setup completes
            let engine_clone = engine.clone();
            tauri::async_runtime::spawn(async move {
                eprintln!("[STARTUP] Initializing DuckDB engine...");
                let config = EngineConfig {
                    engine_type: "duckdb".to_string(),
                    storage_type: None,
                    storage_path: None,
                    extensions: None,
                    options: None,
                };
                match engine_clone.initialize(config).await {
                    Ok(_) => eprintln!("[STARTUP] DuckDB engine initialized successfully"),
                    Err(e) => eprintln!("[STARTUP ERROR] Failed to initialize DuckDB engine: {}", e),
                }
            });
            
            // Create SQLite persistence state
            let persistence = PersistenceState::new(sqlite_path)
                .expect("Failed to create persistence state");
            
            // Create stream manager
            let stream_manager = Arc::new(StreamManager::new());
            
            // Store all in app state
            app.manage(engine);
            app.manage(persistence);
            app.manage(stream_manager);
            
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
            commands::stream::stream_query,
            commands::stream::cancel_stream,
            commands::stream::acknowledge_stream_batch,
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
    });
}