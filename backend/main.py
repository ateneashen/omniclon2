"""
OmniClon 2 Backend — Focused Voice Cloning API

Clean, professional FastAPI backend for high-quality voice cloning
with excellent A/B Roll support and strong diagnostic logging.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend/ is importable when running via `uvicorn main:app`
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# ============================================================
# Model Management (Fase B1)
# ============================================================
from services.model_manager import ModelManager, ModelConfig
from services.voice_cloning import VoiceCloningService, GenerationRequest, GenerationFromClipRequest

# Se inicializa perezosamente en el lifespan usando OMNICLON2_DATA_DIR
model_manager: ModelManager | None = None
voice_cloning_service: VoiceCloningService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[backend] OmniClon 2 backend starting...")

    global model_manager, voice_cloning_service

    # Inicializar ModelManager usando la variable de entorno que nos pasa Rust
    data_dir = os.environ.get("OMNICLON2_DATA_DIR")
    if data_dir:
        model_manager = ModelManager(data_dir)
        print(f"[backend] ModelManager inicializado. Data dir: {data_dir}")
        print(f"[backend] Modo actual: {model_manager.config.mode}")

        # Inicializar servicio de clonación (usará los mismos modelos)
        voice_cloning_service = VoiceCloningService(model_manager=model_manager)
        voice_cloning_service.initialize()
        print("[backend] VoiceCloningService inicializado (stub por ahora).")
    else:
        print("[backend] WARNING: OMNICLON2_DATA_DIR no está definido. Servicios no se inicializaron.")

    yield

    # Shutdown
    print("[backend] OmniClon 2 backend shutting down...")


app = FastAPI(
    title="OmniClon 2 Backend",
    description="Professional voice cloning API with A/B Roll support",
    version="0.1.0-rewrite",
    lifespan=lifespan,
)

# Allow Tauri webview (and local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production we can tighten this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/system/info")
async def system_info():
    """Health check endpoint used by the Rust sidecar during bootstrap."""
    return {
        "name": "omniclon2-backend",
        "version": "0.1.0-rewrite",
        "status": "ok",
        "python": sys.version.split()[0],
        "data_dir": os.environ.get("OMNICLON2_DATA_DIR", "not-set"),
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ============================================================
# Model Management Endpoints (Fase B1)
# ============================================================

@app.get("/models/status")
async def get_models_status():
    """Devuelve el estado completo de modelos (config + lista + conteos)."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}
    return model_manager.get_model_status().model_dump()


@app.get("/models/catalog")
async def get_models_catalog():
    """
    Devuelve el catálogo oficial de modelos conocidos.
    Incluye información básica de instalación para conveniencia de la UI.
    """
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}
    return {
        "catalog": model_manager.get_catalog_with_status(),
        "version": "1.0"
    }


@app.get("/models/config")
async def get_model_config():
    """Devuelve solo la configuración actual de modelos."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}
    return model_manager.config.model_dump()


@app.post("/models/config")
async def update_model_config(updates: dict):
    """Actualiza parcialmente la configuración de modelos."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}
    updated = model_manager.update_config(updates)
    return updated.model_dump()


