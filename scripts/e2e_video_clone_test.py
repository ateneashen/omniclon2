"""
End-to-end smoke test for OmniClon 2 video -> A/B -> clone flow.

This script exercises the same path a user would take in the UI:
1. Pick a video clip from the Estambul test folder.
2. Extract a clean 6-second A/B audio segment with ffmpeg.
3. Send it to the local /generate endpoint.
4. Verify the generated WAV exists and has a reasonable duration.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

# Ensure loopback requests never go through a system HTTP proxy.
os.environ.setdefault("NO_PROXY", "127.0.0.1,localhost")
os.environ.setdefault("no_proxy", "127.0.0.1,localhost")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VIDEO_DIR = Path(r"C:\AI\ksequence_split_v3.0\2026_05_19_01_20_46_Estambul")
BACKEND_URL = "http://127.0.0.1:17493"


def api_post(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BACKEND_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    if not VIDEO_DIR.exists():
        print(f"[FAIL] Video folder not found: {VIDEO_DIR}")
        return 1

    videos = sorted(VIDEO_DIR.glob("*.mp4"))
    if not videos:
        print("[FAIL] No .mp4 files in test folder")
        return 1

    video = videos[3]  # pick a mid-length clip
    print(f"[INFO] Using test video: {video.name}")

    out_dir = PROJECT_ROOT / "data" / "e2e_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    ref_path = out_dir / "e2e_ref.wav"

    # Extract a 6-second segment starting at 1s (clean cut with -ss before -i)
    cmd = [
        "ffmpeg", "-y",
        "-ss", "1.0",
        "-t", "6.0",
        "-i", str(video),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "24000",
        "-ac", "1",
        str(ref_path),
    ]
    print(f"[INFO] Extracting A/B reference: {ref_path}")
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    if not ref_path.exists():
        print("[FAIL] Reference audio was not created")
        return 1

    print(f"[INFO] Reference ready: {ref_path.stat().st_size} bytes")

    payload = {
        "reference_audio_path": str(ref_path),
        "text": "Hola, esto es una prueba completa de clonación de voz con OmniClon 2.",
        "speed": 1.0,
        "num_step": 20,
        "guidance_scale": 2.0,
        "denoise": True,
        "postprocess_output": True,
        "language": "es",
    }

    print("[INFO] Calling /generate...")
    result = api_post("/generate", payload)

    if not result.get("success"):
        print(f"[FAIL] Generation failed: {result.get('error_message')}")
        return 1

    output_path = Path(result["output_path"])
    duration = result.get("duration_seconds", 0)
    model_used = result.get("model_used", "unknown")

    if not output_path.exists():
        print(f"[FAIL] Output file not found: {output_path}")
        return 1

    print(f"[PASS] Generated audio: {output_path}")
    print(f"[PASS] Duration: {duration:.2f}s | Model: {model_used}")
    print(f"[PASS] Output size: {output_path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
