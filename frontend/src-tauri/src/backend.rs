//! Sidecar management for the Python FastAPI backend.
//!
//! This module is responsible for:
//! - Locating the correct Python interpreter (dev venv or bundled)
//! - Spawning uvicorn with the backend
//! - Capturing stdout/stderr into our dedicated diagnostic logs
//! - Health checking the backend
//!
//! Heavily instrumented for debugging during the rewrite.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::Manager;

use crate::diagnostics;

/// Port used by the OmniClon 2 backend.
pub const BACKEND_PORT: u16 = 17493;

/// Manages the lifecycle of the Python backend process.
pub struct BackendState {
    pub child: Mutex<Option<Child>>,
}

impl BackendState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

/// Try to find a suitable Python interpreter for the backend.
///
/// Priority:
/// 1. Development: backend/.venv/Scripts/python.exe (Windows)
/// 2. Fallback: system `python` or `python3`
fn find_python_interpreter(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let _app_dir = app.path().app_local_data_dir().unwrap_or_default();

    // Development path (when running from source)
    // Expected structure: C:\AI\OmniClon2\backend\.venv\Scripts\python.exe
    let dev_venv_python = PathBuf::from("C:\\AI\\OmniClon2\\backend\\.venv\\Scripts\\python.exe");

    if dev_venv_python.exists() {
        diagnostics::log_diagnostic(
            app,
            "INFO",
            "Backend",
            "Using development venv Python",
            Some(&format!("path={}", dev_venv_python.display())),
        );
        return Ok(dev_venv_python);
    }

    // TODO: Add production bundled Python lookup here later

    // Last resort: hope python is in PATH
    diagnostics::log_diagnostic(
        app,
        "WARN",
        "Backend",
        "Falling back to system Python in PATH",
        None,
    );

    // On Windows we usually want `python` or `py`
    Ok(PathBuf::from("python"))
}

/// Build the command to launch the backend.
fn build_backend_command(python: &PathBuf, app: &tauri::AppHandle) -> Command {
    let mut cmd = Command::new(python);

    // Very important for real-time log streaming
    cmd.env("PYTHONUNBUFFERED", "1");

    // Tell the backend where to find things (we can expand this)
    let data_dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("C:\\AI\\OmniClon2\\data"));
    cmd.env("OMNICLON2_DATA_DIR", data_dir.to_string_lossy().to_string());

    // Launch via uvicorn module
    cmd.args([
        "-m",
        "uvicorn",
        "main:app",
        "--app-dir",
        "C:\\AI\\OmniClon2\\backend",
        "--host",
        "127.0.0.1",
        "--port",
        &BACKEND_PORT.to_string(),
    ]);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    cmd
}

/// Attempt to spawn the backend process.
/// Returns the Child if successful.
pub fn spawn_backend(app: &tauri::AppHandle) -> Result<Child, String> {
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        "Attempting to spawn Python backend...",
        None,
    );

    let python = find_python_interpreter(app)?;
    let mut cmd = build_backend_command(&python, app);

    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        "Spawning command",
        Some(&format!("python={}", python.display())),
    );

    match cmd.spawn() {
        Ok(child) => {
            diagnostics::log_diagnostic(
                app,
                "INFO",
                "Backend",
                &format!("Backend process spawned (pid {})", child.id()),
                None,
            );
            Ok(child)
        }
        Err(e) => {
            let msg = format!("Failed to spawn backend: {}", e);
            diagnostics::log_error(app, "Backend", "Spawn failed", &e, None);
            Err(msg)
        }
    }
}

/// Simple health check against the backend.
pub fn is_backend_healthy() -> bool {
    let url = format!("http://127.0.0.1:{}/system/info", BACKEND_PORT);

    // Use ureq (blocking) for simplicity in this early stage
    match ureq::get(&url).timeout(std::time::Duration::from_millis(800)).call() {
        Ok(response) => response.status() == 200,
        Err(_) => false,
    }
}