# OmniClon 2 — Architecture Overview

**High-level view of the system (living document).**

## Guiding Principles

- Clean rewrite — no legacy from the previous prototype.
- Hybrid by design (see ADR-0001).
- Professional reliability on first run and every run.
- Excellent observability (especially the dedicated diagnostic logging system).
- Focused scope for MVP: best-in-class A/B Roll + real high-quality voice cloning + model autonomy.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri 2 Desktop App (Rust)                                  │
│  • Native window, menus, tray                                │
│  • Process manager for Python backend (spawn / health / kill)│
│  • Sidecar resolution (uv, ffmpeg, ffprobe)                  │
│  • Bootstrap flow + splash screen                            │
│  • Diagnostic log access (tail + UI)                         │
│  • Portable mode detection                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ localhost HTTP (primary)
                       │ Tauri commands (lifecycle only)
┌──────────────────────▼──────────────────────────────────────┐
│  React 19 + TypeScript Frontend                              │
│  • Video editor-style UI (dark, professional)                │
│  • Media panel, Video Preview, A/B Timeline (core)           │
│  • Voice Panel + Profile Library                             │
│  • Model Management (shared/dedicated, download, validation) │
│  • Bootstrap Splash with live logs                           │
│  • Diagnostics viewer (for AI + power users)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────────┐
│  Python FastAPI Backend (PyTorch)                            │
│  • Routers: media, segments, profiles, generate, models, sys │
│  • Services: ffmpeg_utils, speaker_clone (A-B focused),      │
│    tts_backend (pluggable), model_manager, profile_store     │
│  • Strong structured logging → dedicated debug logs          │
│  • Model catalog (shared + dedicated modes)                  │
│  • Real zero-shot cloning engines (OmniVoice + others)       │
└─────────────────────────────────────────────────────────────┘
```

## Data & State

- **User data root** (respecting portable mode):
  - `voices/` — saved voice profiles + reference audio
  - `generations/` — exported audio
  - `logs/` — diagnostic logs (the most important for development)
  - `models/` (optional dedicated copy)
  - `cache/`, `temp/`, etc.

- **Models**:
  - Default: pointer to OmniVoice models directory + HF cache
  - Dedicated: full local copy under the app's data root

## Critical Subsystems (Phase 0 Priority)

1. **Bootstrap & Sidecar Management** (Rust)
2. **Dedicated Diagnostic Logging** (Rust + Python) — highest priority for fast iteration
3. **A/B Roll Timeline** (frontend + extraction backend)
4. **Model Management** (catalog + shared/dedicated + download)

## See Also

- ADR-0001 (Hybrid Architecture)
- `docs/REWRITE_PROGRESS.md`
- `docs/DEBUGGING.md` (to be expanded)
- `docs/MODEL_STRATEGY.md` (to be written in Phase 3)
- `docs/A-B-ROLL.md` (to be written during Phase 1)

---

This document will be expanded as the rewrite progresses.
