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

/// Represents the current state of the backend process.
#[derive(Debug, Clone, serde::Serialize)]
pub enum BackendStatus {
    NotStarted,
    Starting,
    Running { pid: u32 },
    Failed { error: String },
    Stopped,
}

/// Combined information useful for the bootstrap splash screen.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BootstrapStatus {
    pub backend_status: BackendStatus,
    pub is_healthy: bool,
    pub stage: String,           // "checking" | "starting_backend" | "ready" | "failed"
    pub message: Option<String>,
}

/// Manages the lifecycle of the Python backend process.
pub struct BackendState {
    pub child: Mutex<Option<Child>>,
    pub status: Mutex<BackendStatus>,
}

impl BackendState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(BackendStatus::NotStarted),
        }
    }

    pub fn set_status(&self, new_status: BackendStatus) {
        if let Ok(mut guard) = self.status.lock() {
            *guard = new_status;
        }
    }

    pub fn get_status(&self) -> BackendStatus {
        self.status
            .lock()
            .map(|g| g.clone())
            .unwrap_or(BackendStatus::NotStarted)
    }
}

/// Try to find a suitable Python interpreter with multiple smart fallbacks.
/// This is critical for working both in development and after bundling.
fn find_python_interpreter(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "PythonDetector",
        "Starting Python interpreter detection...",
        None,
    );

    let candidates: Vec<(String, PathBuf)> = build_python_candidates(app);

    for (description, path) in &candidates {
        diagnostics::log_diagnostic(
            app,
            "INFO",
            "PythonDetector",
            &format!("Trying: {}", description),
            Some(&format!("path={}", path.display())),
        );

        if path.exists() {
            diagnostics::log_diagnostic(
                app,
                "INFO",
                "PythonDetector",
                "✓ Found working Python interpreter",
                Some(&format!("{} → {}", description, path.display())),
            );
            return Ok(path.clone());
        } else {
            diagnostics::log_diagnostic(
                app,
                "DEBUG",
                "PythonDetector",
                "Not found",
                Some(&description),
            );
        }
    }

    // Last resort: bare "python" (rely on PATH)
    diagnostics::log_diagnostic(
        app,
        "WARN",
        "PythonDetector",
        "No explicit venv found. Falling back to 'python' from PATH. This may fail.",
        None,
    );

    Ok(PathBuf::from("python"))
}

/// Build an ordered list of (description, path) candidates for the Python interpreter.
fn build_python_candidates(_app: &tauri::AppHandle) -> Vec<(String, PathBuf)> {
    let mut candidates = Vec::new();

    // 1. Try to resolve relative to the running executable (important for bundled builds)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Common layout after bundling: resources/backend/.venv/...
            let bundled_windows = exe_dir
                .join("resources")
                .join("backend")
                .join(".venv")
                .join("Scripts")
                .join("python.exe");
            candidates.push((
                "Bundled (next to exe - Windows)".to_string(),
                bundled_windows,
            ));

            // Alternative layout
            let bundled_alt = exe_dir
                .join("backend")
                .join(".venv")
                .join("Scripts")
                .join("python.exe");
            candidates.push(("Bundled (next to exe - alt)".to_string(), bundled_alt));
        }
    }

    // 2. Development venv - Windows (most common during `tauri dev`)
    let dev_windows = PathBuf::from("C:\\AI\\OmniClon2\\backend\\.venv\\Scripts\\python.exe");
    candidates.push(("Dev venv - Windows hardcoded".to_string(), dev_windows));

    // Try relative to current working directory (works if running from project root)
    let dev_windows_relative =
        PathBuf::from("backend\\.venv\\Scripts\\python.exe");
    candidates.push((
        "Dev venv - relative to CWD (Windows)".to_string(),
        dev_windows_relative,
    ));

    // 3. Try using `uv` managed environments (very common with this project)
    // uv usually puts them in .venv at the project root or backend root
    let uv_backend_venv = PathBuf::from("backend\\.venv\\Scripts\\python.exe");
    candidates.push(("uv backend venv (relative)".to_string(), uv_backend_venv));

    // 4. Unix-style paths (for future cross-platform support)
    let unix_dev = PathBuf::from("backend/.venv/bin/python");
    candidates.push(("Dev venv - Unix style".to_string(), unix_dev));

    candidates
}

