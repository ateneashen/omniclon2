# OmniClon 2 — Voice Clone Studio (Rewrite)

**Clean, professional, powerful voice cloning application** focused on high-quality zero-shot cloning + the signature **A/B Roll** workflow for character-specific voice adaptation from video clips.

This is a **complete from-scratch rewrite** (started June 2026) with no legacy code from the previous OmniClon prototype.

## Core Philosophy

- Professional-grade voice cloning power (matching or exceeding OmniVoice-Studio2's cloning capabilities)
- Excellent interactive A/B Roll for precise character reference extraction
- True autonomy: works anywhere, with smart shared/dedicated model management
- PyTorch + the same engines and tools as OmniVoice-Studio2 (hybrid architecture)
- Best-in-class observability for rapid development and debugging (especially AI-assisted)

## Current Status

**Rewrite Phase:** 0 — Foundation & Diagnostics (in progress)

See [docs/REWRITE_PROGRESS.md](docs/REWRITE_PROGRESS.md) for the living chronicle of this rewrite.

## Key Features (Target)

- Drag & drop video import + rich timeline with waveform
- **Signature A/B Roll**: Precise visual segmentation with draggable A/B markers, loop, keyboard control, character naming
- Real zero-shot voice cloning using strong PyTorch models (OmniVoice family + others)
- Voice Profile library (save, manage, lock, reuse references)
- Professional model management: shared with OmniVoice by default + one-click copy to dedicated folder for full autonomy
- First-run experience with live progress + rich diagnostics
- Robust, portable, user-friendly, visually excellent

## Architecture (Approved)

**Hybrid (Tauri + React frontend + Python FastAPI + PyTorch backend)**

This is the same proven pattern used successfully by OmniVoice-Studio2:
- Rust (Tauri) owns process lifecycle, bootstrap, sidecars, and native concerns
- Python backend owns all heavy ML (PyTorch), TTS engines, ffmpeg utilities, profile storage
- Frontend communicates primarily via localhost HTTP (clean + portable)

See `docs/ARCHITECTURE.md` and the ADRs in `docs/ADR/`.

## Model Strategy

- **Autonomous by default**: OmniClon 2 keeps its own model weights inside `data/models/`. The primary voice-cloning engine (`k2-fsa_OmniVoice`) is loaded from `data/models/k2-fsa_OmniVoice`, with no runtime dependency on `C:\AI\OmniVoice-Studio2`, `C:\AI\OmniVoice-Studio`, or `C:\AI\OmniVoice`.
- **Shared mode (legacy)**: Optionally read from an existing OmniVoice models folder to save disk space. This is no longer the default and must be configured manually.
- **Autonomy path**: One-click "Copy selected models to dedicated OmniClon folder" + toggle.
- Full support for downloading new models, custom HF repos, and validation.

## Hardware Optimization

The backend automatically detects CUDA and loads the model on the GPU with `float16` when available. It was tuned and validated on the machine's RTX 3090 + CUDA 12.4.

## Development & Debugging

This project was designed from day one with excellent diagnostic logging specifically to enable fast AI-assisted debugging.

- Dedicated structured debug logs (`logs/omniclon2-debug.log`)
- Easy tail commands for the AI
- UI diagnostics panel
- Full context on every cloning / model / A-B operation

See [docs/DEBUGGING.md](docs/DEBUGGING.md) (to be created in Phase 0).

## Getting Started (Development)

(Instructions will be added once Phase 0 bootstrap is stable)

## License

MIT (to be confirmed)

---

**This is a clean rewrite.** The previous prototype in `C:\AI\OmniClon` is untouched and will remain as historical reference only. All new work happens here in `C:\AI\OmniClon2`.