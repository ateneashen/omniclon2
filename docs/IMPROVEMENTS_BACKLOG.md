# OmniClon 2 — Improvements Backlog

> **Baseline:** `v0.2.0-baseline` (commit `80b69c5`)  
> The app is currently functional end-to-end. All changes below are incremental enhancements.  
> **Recovery:** `git checkout v0.2.0-baseline` at any time.

---

## 1. Timeline / A-B UX (HIGH priority — visible, low risk)

| # | Improvement | Notes | Risk | Status |
|---|-------------|-------|------|--------|
| 1.1 | **Pro-style A/B selection** (Premiere/Final-Cut-like handles) | Larger, draggable handles with time labels, snap feedback, hover states. | Low | **Done** |
| 1.2 | **Auto-fit timeline for short vs. long videos** | Default zoom so the whole clip is visible on load; zoom in reveals detail. | Low | **Done** |
| 1.3 | **Waveform peaks upward** | Current samples are absolute-value only; draw positive and negative amplitudes so peaks go up and troughs go down. | Low | **Done** |
| 1.4 | **Nicer waveform visualization** | Gradient fill, anti-aliased bars, optional RMS smoothing. | Low | **Done** |
| 1.5 | **Playhead improvements** | Thinner line, time tooltip on drag, center-on-play option, playhead follows playback. | Low | **Done** |
| 1.6 | **If A is set after B, move B to A and preview from there** | Interactive A/B setting logic. | Medium | **Done** |

---

## 2. Subtitles & Language (MEDIUM-HIGH priority — requires ffmpeg parsing)

| # | Improvement | Notes | Risk |
|---|-------------|-------|------|
| 2.1 | **Extract subtitles from source file** if present (SRT/ASS/VOBSUB/PGS in mkv/mp4). | Use `ffmpeg -map 0:s:?` to dump subtitle stream for the A-B range. | Medium | **Done** |
| 2.2 | **Save extracted subtitle text as `ref_text` / ASR fallback** | Feeds OmniVoice `ref_text` automatically. | Medium | **Done** |
| 2.3 | **Multi-language subtitle selection** | If file has `es`, `en`, etc. tracks, let user pick and pair with audio language. | Medium | **Done** |
| 2.4 | **Download & integrate Whisper ASR** | Cache `openai/whisper-large-v3-turbo` (or smaller local model) so `ref_text` auto-transcription works offline. | High (size ~6 GB, first download) | **Done** (base model via `openai-whisper`; configurable size) |

---

## 3. Audio Track Selection (MEDIUM priority)

| # | Improvement | Notes | Risk |
|---|-------------|-------|------|
| 3.1 | **Detect multiple audio tracks** with ffprobe. | Show list of tracks (language + title if available). | Medium | **Done** |
| 3.2 | **Let user select which audio track to clone** | `ffmpeg -map 0:a:N` for extraction and waveform. | Medium | **Done** |
| 3.3 | **Pair selected audio track with matching subtitle language** | If audio is `spa` and subtitles have `spa`, auto-select that subtitle track. | Medium | **Done** |

---

## 4. Batch / Import Text (MEDIUM priority)

| # | Improvement | Notes | Risk |
|---|-------------|-------|------|
| 4.1 | **Import CSV/Excel** and pick a column/cell to insert into *Text to Synthesize*. | Use a small parser (PapaParse / xlsx). Could also import a whole column as multiple scripts. | Medium | **Done** |
| 4.2 | **Scripts panel enhancements** | Save A/B region + source video path + ref_text with each script; restore them on load. | Medium | **Done** |

---

## 5. Panel Layout / UI Polish (MEDIUM priority)

| # | Improvement | Notes | Risk |
|---|-------------|-------|------|
| 5.1 | **Reorder Voice panel**: A/B segment → Reference transcript → Text to synthesize → non-verbal tags → Voice tuning (collapsible) → Export A-B → Generate. | Matches user's requested flow. | Low | **Done** |
| 5.2 | **Collapsible sections** in all side panels (Media, Models, Scripts, Voice) with chevrons. | Cleaner view, focus on most-used controls. | Low | **Done** |
| 5.3 | **Media panel remembers recently opened videos** | Persist last N paths in `localStorage` for quick re-open. | Low | **Done** |
| 5.4 | **Prettier video transport controls** | Centered buttons, icons + text, larger hit areas, tooltips. | Low | **Done** |

---

## 6. Logging & Diagnostics (FOUNDATION — do early)

| # | Improvement | Notes | Risk |
|---|-------------|-------|------|
| 6.1 | **Centralized error logging** | Ensure every `catch` sends to Rust diagnostic log and console. | Low | **Done** |
| 6.2 | **Per-session operation log** | Log each generation with params, duration, success/failure for debugging. | Low | **Done** |
| 6.3 | **Recoverable crash handler** | `ErrorBoundary` already exists; verify it reports failures clearly. | Low | **Done** |

---

## Suggested Implementation Order

1. **Foundation:** tighten error logging (6.1–6.3) so we can detect regressions.
2. **Timeline polish:** 1.1–1.6 (visible, low risk, big UX win).
3. **Waveform rendering fix:** 1.3–1.4.
4. **Voice panel reorder + collapsible sections:** 5.1–5.2.
5. **Media history + Scripts metadata:** 5.3 + 4.2.
6. **Subtitle extraction (no ASR yet):** 2.1–2.2.
7. **Audio track + subtitle language pairing:** 3.1–3.3.
8. **CSV/Excel import:** 4.1.
9. **Whisper ASR integration:** 2.4 (last because of size/complexity).
10. **Video transport redesign:** 5.4.

---

## Recovery Commands

```bash
# Hard reset to known-good baseline
git checkout v0.2.0-baseline

# Or revert the last commit but keep changes in working tree
git reset --soft HEAD~1
```
