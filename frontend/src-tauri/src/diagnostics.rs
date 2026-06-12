//! Dedicated Diagnostic Logging System for OmniClon 2
//!
//! This module exists specifically to enable fast, high-quality debugging
//! during the rewrite — especially AI-assisted debugging.
//!
//! Design goals:
//! - Separate, high-verbosity debug log (omniclon2-debug.log)
//! - Clean error-only log (omniclon2-errors.log)
//! - Easy "tail" function that returns rich recent context
//! - Platform-correct locations (Windows: %LOCALAPPDATA%\OmniClon2\Logs)
//! - Structured context for cloning, A/B, model, and bootstrap operations

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;


use chrono::{DateTime, Utc};
use tauri::Manager;

/// Returns the base logs directory for OmniClon 2 (creates it if needed).
pub fn logs_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("C:\\AI\\OmniClon2\\data"));

    let logs = base.join("Logs");
    let _ = fs::create_dir_all(&logs);
    logs
}

/// Main debug log (very verbose, for AI + developers).
pub fn debug_log_path(app: &tauri::AppHandle) -> PathBuf {
    logs_dir(app).join("omniclon2-debug.log")
}

/// Errors-only log (cleaner, great for quick triage).
pub fn errors_log_path(app: &tauri::AppHandle) -> PathBuf {
    logs_dir(app).join("omniclon2-errors.log")
}

/// Writes a structured line to both logs.
pub fn log_diagnostic(
    app: &tauri::AppHandle,
    level: &str,
    component: &str,
    message: &str,
    context: Option<&str>,
) {
    let now: DateTime<Utc> = Utc::now();
    let ts = now.to_rfc3339();

    let ctx = context.unwrap_or("");
    let line = format!(
        "[{ts}] {level:5} | {component:20} | {message}{ctx}",
        ts = ts,
        level = level,
        component = component,
        message = message,
        ctx = if ctx.is_empty() { String::new() } else { format!(" | {}", ctx) }
    );

    // Always write to debug log
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(debug_log_path(app))
    {
        let _ = writeln!(f, "{}", line);
    }

    // Only errors/warnings go to the errors log
    if level == "ERROR" || level == "WARN" {
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(errors_log_path(app))
        {
            let _ = writeln!(f, "{}", line);
        }
    }

    // Also emit to the normal logger (visible in `tauri dev`)
    log::info!("[DIAG] {} | {} | {}", level, component, message);
}

/// Convenience for errors with full context (the most important for the AI).
pub fn log_error(
    app: &tauri::AppHandle,
    component: &str,
    message: &str,
    error: &dyn std::fmt::Display,
    extra_context: Option<&str>,
) {
    let ctx = format!(
        "error={}{}",
        error,
        extra_context.map(|c| format!(" | {}", c)).unwrap_or_default()
    );
    log_diagnostic(app, "ERROR", component, message, Some(&ctx));
}

/// Returns the last N lines from the errors log (perfect for AI debugging).
pub fn tail_errors(app: &tauri::AppHandle, max_lines: usize) -> String {
    let path = errors_log_path(app);
    match fs::read_to_string(&path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = lines.len().saturating_sub(max_lines);
            lines[start..].join("\n")
        }
        Err(_) => "No error log found yet.".to_string(),
    }
}

/// Returns the last N lines from the main debug log.
pub fn tail_debug(app: &tauri::AppHandle, max_lines: usize) -> String {
    let path = debug_log_path(app);
    match fs::read_to_string(&path) {
        Ok(content) => {
            let lines: Vec<&str> = content.lines().collect();
            let start = lines.len().saturating_sub(max_lines);
            lines[start..].join("\n")
        }
        Err(_) => "No debug log found yet.".to_string(),
    }
}