"""Dev launcher for the RAG API.

Loads the repo-root .env and maps the SPA's VITE_-prefixed Supabase vars to
the names api.py expects, then starts uvicorn. Production uses deploy/ env
files instead — this file is for local `preview_start` only.
"""
import os
import sys
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent
ENV_FILE = RAG_DIR.parent / ".env"

if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

os.environ.setdefault("SUPABASE_URL", os.environ.get("VITE_SUPABASE_URL", ""))
os.environ.setdefault("SUPABASE_ANON_KEY", os.environ.get("VITE_SUPABASE_ANON_KEY", ""))

sys.path.insert(0, str(RAG_DIR))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("api:app", host="127.0.0.1", port=8000)
