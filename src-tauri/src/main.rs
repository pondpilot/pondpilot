// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod connections;
mod constants;
mod database;
mod errors;
mod menu;
mod persistence;
mod platform;
mod secrets;
mod security;
mod startup_checks;
mod streaming;
mod system_resources;
mod windows;

use connections::ConnectionsManager;
use database::{DuckDBEngine, EngineConfig};
use persistence::PersistenceState;
use secrets::SecretsManager;
use std::sync::Arc;
use streaming::StreamManager;
use tauri::Manager;
#[cfg(debug_assertions)]
use tauri::Listener;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn test_connection() -> Result<String, String> {
    Ok("Tauri backend is working!".to_string())
}

#[tauri::command]
fn log_message(message: String) {
    #[cfg(debug_assertions)]
    {
        println!("[JS] {}", message);
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = message;
    }
}

fn main() {
    // Load configuration from environment or defaults
    let app_config = config::AppConfig::from_env();

    // Configure tokio runtime with configurable threads for DuckDB operations
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(app_config.runtime.worker_threads)
        .max_blocking_threads(app_config.runtime.max_blocking_threads)
        .enable_all()
        .build()
        .expect("Failed to build tokio runtime");

    runtime.block_on(async {
        // Initialize tracing subscriber with sensible defaults
        #[cfg(debug_assertions)]
        let _ = tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::new("debug"))
            .try_init();
        #[cfg(not(debug_assertions))]
        let _ = tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::new("warn"))
            .try_init();
        // Set up panic hook to catch and log panics
        std::panic::set_hook(Box::new(|panic_info| {
            eprintln!("PANIC occurred: {}", panic_info);
            if let Some(location) = panic_info.location() {
                eprintln!(
                    "Panic occurred in file '{}' at line {}",
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
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .expect("Failed to get app data directory");

                // Create the directory if it doesn't exist
                if !app_data_dir.exists() {
                    std::fs::create_dir_all(&app_data_dir)
                        .expect("Failed to create app data directory");
                    #[cfg(debug_assertions)]
                    println!("Created app data directory: {:?}", app_data_dir);
                }

                // Create database paths in app data directory
                let duckdb_path = app_data_dir.join("pondpilot.db");
                let sqlite_path = app_data_dir.join("pondpilot_state.db");
                #[cfg(debug_assertions)]
                {
                    println!("DuckDB path: {:?}", duckdb_path);
                    println!("SQLite path: {:?}", sqlite_path);
                }

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
                    #[cfg(debug_assertions)]
                    eprintln!("[STARTUP] Initializing DuckDB engine...");
                    let config = EngineConfig {
                        engine_type: "duckdb".to_string(),
                        storage_type: None,
                        storage_path: None,
                        // Avoid loading extensions during startup to prevent init failures;
                        // extensions are managed by the frontend loaders per-connection
                        extensions: None,
                        options: None,
                    };
                    match engine_clone.initialize(config).await {
                        Ok(_) => {
                            #[cfg(debug_assertions)]
                            eprintln!("[STARTUP] DuckDB engine initialized successfully")
                        }
                        Err(e) => {
                            eprintln!("[STARTUP ERROR] Failed to initialize DuckDB engine: {}", e)
                        }
                    }
                });

                // Create SQLite persistence state
                let persistence =
                    PersistenceState::new(sqlite_path).expect("Failed to create persistence state");

                // Create stream manager
                let stream_manager = Arc::new(StreamManager::new());

                // Create secrets manager with graceful degradation
                let secrets_manager = match SecretsManager::new() {
                    Ok(manager) => {
                        tracing::info!("[STARTUP] Secrets manager initialized successfully");
                        Arc::new(manager)
                    }
                    Err(e) => {
                        tracing::warn!("[STARTUP] Failed to initialize secrets manager: {}", e);
                        tracing::warn!(
                            "[STARTUP] Application will continue with limited functionality"
                        );
                        tracing::warn!("[STARTUP] Secrets management features will be unavailable");
                        // Create a dummy manager that returns errors for all operations
                        Arc::new(SecretsManager::new_disabled())
                    }
                };

                // Create connections manager
                let mut connections_manager = match ConnectionsManager::new(secrets_manager.clone())
                {
                    Ok(manager) => {
                        tracing::info!("[STARTUP] Connections manager initialized successfully");
                        manager
                    }
                    Err(e) => {
                        tracing::warn!("[STARTUP] Failed to initialize connections manager: {}", e);
                        return Err("Failed to create connections manager".into());
                    }
                };

                // Set the DuckDB engine on the connections manager
                connections_manager.set_duckdb_engine(engine.clone());

                // Store all in app state
                app.manage(engine);
                app.manage(persistence);
                app.manage(stream_manager);
                app.manage(secrets_manager);
                app.manage(connections_manager);

                // Set up menu (macOS primarily)
                let menu = menu::create_menu(&app.handle()).expect("Failed to create menu");
                app.set_menu(menu).expect("Failed to set menu");

                // Set up menu event handlers
                menu::setup_menu_handlers(&app.handle());

                #[cfg(debug_assertions)]
                {
                    // Get the main window and enable devtools / listeners only when debugging
                    let window = app
                        .get_webview_window("main")
                        .expect("Main window should exist during setup");

                    window.open_devtools();

                    eprintln!("[WEBVIEW] Debug mode: {}", cfg!(debug_assertions));
                    if let Ok(current_url) = window.url() {
                        eprintln!("[WEBVIEW] Initial URL: {}", current_url);
                    }
                    window.listen("tauri://navigate", |event| {
                        eprintln!("[WEBVIEW] Navigation event: {:?}", event.payload());
                    });
                    let window_error = window.clone();
                    window_error.listen("tauri://error", move |event| {
                        eprintln!("[WEBVIEW] Error event: {:?}", event.payload());
                    });
                }

                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                greet,
                test_connection,
                log_message,
                commands::initialize_duckdb,
                commands::shutdown_duckdb,
                commands::execute_query,
                commands::stream::stream_query,
                commands::stream::cancel_stream,
                commands::stream::acknowledge_stream_batch,
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
                commands::reset_all_connections,
                commands::checkpoint,
                commands::load_extension,
                commands::list_extensions,
                commands::prepare_statement,
                commands::prepared_statement_execute,
                commands::prepared_statement_close,
                commands::set_extensions,
                // Persistence commands
                persistence::sqlite_get,
                persistence::sqlite_put,
                persistence::sqlite_delete,
                persistence::sqlite_clear,
                persistence::sqlite_get_all,
                persistence::sqlite_put_all,
                persistence::sqlite_delete_all,
                persistence::sqlite_begin_transaction,
                persistence::sqlite_commit_transaction,
                persistence::sqlite_rollback_transaction,
                // Secrets management commands
                secrets::save_secret,
                secrets::list_secrets,
                secrets::get_secret,
                secrets::delete_secret,
                secrets::update_secret,
                secrets::test_secret,
                secrets::apply_secret_to_connection,
                secrets::register_storage_secret,
                secrets::get_secret_types,
                secrets::debug_secret,
                secrets::cleanup_orphaned_secrets,
                // Connection management commands
                connections::save_connection,
                connections::list_connections,
                connections::get_connection,
                connections::delete_connection,
                connections::update_connection,
                connections::test_database_connection,
                connections::test_database_connection_config,
                connections::get_connection_types,
                connections::get_connection_with_credentials,
                connections::register_motherduck_attachment,
                connections::attach_remote_database,
                // Window management commands
                windows::open_secrets_window,
                windows::close_secrets_window,
                windows::focus_main_window,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    });
}
