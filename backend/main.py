"""
OmniClon 2 Backend — Focused Voice Cloning API

Clean, professional FastAPI backend for high-quality voice cloning
with excellent A/B Roll support and strong diagnostic logging.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

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


@app.post("/models/download/{repo_id:path}")
async def download_model(repo_id: str):
    """
    Inicia la descarga de un modelo desde Hugging Face.
    La descarga es asíncrona; consulta /models/download_progress/{repo_id} para el progreso.
    """
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}

    job = model_manager.start_download(repo_id)
    return job.model_dump()


@app.get("/models/download_progress/{repo_id:path}")
async def get_download_progress(repo_id: str):
    """Devuelve el progreso de una descarga en curso o finalizada."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}

    job = model_manager.get_download_progress(repo_id)
    if job is None:
        return {"error": "No hay descarga conocida para este modelo", "repo_id": repo_id}
    return job.model_dump()


@app.get("/models/downloads")
async def list_downloads():
    """Lista todas las descargas activas o recientes."""
    if model_manager is None:
        return {"error": "ModelManager no inicializado"}

    jobs = model_manager.list_active_downloads()
    return {"downloads": [job.model_dump() for job in jobs]}


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
        print(f"[backend] [GENERATE] raw payload keys={list(payload.keys())} duration={payload.get('duration', '<missing>')} t_shift={payload.get('t_shift', '<missing>')}")
        request = GenerationRequest(**payload)
        print(f"[backend] [GENERATE] start text_len={len(request.text)} ref={request.reference_audio_path} duration={request.duration} t_shift={request.t_shift}")
        result = voice_cloning_service.generate(request)
        if result.success:
            print(f"[backend] [GENERATE] success duration={result.duration_seconds:.2f}s model={result.model_used} path={result.output_path}")
        else:
            print(f"[backend] [GENERATE] failed error={result.error_message}")
        return result.model_dump()
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[backend] [GENERATE] exception error={str(e)}\n{tb}")
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
        print(f"[backend] [GENERATE_FROM_CLIP] raw payload keys={list(payload.keys())} duration={payload.get('duration', '<missing>')} t_shift={payload.get('t_shift', '<missing>')}")
        request = GenerationFromClipRequest(**payload)
        print(f"[backend] [GENERATE_FROM_CLIP] start text_len={len(request.text)} video={request.video_path} ab={request.start_time:.2f}-{request.end_time:.2f} duration={request.duration} t_shift={request.t_shift}")
        result = voice_cloning_service.generate_from_clip(request)
        if result.success:
            print(f"[backend] [GENERATE_FROM_CLIP] success duration={result.duration_seconds:.2f}s model={result.model_used} path={result.output_path}")
        else:
            print(f"[backend] [GENERATE_FROM_CLIP] failed error={result.error_message}")
        return result.model_dump()
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[backend] [GENERATE_FROM_CLIP] exception error={str(e)}\n{tb}")
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


# ============================================================
# Subtitle extraction helpers
# ============================================================

def _parse_srt_time(t: str) -> float:
    """Parse '00:00:00,000' or '00:00:00.000' to seconds."""
    t = t.strip().replace('.', ',')
    h, m, s = t.split(':')
    sec, ms = s.split(',')
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


def _parse_srt(text: str, start: float = 0, end: float | None = None) -> str:
    lines = text.splitlines()
    result: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line or not line.isdigit():
            i += 1
            continue
        i += 1
        if i >= len(lines):
            break
        time_line = lines[i].strip()
        i += 1
        if '-->' not in time_line:
            continue
        parts = time_line.split('-->')
        if len(parts) != 2:
            continue
        try:
            sub_start = _parse_srt_time(parts[0])
            sub_end = _parse_srt_time(parts[1])
        except Exception:
            continue
        block_lines: list[str] = []
        while i < len(lines) and lines[i].strip():
            block_lines.append(lines[i].strip())
            i += 1
        if sub_end < start:
            continue
        if end is not None and sub_start > end:
            continue
        if block_lines:
            result.append(' '.join(block_lines))
    return '\n'.join(result)


def _get_subtitle_tracks(video_path: str) -> dict:
    if not os.path.exists(video_path):
        return {"success": False, "error": "Video file not found"}
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-print_format", "json", video_path],
            capture_output=True,
            text=True,
            check=True,
        )
        data = json.loads(probe.stdout)
        tracks = []
        for s in data.get("streams", []):
            if s.get("codec_type") != "subtitle":
                continue
            tracks.append({
                "index": s.get("index"),
                "codec_name": s.get("codec_name", ""),
                "language": s.get("tags", {}).get("language", "unknown"),
                "title": s.get("tags", {}).get("title", ""),
                "disposition": s.get("disposition", {}),
            })
        return {"success": True, "tracks": tracks}
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"ffprobe error: {e.stderr or e.stdout or str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Supported text-based subtitle codecs. Image-based codecs (PGS/VOBSUB/DVB)
# cannot be returned as plain text.
_TEXT_SUBTITLE_CODECS = {"subrip", "srt", "ass", "ssa", "webvtt", "mov_text"}


