"""Run the ingestion worker with rag/.env loaded.

worker.py reads os.environ directly and does not load .env, so launching it
straight (`python worker.py`) fails with "Missing required env". Use this:

    rag/.venv/Scripts/python.exe rag/run_worker.py
"""
import os
from pathlib import Path

ENV = Path(__file__).resolve().parent / ".env"

for line in ENV.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

import worker  # noqa: E402  (import after env is populated)

if __name__ == "__main__":
    worker.main()
