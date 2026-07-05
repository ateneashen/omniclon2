# ADR-0001: Hybrid Architecture (Tauri + React + Python FastAPI + PyTorch)

**Status:** Accepted  
**Date:** 2026-06 (start of rewrite)  
**Deciders:** User + Grok (following explicit requirements)

## Context

The previous OmniClon prototype used a pure Tauri + Rust (tract-onnx) approach with the explicit goal of "no Python dependencies." 

The new requirements are:
- Must achieve **at least the same voice cloning power** as the voice cloning section of OmniVoice-Studio2.
- Must use **PyTorch** and the same tools/engines as OmniVoice.
- Must be robust, professional, and scalable.
- Must support high-quality zero-shot cloning (k2-fsa/OmniVoice family and similar modern models).

Pure Rust ML runtimes (tract-onnx, etc.) are currently insufficient for delivering production-grade zero-shot voice cloning quality and breadth comparable to the reference.

## Decision

We will use a **hybrid architecture**:

- **Frontend**: Tauri 2 + React 19 + TypeScript (native desktop shell + rich UI)
- **Backend**: Python FastAPI application (heavy lifting)
- **ML**: PyTorch (via the same models and adapters used in OmniVoice-Studio2)
- **Communication**: Primarily localhost HTTP (frontend ↔ Python backend)
- **Process Management**: Rust side owns spawning, health checking, lifecycle, and logging of the Python process (sidecar pattern)

This is the exact pattern successfully used and battle-tested in `OmniVoice-Studio2`.

## Consequences

**Positive:**
- Immediate access to the full power and model ecosystem of OmniVoice (zero-shot TTS, speaker cloning utilities, robust ffmpeg handling, etc.).
- Much faster iteration on ML features (Python is far more productive for this domain).
- Proven first-run bootstrap experience (uv-managed venv, frozen bundles, live progress, repair flows).
- Clean separation: Rust owns reliability/native concerns; Python owns intelligence.
- Frontend remains portable (can later run against a remote backend if desired).

**Negative / Trade-offs:**
- Increased complexity in build/packaging (PyInstaller + Tauri bundling, venv management, sidecar resolution).
- Larger bundle size (mitigated by the reference's exclusion work and lazy loading).
- Cold start time on first run (acceptable behind a good splash + progress UI).

**Mitigations:**
- We will adapt the proven bootstrap + sidecar code from OmniVoice-Studio2 (`backend.rs`, `bootstrap.rs`, etc.) rather than reinventing it.
- Dedicated diagnostic logging system will be built from day one to make debugging the hybrid boundary fast (especially for the AI during development).
- Strict focus on a clean, focused voice-cloning subset (no unnecessary dub/translation bloat in the initial backend).

## Alternatives Considered

1. **Pure Rust (tract-onnx / candle / etc.)** — Rejected. Cannot meet the "same power as OmniVoice cloning" requirement in reasonable time.
2. **Tauri + Rust with Python only for heavy models via FFI or separate process** — More complex than full hybrid, less maintainable, still requires most of the bootstrap complexity.
3. **Electron + Python** — Rejected in favor of Tauri (lighter, better native feel, already used successfully in the reference).

## References

- Approved OmniClon 2 Rewrite Plan (Phase 0–4)
- OmniVoice-Studio2 implementation: `frontend/src-tauri/src/backend.rs`, `bootstrap.rs`, `backend/main.py`
- Model catalog and detection patterns in `backend/api/routers/setup/models.py`

---

**This ADR is the foundation of the entire rewrite.** All subsequent technical decisions should reference it.