def _extract_subtitle_text(video_path: str, start: float = 0, end: float | None = None, track_index: int | None = None) -> dict:
    if not os.path.exists(video_path):
        return {"success": False, "error": "Video file not found"}
    try:
        tracks_res = _get_subtitle_tracks(video_path)
        if not tracks_res.get("success"):
            return tracks_res
        tracks = tracks_res.get("tracks", [])
        if not tracks:
            return {"success": False, "error": "No subtitle streams found"}

        if track_index is not None:
            stream = next((t for t in tracks if t["index"] == track_index), None)
            if stream is None:
                return {"success": False, "error": f"Subtitle track {track_index} not found"}
        else:
            text_tracks = [t for t in tracks if t.get("codec_name", "").lower() in _TEXT_SUBTITLE_CODECS]
            if not text_tracks:
                return {"success": False, "error": "No text-based subtitle streams found (image-based subtitles cannot be extracted as text)"}
            stream = text_tracks[0]

        codec = stream.get("codec_name", "").lower()
        if codec not in _TEXT_SUBTITLE_CODECS:
            return {"success": False, "error": f"Selected subtitle track uses image-based codec '{codec}' and cannot be extracted as text"}

        suffix = ".srt" if codec in ("subrip", "srt", "mov_text") else ".ass" if codec in ("ass", "ssa") else ".vtt"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode="w", encoding="utf-8") as f:
            tmp_path = f.name
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", video_path, "-map", f"0:{stream['index']}", tmp_path],
                capture_output=True,
                text=True,
                check=True,
            )
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                raw = f.read()
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        if suffix == ".srt":
            text = _parse_srt(raw, start, end)
        elif suffix == ".vtt":
            # VTT syntax is close enough to SRT for the block parser.
            text = _parse_srt(raw, start, end)
        else:
            # For ASS return raw text for now; callers can parse if needed.
            text = raw

        return {
            "success": True,
            "text": text,
            "language": stream.get("language", "unknown"),
            "codec": codec,
            "track_index": stream.get("index"),
            "stream_count": len(tracks),
        }
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"ffmpeg/ffprobe error: {e.stderr or e.stdout or str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Whisper model cache (lives for the lifetime of the backend process).
_whisper_model = None
_whisper_model_name: Optional[str] = None


def _load_whisper_model(model_size: str = "base"):
    global _whisper_model, _whisper_model_name
    import whisper
    if _whisper_model is None or _whisper_model_name != model_size:
        print(f"[backend] Loading Whisper model '{model_size}'...")
        _whisper_model = whisper.load_model(model_size)
        _whisper_model_name = model_size
        print(f"[backend] Whisper model '{model_size}' loaded.")
    return _whisper_model


def _transcribe_with_whisper(
    video_path: str,
    start: float = 0,
    end: float | None = None,
    language: Optional[str] = None,
    model_size: str = "base",
) -> dict:
    if not os.path.exists(video_path):
        return {"success": False, "error": "Video file not found"}

    duration = (end if end is not None else 1e9) - start
    if duration <= 0:
        return {"success": False, "error": "Invalid A-B range"}
    if duration > 120:
        return {"success": False, "error": "ASR segment too long (maximum 120 seconds)"}

    try:
        import whisper
    except ImportError:
        return {"success": False, "error": "Whisper is not installed in the backend"}

    audio_tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            audio_tmp = f.name
        ffmpeg_args = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", video_path,
            "-t", str(duration),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            audio_tmp,
        ]
        subprocess.run(ffmpeg_args, capture_output=True, text=True, check=True)

        model = _load_whisper_model(model_size)
        kwargs = {"language": language} if language else {}
        result = model.transcribe(audio_tmp, **kwargs)

        return {
            "success": True,
            "text": (result.get("text") or "").strip(),
            "language": result.get("language"),
            "model": model_size,
        }
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"ffmpeg error: {e.stderr or e.stdout or str(e)}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if audio_tmp:
            try:
                os.unlink(audio_tmp)
            except OSError:
                pass


@app.post("/media/subtitle_tracks")
async def subtitle_tracks(payload: dict):
    """List embedded subtitle streams (index, codec, language, title)."""
    video_path = payload.get("path") or payload.get("video_path")
    return _get_subtitle_tracks(video_path)


@app.post("/media/extract_subtitles")
async def extract_subtitles(payload: dict):
    """Extract a text-based embedded subtitle stream and return plain text for the A-B range."""
    video_path = payload.get("path") or payload.get("video_path")
    start_time = payload.get("startTime") or payload.get("start_time") or 0
    end_time = payload.get("endTime") or payload.get("end_time")
    track_index = payload.get("trackIndex") or payload.get("track_index")
    return _extract_subtitle_text(video_path, start_time, end_time, track_index)


@app.post("/media/transcribe")
async def transcribe_audio(payload: dict):
    """Transcribe the A-B audio segment using OpenAI Whisper (ASR fallback)."""
    video_path = payload.get("path") or payload.get("video_path")
    start_time = payload.get("startTime") or payload.get("start_time") or 0
    end_time = payload.get("endTime") or payload.get("end_time")
    language = payload.get("language")
    model_size = payload.get("model") or payload.get("model_size") or "base"
    return _transcribe_with_whisper(video_path, start_time, end_time, language, model_size)


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
