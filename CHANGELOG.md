# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-05

### Added
- **Single-instance guard**: the desktop app now blocks a second launch attempt and brings the existing window to the front. The event is logged to the diagnostics panel.
- **Automatic reference video restore**: loading a saved script now auto-imports the original reference video and restores the A/B roll region, audio track, and waveform.
- **GPU/CPU device visibility**: the bootstrap splash now shows whether the voice cloning engine is running on GPU (CUDA), Apple GPU (MPS), or CPU.
- `OMNICLON2_VOICE_DEVICE` environment variable to force "cuda", "cpu", or "mps" for voice inference.

### Changed
- Invalid `instruct` values now return HTTP 400 with OmniVoice's detailed validation message instead of falling back silently.
- Voice generation logs now include the actual inference device and elapsed time.

### Fixed
- Backend stdout/stderr forced to UTF-8 to avoid `UnicodeEncodeError` crashes when OmniVoice prints non-ASCII error text on Windows.

## [1.1.2] - 2026-07-05

### Fixed
- Invalid `instruct` values now return HTTP 400 with a clear error message instead of silently falling back to placeholder audio.
- `ValueError` from OmniVoice validation is propagated to the API instead of being swallowed by the fallback path.

## [1.1.1] - 2026-07-05

### Fixed
- `/generate_from_clip` no longer returns HTTP 500 when OmniVoice rejects an unsupported `instruct` containing non-ASCII characters.
- Backend stdout/stderr forced to UTF-8 to prevent `UnicodeEncodeError` crashes on Windows when printing error messages with Chinese text.
- Invalid generation requests now return HTTP 400 instead of raising an unhandled 500.

## [1.1.0] - 2026-07-05

### Added
- **Automatic model downloader**: download missing models directly from Hugging Face inside the app.
- Progress tracking with backend polling for model downloads.
- Download buttons in Models panel and per-model rows.
- Bulk "Download all missing" action in Models panel.
- Integrated download prompt in BootstrapSplash when the critical voice-cloning model is missing.

### Changed
- Bumped all manifests and UI version badge to v1.1.0.

---

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
