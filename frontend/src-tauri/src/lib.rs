// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod diagnostics;

use tauri::Manager;

/// Simple greeting (will be removed later).
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns the last N lines from the dedicated errors log.
/// This is the primary tool for the AI (and power users) during debugging.
#[tauri::command]
fn tail_errors(app: tauri::AppHandle, max_lines: Option<usize>) -> String {
    diagnostics::tail_errors(&app, max_lines.unwrap_or(80))
}

/// Returns the last N lines from the full debug log.
#[tauri::command]
fn tail_debug(app: tauri::AppHandle, max_lines: Option<usize>) -> String {
    diagnostics::tail_debug(&app, max_lines.unwrap_or(50))
}

/// Logs a diagnostic event from the frontend (useful for A/B actions, cloning attempts, etc.).
#[tauri::command]
fn log_diagnostic_event(
    app: tauri::AppHandle,
    level: String,
    component: String,
    message: String,
    context: Option<String>,
) {
    diagnostics::log_diagnostic(
        &app,
        &level,
        &component,
        &message,
        context.as_deref(),
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            tail_errors,
            tail_debug,
            log_diagnostic_event
        ])
        .setup(|app| {
            // Log that the app started (goes to our dedicated diagnostic logs)
            diagnostics::log_diagnostic(
                app.handle(),
                "INFO",
                "App",
                "OmniClon 2 desktop app started",
                None,
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
