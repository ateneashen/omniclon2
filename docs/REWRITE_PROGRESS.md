# OmniClon 2 — Rewrite Progress Log

**Living document.** Every significant step, decision, problem found, and solution is recorded here chronologically.  
This is the primary source of truth for the history of this clean rewrite.

---

## 2026-06-XX — Phase 0 Kickoff: Project Creation & Git

**Date:** Start of execution after plan approval  
**Actor:** Grok (following approved plan)

### Actions Taken
- Created clean directory `C:\AI\OmniClon2` (explicitly **not** touching `C:\AI\OmniClon` in any way).
- Initialized fresh Git repository (`git init`).
- Configured basic git user for commits during rewrite.
- Wrote initial `README.md` referencing the approved plan.
- Created folder skeleton: `docs/`, `docs/ADR/`, `logs/`, `scripts/`.

### Key Decisions Confirmed (from plan approval)
- Target: `C:\AI\OmniClon2`
- Architecture: Full hybrid (Tauri React + Python FastAPI + PyTorch sidecar) — same pattern as OmniVoice-Studio2
- Model strategy: Shared with OmniVoice by default + easy one-click copy to dedicated folder
- Diagnostic logging: Strong dedicated system from day 1 (highest priority for AI debugging)
- MVP Scope: Focused professional voice cloner with excellent A/B Roll + real cloning + model autonomy (no full dub pipeline in first version)

### Documentation Created
- `README.md` (high-level overview + philosophy)
- This `REWRITE_PROGRESS.md` (first entry)

### Next Immediate Work
1. Comprehensive `.gitignore` for hybrid Tauri + Python + ML workloads
2. Initial `docs/ARCHITECTURE.md` stub + ADR-0001 (Hybrid Architecture)
3. Scaffold Tauri frontend + Python backend using `uv`
4. **Critical**: Robust bootstrap + sidecar management (Rust) + the dedicated diagnostic logging system

### Notes / Observations
- Git history starts completely clean here. No baggage.
- All future commits will follow Conventional Commits where practical.
- The approved plan document lives at the session path (referenced in plan mode). Key decisions are being mirrored into this repo's docs.

**Status:** Phase 0 Foundation — Documentation & Repository initialized successfully.

---

## 2026-06-XX — Phase 0: Foundation Scaffolding Complete (Repo + Backend + Frontend)

**Milestone achieved:** Clean hybrid project skeleton is now in place.

### What Was Built
- Fresh Git repository at `C:\AI\OmniClon2` (completely independent of previous prototype).
- Core documentation:
  - `README.md`
  - `docs/REWRITE_PROGRESS.md` (this living log)
  - `docs/ARCHITECTURE.md`
  - `docs/ADR/0001-hybrid-architecture.md` (foundational decision)
- Comprehensive `.gitignore` tailored for Tauri + Python + heavy ML.
- **Python backend** (`backend/`):
  - Initialized with `uv` (Python 3.11)
  - FastAPI + uvicorn + core deps (pydantic, soundfile, numpy, etc.)
  - Clean `main.py` with lifespan, `/system/info` (critical for sidecar health checks), and `/health`.
- **Tauri frontend** (`frontend/` — reference layout):
  - `frontend/src-tauri/` (Rust) + `frontend/src/` (React 19 + TS)
  - Proper product naming ("OmniClon 2", identifier `com.omniclon.studio2`)
  - npm dependencies installed.

### Commits
- `375355f` — Initial clean repo + docs
- `d9575c7` — Python backend skeleton
- `57670fc` — Tauri frontend scaffold
- `cc46bd7` — Product naming fixes

### Observations
- `uv` is available and working well on this Windows machine.
- The reference layout (`frontend/src-tauri`) works cleanly.
- We now have a solid base to implement the most important Phase 0 deliverable: **the dedicated diagnostic logging system + robust sidecar bootstrap**.

**Next Critical Work (highest priority):**
- Port/adapt robust Rust sidecar management (`backend.rs` style)
- Build the **dedicated diagnostic logging system** (Rust + Python) designed for fast AI debugging
- Implement bootstrap stages + live log streaming to splash screen
- Tauri commands for logs, retry, clean, etc.

**Status:** Phase 0 — Foundation scaffolding complete. Ready for the hard parts (sidecar + logging).

---

## 2026-06-XX — Phase 0: Dedicated Diagnostic Logging System Implemented

**Major milestone:** The highest-priority feature for AI-assisted development during the rewrite is now live.

### What Was Delivered
- `frontend/src-tauri/src/diagnostics.rs`:
  - `omniclon2-debug.log` (high verbosity)
  - `omniclon2-errors.log` (clean, errors + warnings only)
  - `log_diagnostic()` and `log_error()` with rich component + context
  - `tail_errors()` and `tail_debug()` — exactly what the AI needs to quickly understand failures
- Exposed as Tauri commands (`tail_errors`, `tail_debug`, `log_diagnostic_event`)
- Automatically creates proper Windows logs directory under `%LOCALAPPDATA%\OmniClon2\Logs`
- First usage: App startup is already being logged to the new system

### Why This Matters
The user specifically requested strong error logs that I (the AI) can read on demand during testing and bug fixing. This module was built with that exact use case as the #1 design goal.

### Commits
- `566cdff` — Diagnostic logging foundation

### Next Steps
- Wire frontend (React) to use `log_diagnostic_event` for important actions (especially A/B Roll and cloning attempts)
- Continue building the Python side of logging (structured + also writing to the same dedicated files when possible)
- Move on to full sidecar bootstrap (launching the Python backend reliably)

**Status:** Phase 0 — Diagnostic logging system is operational. Excellent foundation for the rest of the rewrite.

---

## [Future entries will be added after every major milestone or difficult problem]

**Template for future entries:**
```
## YYYY-MM-DD — Phase X: Title

**Changes:**
- ...

**Problems Found + Solutions:**
- ...

**Documentation Updated:**
- ...

**Commit(s):**
- `abc1234` - message
```