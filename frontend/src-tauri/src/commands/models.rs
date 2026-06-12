use crate::backend::BACKEND_PORT;
use crate::diagnostics;
use tauri::{command, AppHandle};

const BACKEND_BASE: &str = "http://127.0.0.1";

fn backend_url(path: &str) -> String {
    format!("{}:{}{}", BACKEND_BASE, BACKEND_PORT, path)
}

/// Llama al backend Python y devuelve el ModelStatus completo.
#[command]
pub async fn get_model_status(app: AppHandle) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Models",
        "get_model_status llamado",
        None,
    );

    let url = backend_url("/models/status");

    match ureq::get(&url)
        .timeout(std::time::Duration::from_millis(4000))
        .call()
    {
        Ok(response) => {
            let json: serde_json::Value = response.into_json()
                .map_err(|e| format!("Error parseando respuesta del backend: {}", e))?;
            Ok(json)
        }
        Err(e) => {
            let msg = format!("No se pudo contactar al backend en {}: {}", url, e);
            diagnostics::log_error(&app, "Models", "get_model_status falló", &msg, None);
            Err(msg)
        }
    }
}

/// Devuelve solo la configuración actual de modelos.
#[command]
pub async fn get_model_config(app: AppHandle) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Models",
        "get_model_config llamado",
        None,
    );

    let url = backend_url("/models/config");

    match ureq::get(&url)
        .timeout(std::time::Duration::from_millis(4000))
        .call()
    {
        Ok(response) => {
            let json: serde_json::Value = response.into_json()
                .map_err(|e| format!("Error parseando respuesta: {}", e))?;
            Ok(json)
        }
        Err(e) => {
            let msg = format!("Fallo al obtener config de modelos: {}", e);
            diagnostics::log_error(&app, "Models", "get_model_config falló", &msg, None);
            Err(msg)
        }
    }
}

/// Cambia el modo de modelos (shared ↔ dedicated).
#[command]
pub async fn switch_model_mode(app: AppHandle, mode: String) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Models",
        &format!("switch_model_mode → {}", mode),
        None,
    );

    let url = backend_url("/models/switch_mode");

    let body = serde_json::json!({ "mode": mode });

    match ureq::post(&url)
        .set("Content-Type", "application/json")
        .timeout(std::time::Duration::from_millis(8000))
        .send_json(body)
    {
        Ok(response) => {
            let json: serde_json::Value = response.into_json()
                .map_err(|e| format!("Error parseando respuesta: {}", e))?;
            Ok(json)
        }
        Err(e) => {
            let msg = format!("Fallo al cambiar modo de modelos: {}", e);
            diagnostics::log_error(&app, "Models", "switch_model_mode falló", &msg, None);
            Err(msg)
        }
    }
}

/// Obtiene el catálogo oficial de modelos (con estado de instalación).
#[command]
pub async fn get_model_catalog(app: AppHandle) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Models",
        "get_model_catalog llamado",
        None,
    );

    let url = backend_url("/models/catalog");

    match ureq::get(&url)
        .timeout(std::time::Duration::from_millis(4000))
        .call()
    {
        Ok(response) => {
            let json: serde_json::Value = response.into_json()
                .map_err(|e| format!("Error parseando respuesta: {}", e))?;
            Ok(json)
        }
        Err(e) => {
            let msg = format!("Fallo al obtener catálogo de modelos: {}", e);
            diagnostics::log_error(&app, "Models", "get_model_catalog falló", &msg, None);
            Err(msg)
        }
    }
}

/// Inicia la copia de modelos seleccionados a la carpeta dedicada.
/// Operación no destructiva.
#[command]
pub async fn copy_models_to_dedicated(
    app: AppHandle,
    repo_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    diagnostics::log_diagnostic(
        &app,
        "INFO",
        "Models",
        &format!("copy_models_to_dedicated llamado con {} modelos", repo_ids.len()),
        None,
    );

    let url = backend_url("/models/copy_to_dedicated");

    let body = serde_json::json!({ "repo_ids": repo_ids });

    match ureq::post(&url)
        .set("Content-Type", "application/json")
        .timeout(std::time::Duration::from_millis(300_000)) // 5 minutos para copias grandes
        .send_json(body)
    {
        Ok(response) => {
            let json: serde_json::Value = response.into_json()
                .map_err(|e| format!("Error parseando respuesta: {}", e))?;
            Ok(json)
        }
        Err(e) => {
            let msg = format!("Fallo al copiar modelos a dedicada: {}", e);
            diagnostics::log_error(&app, "Models", "copy_models_to_dedicated falló", &msg, None);
            Err(msg)
        }
    }
}
