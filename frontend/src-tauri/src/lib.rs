// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod backend;
mod commands;
mod diagnostics;

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

/// Returns the absolute path to the dedicated diagnostic logs folder.
#[tauri::command]
fn get_logs_dir(app: tauri::AppHandle) -> String {
    diagnostics::logs_dir(&app).to_string_lossy().to_string()
}

/// Returns the default folder for saved video frame captures (creates it if needed).
#[tauri::command]
fn get_captures_dir(app: tauri::AppHandle) -> String {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("C:\\AI\\OmniClon2\\data"));

    let captures = base.join("Captures");
    let _ = std::fs::create_dir_all(&captures);
    captures.to_string_lossy().to_string()
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

/// Proxy to Python backend /generate (voice cloning from A/B ref).
/// This makes the "Generate Cloned Voice" button in the UI functional.
#[tauri::command]
fn generate(app: tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/generate", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Voice", "generate command invoked, proxying to backend", None);

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(120))
        .set("Content-Type", "application/json")
        .send_json(payload)
        .map_err(|e| {
            let msg = format!("Failed to reach backend /generate: {}", e);
            diagnostics::log_error(&app, "Voice", "generate proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /generate_from_clip.
/// Extracts the A-B segment and generates voice in one backend call.
#[tauri::command]
fn generate_from_clip(app: tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/generate_from_clip", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Voice", "generate_from_clip command invoked, proxying to backend", None);

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(180))
        .set("Content-Type", "application/json")
        .send_json(payload)
        .map_err(|e| {
            let msg = format!("Failed to reach backend /generate_from_clip: {}", e);
            diagnostics::log_error(&app, "Voice", "generate_from_clip proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /voice/generate_options to populate the tuning UI.
#[tauri::command]
fn get_generate_options(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/voice/generate_options", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Voice", "get_generate_options invoked, proxying to backend", None);

    let resp = ureq::get(&url)
        .timeout(std::time::Duration::from_millis(800))
        .call()
        .map_err(|e| {
            let msg = format!("Failed to reach backend /voice/generate_options: {}", e);
            diagnostics::log_error(&app, "Voice", "generate options proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /media/extract_subtitles.
/// Extracts embedded subtitle text from the source video (SRT/ASS/etc).
#[tauri::command]
fn extract_subtitles(app: tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/media/extract_subtitles", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Media", "extract_subtitles invoked, proxying to backend", None);

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(60))
        .set("Content-Type", "application/json")
        .send_json(payload)
        .map_err(|e| {
            let msg = format!("Failed to reach backend /media/extract_subtitles: {}", e);
            diagnostics::log_error(&app, "Media", "extract_subtitles proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /media/subtitle_tracks.
/// Lists embedded subtitle streams for the user to choose from.
#[tauri::command]
fn subtitle_tracks(app: tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/media/subtitle_tracks", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Media", "subtitle_tracks invoked, proxying to backend", None);

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(30))
        .set("Content-Type", "application/json")
        .send_json(payload)
        .map_err(|e| {
            let msg = format!("Failed to reach backend /media/subtitle_tracks: {}", e);
            diagnostics::log_error(&app, "Media", "subtitle_tracks proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /media/transcribe.
/// Runs OpenAI Whisper on the A-B audio segment (ASR fallback when no subtitles exist).
#[tauri::command]
fn transcribe_audio(app: tauri::AppHandle, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/media/transcribe", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Media", "transcribe_audio invoked, proxying to backend", None);

    let resp = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(300))
        .set("Content-Type", "application/json")
        .send_json(payload)
        .map_err(|e| {
            let msg = format!("Failed to reach backend /media/transcribe: {}", e);
            diagnostics::log_error(&app, "Media", "transcribe_audio proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

/// Proxy to Python backend /voice/status for cloning service readiness (primary model, k2-fsa prep state).
#[tauri::command]
fn get_voice_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/voice/status", BACKEND_PORT);
    diagnostics::log_diagnostic(&app, "INFO", "Voice", "get_voice_status invoked, proxying to backend", None);

    let resp = ureq::get(&url)
        .timeout(std::time::Duration::from_millis(800))
        .call()
        .map_err(|e| {
            let msg = format!("Failed to reach backend /voice/status: {}", e);
            diagnostics::log_error(&app, "Voice", "voice status proxy failed", &e.to_string(), None);
            msg
        })?;

    let json: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ensure loopback traffic never goes through a system HTTP proxy.
    // This prevents ureq (and any child process) from trying to proxy
    // localhost:17493 traffic, which breaks the backend connection on
    // machines with HTTP_PROXY set.
    for (key, value) in [("NO_PROXY", "127.0.0.1,localhost"), ("no_proxy", "127.0.0.1,localhost")] {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            tail_errors,
            tail_debug,
            log_diagnostic_event,
            get_logs_dir,
            get_captures_dir,
            start_backend,
            stop_backend,
            backend_health,
            get_backend_status,
            get_bootstrap_status,
            restart_backend,
            generate,
            generate_from_clip,
            get_generate_options,
            extract_subtitles,
            subtitle_tracks,
            transcribe_audio,
            get_voice_status,
            commands::media::import_media,
            commands::media::audio_tracks,
            commands::media::extract_waveform,
            commands::media::extract_segment,
            commands::media::capture_video_frame,
            // Model Management (Fase B1)
            commands::models::get_model_status,
            commands::models::get_model_config,
            commands::models::switch_model_mode,
            commands::models::get_model_catalog,
            commands::models::copy_models_to_dedicated,
            // Model Download (v1.1.0)
            commands::models::download_model,
            commands::models::get_download_progress,
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