/// Spawn the backend and immediately start streaming its stdout/stderr
/// into the diagnostic logging system.
/// 
/// This version properly updates the BackendState.
pub fn spawn_backend(
    app: &tauri::AppHandle,
    state: &BackendState,
) -> Result<(), String> {
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        "=== Attempting to spawn Python backend ===",
        None,
    );

    state.set_status(BackendStatus::Starting);

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

    // Try to find a reasonable backend directory
    let backend_dir = resolve_backend_dir();
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        &format!("Using backend directory: {}", backend_dir.display()),
        None,
    );

    cmd.args([
        "-m",
        "uvicorn",
        "main:app",
        "--app-dir",
        backend_dir.to_string_lossy().as_ref(),
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
        state.set_status(BackendStatus::Failed { error: msg.clone() });
        msg
    })?;

    let pid = child.id();
    diagnostics::log_diagnostic(
        app,
        "INFO",
        "Backend",
        &format!("Backend process started successfully (pid={})", pid),
        None,
    );

    // Take the pipes before moving child
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_clone_out = app.clone();
    let app_clone_err = app.clone();

    // Spawn threads to pipe logs
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

    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            diagnostics::log_diagnostic(
                &app_clone_err,
                "WARN",
                "Backend",
                "[stderr]",
                Some(&line),
            );
        }
    });

    // Store the child and update status
    {
        let mut guard = state.child.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    state.set_status(BackendStatus::Running { pid });

    // Start a lightweight monitor that logs if the backend stops responding
    let app_clone = app.clone();
    thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if !is_backend_healthy() {
                diagnostics::log_diagnostic(
                    &app_clone,
                    "WARN",
                    "BackendMonitor",
                    "Backend health check failed (may have crashed or is still starting)",
                    None,
                );
            }
        }
    });

    Ok(())
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

/// Try to resolve the directory that contains the backend Python code (main.py).
fn resolve_backend_dir() -> PathBuf {
    // 1. Try relative to current exe (production bundle)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("resources").join("backend");
            if bundled.join("main.py").exists() {
                return bundled;
            }
            let alt = dir.join("backend");
            if alt.join("main.py").exists() {
                return alt;
            }
        }
    }

    // 2. Development - known location
    let dev = PathBuf::from("C:\\AI\\OmniClon2\\backend");
    if dev.join("main.py").exists() {
        return dev;
    }

    // 3. Relative to CWD
    let relative = PathBuf::from("backend");
    if relative.join("main.py").exists() {
        return relative;
    }

    // Fallback
    PathBuf::from("backend")
}

/// Attempt to kill the backend process (best effort on Windows).
pub fn shutdown_backend(state: &BackendState, app: &tauri::AppHandle) {
    let mut guard = match state.child.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    if let Some(mut child) = guard.take() {
        let pid = child.id();
        diagnostics::log_diagnostic(
            app,
            "INFO",
            "Backend",
            &format!("Shutting down backend (pid={})", pid),
            None,
        );

        // On Windows we use kill() — it's not graceful but acceptable for now
        let _ = child.kill();
        let _ = child.wait();

        state.set_status(BackendStatus::Stopped);
    }
}

/// Attempts a clean restart of the backend.
pub fn restart_backend(app: &tauri::AppHandle, state: &BackendState) -> Result<(), String> {
    diagnostics::log_diagnostic(app, "INFO", "Backend", "Restart requested", None);

    shutdown_backend(state, app);
    std::thread::sleep(std::time::Duration::from_millis(600));

    spawn_backend(app, state)
}

/// Returns combined information useful for an ambitious bootstrap splash screen.
pub fn get_bootstrap_status(state: &BackendState) -> BootstrapStatus {
    let backend_status = state.get_status();
    let is_healthy = is_backend_healthy();

    let (stage, message) = match &backend_status {
        BackendStatus::NotStarted => ("checking", Some("Preparing environment...".to_string())),
        BackendStatus::Starting => ("starting_backend", Some("Launching Python backend...".to_string())),
        BackendStatus::Running { .. } => {
            if is_healthy {
                ("ready", Some("Backend is healthy and ready.".to_string()))
            } else {
                ("starting_backend", Some("Waiting for backend to respond...".to_string()))
            }
        }
        BackendStatus::Failed { error } => ("failed", Some(error.clone())),
        BackendStatus::Stopped => ("failed", Some("Backend process was stopped.".to_string())),
    };

    BootstrapStatus {
        backend_status,
        is_healthy,
        stage: stage.to_string(),
        message,
    }
}