@app.post("/models/switch_mode")
async def switch_model_mode(payload: dict):
    """Cambia entre modo 'shared' y 'dedicated'."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}
    mode = payload.get("mode")
    if mode not in ("shared", "dedicated"):
        return {"error": "Modo inválido. Debe ser 'shared' o 'dedicated'"}
    updated = model_manager.switch_mode(mode)
    return updated.model_dump()


@app.post("/models/copy_to_dedicated")
async def copy_models_to_dedicated(payload: dict):
    """
    Copia los modelos indicados a la carpeta dedicada.
    Operación no destructiva: nunca elimina los originales.
    """
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}

    repo_ids = payload.get("repo_ids", [])
    if not isinstance(repo_ids, list):
        return {"error": "El campo 'repo_ids' debe ser una lista de strings"}

    result = model_manager.copy_to_dedicated(repo_ids)
    return result.model_dump()


# ============================================================
# Voice Generation Endpoints (Core Cloning Flow)
# ============================================================

@app.post("/generate")
async def generate_voice(payload: dict):
    """
    Genera voz clonada usando una referencia de audio (típicamente un segmento A-B).
    Esta es la pieza central para conseguir calidad excelente (nivel OmniVoice).
    """
    if voice_cloning_service is None:
        return {"success": False, "error_message": "VoiceCloningService no inicializado"}

    try:
        request = GenerationRequest(**payload)
        result = voice_cloning_service.generate(request)
        return result.model_dump()
    except Exception as e:
        return {
            "success": False,
            "error_message": f"Error procesando petición de generación: {str(e)}"
        }


@app.post("/generate_from_clip")
async def generate_voice_from_clip(payload: dict):
    """
    Extracts the A-B segment from the active clip and generates cloned voice in one step.
    This removes the need for a separate 'Export A-B reference' UI action.
    """
    if voice_cloning_service is None:
        return {"success": False, "error_message": "VoiceCloningService no inicializado"}

    try:
        request = GenerationFromClipRequest(**payload)
        result = voice_cloning_service.generate_from_clip(request)
        return result.model_dump()
    except Exception as e:
        return {
            "success": False,
            "error_message": f"Error procesando generación desde clip: {str(e)}"
        }


@app.get("/voice/generate_options")
async def get_generate_options():
    """Exposes OmniVoice generation tuning options to the frontend."""
    return {
        "options": {
            "speed": {"type": "float", "min": 0.5, "max": 2.0, "default": 1.0, "step": 0.05, "label": "Speaking speed"},
            "num_step": {"type": "int", "min": 4, "max": 64, "default": 24, "step": 1, "label": "Inference steps (quality)"},
            "guidance_scale": {"type": "float", "min": 1.0, "max": 5.0, "default": 2.0, "step": 0.1, "label": "Guidance scale"},
            "denoise": {"type": "bool", "default": True, "label": "Denoise output"},
            "postprocess_output": {"type": "bool", "default": True, "label": "Post-process output"},
            "language": {"type": "select", "choices": ["auto", "es", "en", "zh", "fr", "de", "it", "pt", "ja", "ko"], "default": "auto", "label": "Language"},
            "instruct": {"type": "string", "default": "", "label": "Voice design instruction (optional)"},
            "duration": {"type": "float", "min": 1.0, "max": 60.0, "default": None, "step": 0.5, "label": "Fixed duration (s), optional"},
            "t_shift": {"type": "float", "min": 0.0, "max": 1.0, "default": None, "step": 0.05, "label": "T-shift (advanced)"},
        }
    }


@app.get("/voice/status")
async def get_voice_status():
    """Lightweight status for the voice cloning service (primary model, k2-fsa readiness, etc)."""
    if voice_cloning_service is None:
        return {"ready": False, "error": "VoiceCloningService no inicializado"}
    svc = voice_cloning_service
    return {
        "ready": getattr(svc, "_initialized", False),
        "primary_cloning_model": getattr(svc, "primary_cloning_model", None),
        "k2fsa_loaded": getattr(svc, "_k2fsa_loaded", False),
        "k2fsa_files_verified": getattr(svc, "_k2fsa_files_verified", False),
        "device": getattr(svc, "device", "cpu"),
        "model_path": str(getattr(svc, "model_path", "")) if getattr(svc, "model_path", None) else None,
        "available_models": list(getattr(svc, "available_models", {}).keys()),
        "cloning_model": getattr(svc, "cloning_model", None),
    }


# TODO (Core Cloning Flow focus):
# - /profiles (CRUD + audio upload)
# - /generate → Implementar con calidad OmniVoice (usar mismos engines)
# - Mejorar robustez de extracción A-B y manejo de referencias
# - Strong structured logging to dedicated diagnostic files


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=17493,  # Chosen port for OmniClon 2 (different from reference)
        reload=True,
    )