// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod backend;
mod commands;
mod diagnostics;

use std::sync::Mutex;

use tauri::Manager;

use crate::backend::{BackendState, BACKEND_PORT};

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

/// Try to start the Python backend (if not already running).
#[tauri::command]
fn start_backend(app: tauri::AppHandle, state: tauri::State<'_, BackendState>) -> Result<String, String> {
    diagnostics::log_diagnostic(&app, "INFO", "Backend", "start_backend command called", None);

    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok("Backend already running".to_string());
        }
    }

    match backend::spawn_backend(&app, &state) {
        Ok(()) => Ok(format!("Backend spawned on port {}", BACKEND_PORT)),
        Err(e) => {
            diagnostics::log_error(&app, "Backend", "Failed to start backend from command", &e, None);
            Err(e)
        }
    }
}

/// Gracefully (best effort) stop the backend.
#[tauri::command]
fn stop_backend(app: tauri::AppHandle, state: tauri::State<'_, BackendState>) {
    backend::shutdown_backend(&state, &app);
}

/// Returns whether the backend is currently considered healthy.
#[tauri::command]
fn backend_health() -> bool {
    backend::is_backend_healthy()
}

/// Returns detailed status of the backend (for UI and debugging).
#[tauri::command]
fn get_backend_status(state: tauri::State<'_, BackendState>) -> backend::BackendStatus {
    state.get_status()
}

/// Rich bootstrap status for the ambitious splash screen.
#[tauri::command]
fn get_bootstrap_status(state: tauri::State<'_, BackendState>) -> backend::BootstrapStatus {
    backend::get_bootstrap_status(&state)
}

/// Restart the backend (stop + start).
#[tauri::command]
fn restart_backend(app: tauri::AppHandle, state: tauri::State<'_, BackendState>) -> Result<(), String> {
    backend::restart_backend(&app, &state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            tail_errors,
            tail_debug,
            log_diagnostic_event,
            start_backend,
            stop_backend,
            backend_health,
            get_backend_status,
            get_bootstrap_status,
            restart_backend,
            commands::media::import_media,
            commands::media::extract_waveform,
            commands::media::extract_segment
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

            // Attempt to auto-start the backend on launch (best effort).
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Some(state) = app_handle.try_state::<BackendState>() {
                    if let Err(e) = backend::spawn_backend(&app_handle, &state) {
                        diagnostics::log_error(
                            &app_handle,
                            "Backend",
                            "Auto-start of backend failed",
                            &e,
                            None,
                        );
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle().clone();
                if let Some(state) = app_handle.try_state::<BackendState>() {
                    backend::shutdown_backend(&state, &app_handle);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
