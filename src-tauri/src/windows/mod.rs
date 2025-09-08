use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_secrets_window(app: AppHandle) -> Result<(), String> {
    // Check if secrets window already exists
    if let Some(window) = app.get_webview_window("secrets") {
        // If it exists, focus it
        window.set_focus().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Create new secrets window - start at root and navigate after load
    let window = WebviewWindowBuilder::new(
        &app,
        "secrets",
        // Navigate to secrets via query param to avoid eval
        WebviewUrl::App("index.html?window=secrets".into())
    )
    .title("Secrets Manager")
    .inner_size(900.0, 700.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    // Enable devtools in debug mode
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
    }
    Ok(())
}

#[tauri::command]
pub async fn close_secrets_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("secrets") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn focus_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_focus().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}
