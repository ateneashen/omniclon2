"""
OmniClon 2 Backend — Focused Voice Cloning API

Clean, professional FastAPI backend for high-quality voice cloning
with excellent A/B Roll support and strong diagnostic logging.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend/ is importable when running via `uvicorn main:app`
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[backend] OmniClon 2 backend starting...")
    # TODO: Initialize logging, model manager (lazy), etc.
    yield
    # Shutdown
    print("[backend] OmniClon 2 backend shutting down...")


app = FastAPI(
    title="OmniClon 2 Backend",
    description="Professional voice cloning API with A/B Roll support",
    version="0.1.0-rewrite",
    lifespan=lifespan,
)

# Allow Tauri webview (and local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production we can tighten this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/system/info")
async def system_info():
    """Health check endpoint used by the Rust sidecar during bootstrap."""
    return {
        "name": "omniclon2-backend",
        "version": "0.1.0-rewrite",
        "status": "ok",
        "python": sys.version.split()[0],
        "data_dir": os.environ.get("OMNICLON2_DATA_DIR", "not-set"),
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


# TODO (Phase 0/1+):
# - /models (catalog + status)
# - /profiles (CRUD + audio upload)
# - /generate (real cloning)
# - /segments/extract (A/B Roll)
# - Strong structured logging to dedicated diagnostic files


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=17493,  # Chosen port for OmniClon 2 (different from reference)
        reload=True,
    )