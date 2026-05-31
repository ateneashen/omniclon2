//! Sidecar management for the Python FastAPI backend (improved version).
//!
//! Responsibilities:
//! - Locate Python (dev .venv first)
//! - Spawn uvicorn
//! - Capture stdout + stderr and stream them into our dedicated diagnostic logs
//! - Provide health check
//! - Graceful(ish) shutdown
//!
//! All important events are logged through the diagnostics module so the AI
//! has excellent visibility during development.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;

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

/// Try to find a suitable Python interpreter.
/// Currently prioritizes the development venv.
fn find_python_interpreter(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

    diagnostics::log_diagnostic(
        app,
        "WARN",
        "Backend",
        "Falling back to system 'python' in PATH",
        None,
    );
    Ok(PathBuf::from("python"))
}

/// Spawn the backend and immediately start streaming its stdout/stderr
/// into the diagnostic logging system.
pub fn spawn_backend(app: &tauri::AppHandle) -> Result<Child, String> {
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        "=== Attempting to spawn Python backend ===",
        None,
    );

    let python = find_python_interpreter(app)?;

    let mut cmd = Command::new(&python);
    cmd.env("PYTHONUNBUFFERED", "1");
    cmd.env(
        "OMNICLON2_DATA_DIR",
        app.path()
            .app_local_data_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
    );

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

    let mut child = cmd.spawn().map_err(|e| {
        let msg = format!("Failed to spawn backend process: {}", e);
        diagnostics::log_error(app, "Backend", "Spawn failed", &e, None);
        msg
    })?;

    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        &format!("Backend process started (pid={})", child.id()),
        None,
    );

    // Take the pipes
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_clone_out = app.clone();
    let app_clone_err = app.clone();

    // Spawn thread for stdout
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            diagnostics::log_diagnostic(
                &app_clone_out,
                "INFO",
                "Backend",
                "[stdout]",
                Some(&line),
            );
        }
    });

    // Spawn thread for stderr (these are usually more important for errors)
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            diagnostics::log_diagnostic(
                &app_clone_err,
                "WARN", // stderr is often warnings or errors
                "Backend",
                "[stderr]",
                Some(&line),
            );
        }
    });

    Ok(child)
}

/// Check if the backend is responding to HTTP.
pub fn is_backend_healthy() -> bool {
    let url = format!("http://127.0.0.1:{}/system/info", BACKEND_PORT);
    ureq::get(&url)
        .timeout(std::time::Duration::from_millis(600))
        .call()
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

/// Attempt to kill the backend process (best effort on Windows).
pub fn shutdown_backend(state: &BackendState, app: &tauri::AppHandle) {
    let mut guard = match state.child.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    if let Some(mut child) = guard.take() {
        diagnostics::log_diagnostic(
            app,
            "INFO",
            "Backend",
            &format!("Shutting down backend (pid={})", child.id()),
            None,
        );

        // On Windows we use kill() — it's not graceful but acceptable for now
        let _ = child.kill();
        let _ = child.wait();
    }
}