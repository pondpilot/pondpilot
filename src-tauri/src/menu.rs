use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Manager, Emitter,
};

pub fn create_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let menu = Menu::new(app)?;
    
    // Application menu (macOS only)
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "PondPilot")
            .item(&PredefinedMenuItem::about(app, Some("About PondPilot"), None)?)
            .separator()
            .item(&MenuItemBuilder::with_id("secrets", "Secrets Manager")
                .accelerator("Cmd+Shift+S")
                .build(app)?)
            .separator()
            .item(&MenuItemBuilder::with_id("preferences", "Preferences...")
                .accelerator("Cmd+,")
                .build(app)?)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        
        menu.append(&app_menu)?;
    }
    
    // File menu
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new_tab", "New Tab")
            .accelerator("Cmd+T")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("close_tab", "Close Tab")
            .accelerator("Cmd+W")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_file", "Open File...")
            .accelerator("Cmd+O")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("save", "Save")
            .accelerator("Cmd+S")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("export", "Export Data...")
            .accelerator("Cmd+Shift+E")
            .build(app)?)
        .build()?;
    
    menu.append(&file_menu)?;
    
    // Edit menu
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("find", "Find")
            .accelerator("Cmd+F")
            .build(app)?)
        .build()?;
    
    menu.append(&edit_menu)?;
    
    // View menu
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
            .accelerator("Cmd+B")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("toggle_fullscreen", "Toggle Fullscreen")
            .accelerator("Cmd+Ctrl+F")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("reload", "Reload")
            .accelerator("Cmd+R")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("dev_tools", "Developer Tools")
            .accelerator("Cmd+Option+I")
            .build(app)?)
        .build()?;
    
    menu.append(&view_menu)?;
    
    // Database menu
    let database_menu = SubmenuBuilder::new(app, "Database")
        .item(&MenuItemBuilder::with_id("connect", "Connect to Database...")
            .accelerator("Cmd+Shift+C")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("disconnect", "Disconnect")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("execute_query", "Execute Query")
            .accelerator("Cmd+Enter")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("cancel_query", "Cancel Query")
            .accelerator("Escape")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("refresh_schema", "Refresh Schema")
            .accelerator("Cmd+Shift+R")
            .build(app)?)
        .build()?;
    
    menu.append(&database_menu)?;
    
    // Window menu
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .separator()
        .item(&MenuItemBuilder::with_id("main_window", "Main Window")
            .accelerator("Cmd+1")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("secrets_window", "Secrets Manager")
            .accelerator("Cmd+2")
            .build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;
    
    menu.append(&window_menu)?;
    
    // Help menu
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("documentation", "Documentation")
            .build(app)?)
        .item(&MenuItemBuilder::with_id("report_issue", "Report Issue")
            .build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("about", "About PondPilot")
            .build(app)?)
        .build()?;
    
    menu.append(&help_menu)?;
    
    Ok(menu)
}

pub fn setup_menu_handlers(app: &AppHandle) {
    let _app_handle = app.clone();
    
    app.on_menu_event(move |app, event| {
        match event.id.as_ref() {
            "secrets" | "secrets_window" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::windows::open_secrets_window(app).await {
                        tracing::error!("Failed to open secrets window: {}", e);
                    }
                });
            }
            "main_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                    let _ = window.show();
                }
            }
            "preferences" => {
                // Emit event to frontend to open preferences
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:preferences", ());
                }
            }
            "new_tab" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:new_tab", ());
                }
            }
            "close_tab" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:close_tab", ());
                }
            }
            "open_file" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:open_file", ());
                }
            }
            "save" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:save", ());
                }
            }
            "export" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:export", ());
                }
            }
            "find" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:find", ());
                }
            }
            "toggle_sidebar" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:toggle_sidebar", ());
                }
            }
            "toggle_fullscreen" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_fullscreen(!window.is_fullscreen().unwrap_or(false));
                }
            }
            "reload" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.location.reload()");
                }
            }
            "dev_tools" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            "execute_query" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:execute_query", ());
                }
            }
            "cancel_query" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:cancel_query", ());
                }
            }
            "refresh_schema" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:refresh_schema", ());
                }
            }
            "connect" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:connect_database", ());
                }
            }
            "disconnect" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("menu:disconnect_database", ());
                }
            }
            "documentation" => {
                let _ = open::that("https://pondpilot.io/docs");
            }
            "report_issue" => {
                let _ = open::that("https://github.com/pondpilot/pondpilot/issues");
            }
            _ => {}
        }
    });
}
