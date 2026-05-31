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