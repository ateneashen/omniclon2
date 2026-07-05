"""
Voice Cloning Service — OmniClon 2 (autonomous, PC-optimized)

Real high-quality zero-shot voice cloning using k2-fsa/OmniVoice.
The service is now fully self-contained inside the OmniClon 2 project:
  - Model weights live in PROJECT_ROOT/data/models/k2-fsa_OmniVoice
  - Python inference code lives in backend/omnivoice (copied from upstream)
  - No runtime dependency on C:\AI\OmniVoice-Studio2

Optimized for the user's RTX 3090 (CUDA 12.4) with float16 and direct CUDA placement.
A reference-driven placeholder is kept as a safety net if real inference fails.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

import torch
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Project layout
# ---------------------------------------------------------------------------

SERVICE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVICE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

AUTONOMOUS_MODEL_ROOT = PROJECT_ROOT / "data" / "models"
AUTONOMOUS_K2_PATH = AUTONOMOUS_MODEL_ROOT / "k2-fsa_OmniVoice"


def to_short_path(path: str) -> str:
    """Return the Windows short (8.3) path for a given path if possible.

    Some downstream C++/Python libraries (e.g. OmniVoice's audio tokenizer)
    do not handle Unicode or spaces in file paths well on Windows. Using the
    short path is a robust workaround.
    """
    if sys.platform != "win32":
        return path
    try:
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.windll.kernel32
        buf_size = wintypes.DWORD(4096)
        buf = ctypes.create_unicode_buffer(4096)
        ret = kernel32.GetShortPathNameW(path, buf, buf_size)
        if ret and ret < buf_size.value:
            return buf.value
    except Exception as e:
        print(f"[VoiceCloningService] to_short_path failed ({e}), using original path")
    return path


# ---------------------------------------------------------------------------
# Request / result schemas
# ---------------------------------------------------------------------------

class GenerationRequest(BaseModel):
    reference_audio_path: str
    text: str
    emotion: Optional[str] = None
    model_repo: Optional[str] = None

    # Transcript of the reference audio. If provided, improves alignment.
    # If omitted/empty, the backend will try to auto-transcribe with ASR,
    # falling back to empty reference text if ASR is unavailable.
    ref_text: Optional[str] = None

    # OmniVoice generation tuning options (the "tags" the user asked for)
    speed: float = 1.0
    num_step: int = 24
    guidance_scale: float = 2.0
    denoise: bool = True
    postprocess_output: bool = True
    language: Optional[str] = None          # "es", "en", etc. Auto-detected if None
    instruct: Optional[str] = None          # Voice-design style instruction
    duration: Optional[float] = None        # Fixed output duration in seconds
    t_shift: Optional[float] = None         # Time-step shift (advanced)


class GenerationFromClipRequest(BaseModel):
    video_path: str
    start_time: float
    end_time: float
    text: str

    # Optional transcript of the A-B segment. Greatly improves text alignment.
    ref_text: Optional[str] = None

    # Same tuning options as GenerationRequest
    speed: float = 1.0
    num_step: int = 24
    guidance_scale: float = 2.0
    denoise: bool = True
    postprocess_output: bool = True
    language: Optional[str] = None
    instruct: Optional[str] = None
    duration: Optional[float] = None
    t_shift: Optional[float] = None


class GenerationResult(BaseModel):
    success: bool
    output_path: Optional[str] = None
    audio_base64: Optional[str] = None
    error_message: Optional[str] = None
    duration_seconds: Optional[float] = None
    model_used: Optional[str] = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class VoiceCloningService:
    def __init__(self, model_manager=None):
        self.model_manager = model_manager
        self._initialized = False
        self.available_models: dict[str, str] = {}
        self.primary_cloning_model: Optional[str] = None
        self.model_path: Optional[Path] = None
        self._k2fsa_loaded = False
        self._k2fsa_files_verified = False
        self.device: str = "cuda" if torch.cuda.is_available() else "cpu"
        self.real_omnivoice = None
        self.omnivoice_config: Optional[dict] = None

    def initialize(self) -> bool:
        print("[VoiceCloningService] Initializing autonomous voice cloning...")
        print(f"[VoiceCloningService] Project root: {PROJECT_ROOT}")
        print(f"[VoiceCloningService] Autonomous model root: {AUTONOMOUS_MODEL_ROOT}")

        candidates = [AUTONOMOUS_K2_PATH]

        # If a model manager reports a dedicated/shared root, also consider it
        if self.model_manager is not None:
            try:
                active_root = Path(self.model_manager.get_active_models_root())
                if active_root != AUTONOMOUS_MODEL_ROOT:
                    candidates.append(active_root / "k2-fsa_OmniVoice")
            except Exception as e:
                print(f"[VoiceCloningService] Could not read model manager root: {e}")

        # NOTE: OmniClon 2 is intentionally autonomous. We do NOT fall back to
        # C:\AI\OmniVoice-Studio2 or similar external installs at runtime.
        chosen = None
        for cand in candidates:
            if cand.exists() and (cand / "config.json").exists() and (cand / "model.safetensors").exists():
                chosen = cand
                print(f"[VoiceCloningService] Found k2-fsa_OmniVoice at: {cand}")
                break

        if chosen is None:
            print("[VoiceCloningService] WARNING: k2-fsa_OmniVoice not found. Placeholder-only mode.")
            self.primary_cloning_model = None
            self.model_path = None
            self._initialized = True
            return True

        self.model_path = chosen
        self.primary_cloning_model = "k2-fsa_OmniVoice"

        try:
            with open(self.model_path / "config.json", "r", encoding="utf-8") as f:
                self.omnivoice_config = json.load(f)
            self._k2fsa_files_verified = True
        except Exception as e:
            print(f"[VoiceCloningService] Error reading config.json: {e}")
            self._initialized = True
            return True

        self._try_load_k2fsa()
        self._initialized = True
        return True

    def generate(self, request: GenerationRequest) -> GenerationResult:
        if not self._initialized:
            self.initialize()

        request.reference_audio_path = to_short_path(request.reference_audio_path)
        print(f"[VoiceCloningService] Generation requested: '{request.text[:80]}...'")
        print(f"[VoiceCloningService] Reference: {request.reference_audio_path}")
        print(f"[VoiceCloningService] Primary model: {self.primary_cloning_model} | k2 loaded: {self._k2fsa_loaded}")

        ref_path = Path(request.reference_audio_path)
        if not ref_path.exists():
            return GenerationResult(
                success=False,
                error_message="La referencia de audio no existe en disco.",
            )

        output_dir = PROJECT_ROOT / "data" / "generations"
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = int(time.time())
        safe_text = "".join(c if c.isalnum() or c in " _-" else "_" for c in request.text[:30]).strip()
        output_name = f"generated_{timestamp}_{safe_text}.wav" if safe_text else f"generated_{timestamp}.wav"
        output_path = output_dir / output_name

        # 1. Try real k2-fsa_OmniVoice inference first
        if self._k2fsa_loaded and self.real_omnivoice is not None:
            real_result = self._generate_with_k2fsa(request, output_path)
            if real_result is not None:
                return real_result

        # 2. High-quality reference placeholder
        try:
            duration, _ = self._generate_from_reference(ref_path, request.text, output_path)
            model_used = (
                f"{self.primary_cloning_model or 'voice-ref'} "
                "(grain-crossfade ref placeholder; real k2-fsa not active)"
            )
        except Exception as pherr:
            print(f"[VoiceCloningService] Ref-placeholder failed ({pherr}), using last-resort copy.")
            import numpy as np
            import soundfile as sf
            data, sr = sf.read(str(ref_path))
            if data.ndim > 1:
                data = data.mean(1)
            target_d = max(1.5, len(request.text) / 16.0)
            ts = int(target_d * sr)
            if len(data) > 0:
                idx = np.linspace(0, len(data) - 1, ts)
                out = np.interp(idx, np.arange(len(data)), data).astype(data.dtype)
            else:
                out = np.zeros(ts, dtype="float32")
            sf.write(str(output_path), out, sr)
            duration = target_d
            model_used = (self.primary_cloning_model or "ref") + " (basic stretch)"

        with open(output_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")

        print(f"[VoiceCloningService] Generated audio using {model_used} -> {output_path}")
        return GenerationResult(
            success=True,
            output_path=str(output_path),
            audio_base64=audio_b64,
            duration_seconds=duration,
            error_message=None,
            model_used=model_used,
        )

    def generate_from_clip(self, request: GenerationFromClipRequest) -> GenerationResult:
        """Extract A-B segment from a video and generate cloned voice in one step."""
        if not self._initialized:
            self.initialize()

        video_path = Path(to_short_path(request.video_path))
        if not video_path.exists():
            return GenerationResult(success=False, error_message="El video de origen no existe en disco.")

        duration = request.end_time - request.start_time
        if duration < 0.5:
            return GenerationResult(success=False, error_message="La selección A-B es muy corta (mínimo 0.5 segundos).")
        if duration > 20.0:
            return GenerationResult(success=False, error_message="La selección A-B es muy larga (máximo 20 segundos).")
        if duration > 10.0:
            print(f"[VoiceCloningService] WARNING: A-B reference is {duration:.1f}s long. OmniVoice recommends 3-10s for best quality.")

        temp_dir = PROJECT_ROOT / "data" / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        ref_path = temp_dir / f"ref_{request.start_time:.2f}_{request.end_time:.2f}_{uuid.uuid4()}.wav"

        try:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(request.start_time),
                "-t", str(duration),
                "-i", str(video_path),
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "24000",
                "-ac", "1",
                str(ref_path),
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            err = e.stderr.decode("utf-8", errors="ignore")[:500]
            return GenerationResult(success=False, error_message=f"ffmpeg no pudo extraer el segmento: {err}")
        except FileNotFoundError:
            return GenerationResult(success=False, error_message="ffmpeg no está disponible en el PATH del backend.")

        try:
            gen_request = GenerationRequest(
                reference_audio_path=str(ref_path),
                text=request.text,
                ref_text=request.ref_text,
                speed=request.speed,
                num_step=request.num_step,
                guidance_scale=request.guidance_scale,
                denoise=request.denoise,
                postprocess_output=request.postprocess_output,
                language=request.language,
                instruct=request.instruct,
                duration=request.duration,
                t_shift=request.t_shift,
            )
            result = self.generate(gen_request)
        finally:
            try:
                if ref_path.exists():
                    ref_path.unlink()
            except Exception:
                pass

        return result

    def is_ready(self) -> bool:
        return self._initialized

    # -----------------------------------------------------------------------
    # Real k2-fsa loading
    # -----------------------------------------------------------------------

    def _try_load_k2fsa(self) -> bool:
        mp = self.model_path
        if mp is None or not mp.exists():
            return False

        main_cfg = mp / "config.json"
        main_w = mp / "model.safetensors"
        tok_dir = mp / "audio_tokenizer"
        tok_w = tok_dir / "model.safetensors"

        if not (main_cfg.exists() and main_w.exists() and tok_w.exists()):
            print("[VoiceCloningService] k2-fsa_OmniVoice: required weight files missing.")
            return False

        self._k2fsa_files_verified = True
        print(f"[VoiceCloningService] k2-fsa_OmniVoice assets verified: {mp}")
        print(f"  main weights: {main_w.stat().st_size / 1e9:.2f} GB")
        print(f"  audio_tokenizer: {tok_w.stat().st_size / 1e9:.2f} GB")

        try:
            from omnivoice.models.omnivoice import OmniVoice

            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.device = device
            dtype = torch.float16 if device == "cuda" else torch.float32

            print(f"[VoiceCloningService] Loading real OmniVoice with device={device}, dtype={dtype}...")

            # Load with PC-optimized settings
            model = OmniVoice.from_pretrained(
                str(mp),
                load_asr=False,
                torch_dtype=dtype,
                device_map=device,
                trust_remote_code=True,
            )

            # Ensure inference mode
            model.eval()

            self.real_omnivoice = model
            self._k2fsa_loaded = True
            print("[VoiceCloningService] >>> REAL k2-fsa_OmniVoice loaded successfully (autonomous).")
            return True

        except Exception as e:
            print(f"[VoiceCloningService] Could not load real OmniVoice: {e}")
            print("[VoiceCloningService] Falling back to reference placeholder.")
            self._k2fsa_loaded = False
            self.real_omnivoice = None
            return False

    # -----------------------------------------------------------------------
    # Real k2-fsa generation
    # -----------------------------------------------------------------------

    def _detect_language(self, text: str) -> str:
        """Simple language hint for the TTS model.

        OmniVoice accepts language names or ISO codes. We default to Spanish
        for the user's content, but switch to English if the text looks mostly
        ASCII without Spanish-specific characters.
        """
        text_lower = text.lower()
        spanish_marks = {"á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"}
        if any(c in spanish_marks for c in text_lower):
            return "es"
        # Heuristic: mostly ASCII with common English words
        english_words = {"the", "and", "is", "are", "hello", "test", "this", "a", "of", "to"}
        words = set(text_lower.split())
        if words & english_words:
            return "en"
        return "es"

    def _generate_with_k2fsa(self, request: GenerationRequest, output_path: Path) -> Optional[GenerationResult]:
        if not self._k2fsa_loaded or self.real_omnivoice is None:
            return None

        print("[VoiceCloningService] >>> Using REAL k2-fsa_OmniVoice inference")
        try:
            import soundfile as sf

            lang = request.language if request.language else self._detect_language(request.text)

            # Determine reference text: user-provided > ASR auto-transcribe > empty string fallback.
            ref_text_value: Optional[str] = None
            if request.ref_text and request.ref_text.strip():
                ref_text_value = request.ref_text.strip()
                print(f"[VoiceCloningService] Using user-provided ref_text ({len(ref_text_value)} chars)")
            else:
                try:
                    print("[VoiceCloningService] Attempting ASR auto-transcription of reference...")
                    ref_text_value = self.real_omnivoice.create_voice_clone_prompt(
                        request.reference_audio_path, ref_text=None
                    ).ref_text
                    print(f"[VoiceCloningService] ASR ref_text: {ref_text_value[:80]}...")
                except Exception as asr_err:
                    print(f"[VoiceCloningService] ASR failed ({asr_err}), using empty ref_text fallback.")
                    ref_text_value = ""

            # PC-optimized generation settings:
            # - ref_text alignment greatly reduces dropped words / prefix omission.
            # - num_step=24 is a good speed/quality trade-off on RTX 3090.
            # - language hint improves prosody for Spanish content.
            generate_kwargs = {
                "text": request.text,
                "ref_audio": request.reference_audio_path,
                "ref_text": ref_text_value,
                "language": lang,
                "num_step": request.num_step,
                "guidance_scale": request.guidance_scale,
                "speed": request.speed,
                "denoise": request.denoise,
                "postprocess_output": request.postprocess_output,
            }
            if request.instruct:
                generate_kwargs["instruct"] = request.instruct
            if request.duration is not None and request.duration > 0:
                generate_kwargs["duration"] = request.duration
            if request.t_shift is not None:
                generate_kwargs["t_shift"] = request.t_shift

            audio_tensors = self.real_omnivoice.generate(**generate_kwargs)

            # generate returns list of (1, T) tensors
            if isinstance(audio_tensors, (list, tuple)):
                audio_tensor = audio_tensors[0]
            else:
                audio_tensor = audio_tensors

            if isinstance(audio_tensor, torch.Tensor):
                audio_np = audio_tensor.detach().cpu().squeeze().numpy()
            else:
                audio_np = audio_tensor

            if audio_np.ndim > 1:
                audio_np = audio_np[0]

            sr = getattr(self.real_omnivoice, "sampling_rate", 24000)
            sf.write(str(output_path), audio_np.astype("float32"), sr)

            duration = len(audio_np) / float(sr)
            model_used = "k2-fsa_OmniVoice (REAL inference, autonomous)"
            print(f"[VoiceCloningService] Real k2-fsa generation complete -> {output_path} ({duration:.2f}s)")

            with open(output_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode("utf-8")

            return GenerationResult(
                success=True,
                output_path=str(output_path),
                audio_base64=audio_b64,
                duration_seconds=duration,
                model_used=model_used,
            )
        except ValueError as e:
            # Re-raise validation errors (e.g. unsupported instruct) so the API
            # can return a clean HTTP 400 instead of silently falling back.
            raise
        except Exception as e:
            print(f"[VoiceCloningService] Real OmniVoice.generate() failed: {e}")
            return None

    # -----------------------------------------------------------------------
    # Reference-based placeholder (safety net)
    # -----------------------------------------------------------------------

    def _generate_from_reference(self, ref_path: Path, text: str, target_path: Path) -> tuple[float, str]:
        import numpy as np
        import soundfile as sf

        data, sr = sf.read(str(ref_path))
        if data.ndim > 1:
            data = data.mean(axis=1).astype(data.dtype)

        # Light silence trim
        if len(data) > sr // 4:
            rms = np.sqrt(np.convolve(data**2, np.ones(sr // 20) / (sr // 20), mode="same") + 1e-9)
            mask = rms > (0.012 * rms.max())
            if mask.any():
                i0, i1 = np.where(mask)[0][[0, -1]]
                i0 = max(0, i0 - sr // 50)
                i1 = min(len(data), i1 + sr // 50)
                if i1 - i0 > sr // 8:
                    data = data[i0:i1]

        ref_len = len(data)
        if ref_len < 64:
            sr = 24000
            data = np.zeros(sr * 2, dtype="float32")
            ref_len = len(data)

        n_chars = max(8, len((text or "").strip()))
        target_dur = max(1.4, min(38.0, n_chars / 17.0))
        target_samples = int(target_dur * sr)

        grain_len = int(0.42 * sr)
        overlap = int(0.10 * sr)
        step = grain_len - overlap
        if step < 64:
            step = max(64, grain_len // 2)
            overlap = max(32, grain_len // 4)

        out = np.zeros(target_samples, dtype=data.dtype)
        rng = np.random.default_rng(abs(hash(text)) % (2**32))
        pos = 0
        grain_count = 0
        max_grains = 512

        while pos < target_samples and grain_count < max_grains:
            base = (grain_count * step) % max(1, ref_len - grain_len)
            jitter = int(rng.integers(-overlap // 2, overlap // 2 + 1))
            start = max(0, min(base + jitter, ref_len - grain_len))
            grain = data[start:start + grain_len].copy()

            amp = 0.90 + rng.uniform(-0.07, 0.09)
            grain *= amp
            if rng.random() < 0.35 and len(grain) > 8:
                new_l = int(len(grain) * (0.96 + rng.random() * 0.08))
                if new_l >= 4:
                    idx = np.linspace(0, len(grain) - 1, new_l)
                    grain = np.interp(idx, np.arange(len(grain)), grain).astype(grain.dtype)
                    if len(grain) > grain_len:
                        grain = grain[:grain_len]
                    elif len(grain) < grain_len:
                        grain = np.pad(grain, (0, grain_len - len(grain)))

            remaining = target_samples - pos
            to_copy = min(len(grain), remaining)
            if to_copy <= 0:
                break
            g = grain[:to_copy]

            cf = min(overlap, to_copy // 2, 2400)
            if cf > 3 and pos > 0:
                fade = np.linspace(1.0, 0.0, cf).astype(out.dtype)
                out[pos:pos + cf] *= fade
                fade_in = np.linspace(0.0, 1.0, cf).astype(g.dtype)
                g[:cf] *= fade_in

            out[pos:pos + to_copy] += g
            pos += step
            grain_count += 1

        if len(out) > 64:
            noise = rng.standard_normal(len(out)).astype(out.dtype) * 0.0035
            noise[1:] = noise[1:] - 0.65 * noise[:-1]
            out = out + noise

        peak = float(np.max(np.abs(out)) or 1.0)
        if peak > 0.0:
            gain = min(0.97 / peak, 1.15)
            out = out * gain
        out = np.clip(out, -1.0, 1.0).astype("float32")

        try:
            ref_rms = float(np.sqrt(np.mean(data**2)) + 1e-9)
            out_rms = float(np.sqrt(np.mean(out**2)) + 1e-9)
            if out_rms > 1e-9 and ref_rms > 1e-9:
                out = out * (ref_rms / out_rms) * 0.95
                out = np.clip(out, -0.98, 0.98).astype("float32")
        except Exception:
            pass

        try:
            n = min(len(out), len(data))
            if n > 256:
                ref_c = data[len(data) // 3:len(data) // 3 + n]
                out_c = out[:n].copy()
                ref_f = np.abs(np.fft.rfft(ref_c))
                out_f = np.abs(np.fft.rfft(out_c))
                k = max(4, len(ref_f) // 32)
                env_ref = np.convolve(ref_f, np.ones(k) / k, mode="same") + 1e-9
                env_out = np.convolve(out_f, np.ones(k) / k, mode="same") + 1e-9
                corr = np.clip(env_ref / env_out, 0.6, 1.7)
                out_f = np.fft.rfft(out_c) * corr
                out[:n] = np.fft.irfft(out_f, n=n).astype(out.dtype)
                o_rms = float(np.sqrt(np.mean(out**2)) + 1e-9)
                if o_rms > 1e-9:
                    out = out * (ref_rms / o_rms) * 0.97
        except Exception:
            pass

        sf.write(str(target_path), out, sr)
        return target_dur, "grain-crossfade-variation+spectral"
