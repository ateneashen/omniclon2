# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-07-05

### Added
- New **Logs** tab in the left panel to view debug and error logs directly in the UI.
- Auto-refreshing log viewer with copy-to-clipboard support.

### Changed
- Backend Python process now runs without a visible console window on Windows.
- Captured backend output remains available in the Logs tab and diagnostic files.

---

## [1.0.0] - 2026-07-05

### Added
- Complete video → A/B Roll → voice clone → WAV export workflow.
- NLE-style video editor with real waveform, draggable playhead, and V1/A1 track headers.
- A/B Roll segmentation with draggable handles, keyboard shortcuts (`I`/`O`, arrows, space), and loop.
- Zero-shot voice cloning using `k2-fsa/OmniVoice` weights loaded from the local `data/models/` folder.
- Voice generation tuning UI: speed, num_step, guidance_scale, denoise, postprocess, language, instruct, duration, t_shift.
- Script/library snapshots that persist text, A/B region, transcription, audio/subtitle tracks, and voice options.
- Frame capture from video via ffmpeg, with "Save as…" support.
- Autonomous model management: dedicated `data/models/` folder plus optional shared mode with OmniVoice-Studio2.
- Non-destructive "copy models to dedicated folder" operation with disk-space checks.
- Bootstrap splash screen with live backend status, model detection, and diagnostic log viewer.
- Diagnostics panel and structured logs for rapid AI-assisted debugging.
- Persistent generation options in `localStorage`.
- Direct WAV export using Tauri dialog + filesystem APIs.
- Windows launcher (`OmniClon2-Launcher.bat`) with dev, build, backend-only, dependency install, smoke tests, and system info modes.

### Changed
- UI language unified to Spanish for primary user-facing labels and hints.
- Timeline timecode now uses milliseconds instead of assuming a fixed 30 fps frame rate.
- ffmpeg frame capture uses output-side seek for frame-accurate grabs.

### Fixed
- Backend port conflicts: a healthy existing backend is adopted instead of failing on re-launch.
- System-wide HTTP proxy no longer breaks localhost backend communication.
- A/B segment extraction uses seek-before-input for cleaner cuts.
- WAV parsing made robust with the `hound` crate.
- Model detection now verifies real model files (`config.json`, `.safetensors`, etc.) instead of just folder names.

### Technical
- Hybrid architecture: Tauri 2 (Rust) + React 19 + TypeScript frontend + FastAPI Python backend.
- Backend dependencies managed with `uv`; frontend dependencies managed with `npm`.
- Line endings normalized via `.gitattributes`.
