# SURYA RAG Ingestion Worker (T4)

Standalone Python worker that drains the `documents.ingest_status = 'pending'`
queue: downloads each document from Supabase Storage, parses it, builds a
hierarchical **PageIndex tree**, and stores the tree JSON in `doc_indexes`.

Deployed separately from the SPA — runs next to OpenLLM on the institute server.
Not part of the Vite/npm build.

## Setup

```bash
cd rag
python -m venv .venv
.venv/Scripts/activate        # Windows;  source .venv/bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env          # fill in SUPABASE_* (+ OPENLLM_* for real summaries)
```

Real OCR (`OCR_BACKEND=tesseract`) also needs the Tesseract binary installed on
the host (`choco install tesseract` / `apt install tesseract-ocr`).

Requires **Python 3.12** (PyMuPDF ships no 3.14 wheel yet). On Windows, the
compiled `_mupdf` DLL may be blocked by Smart App Control / WDAC — allow it or
disable that policy for the worker host.

## Run

```bash
python worker.py            # poll loop (sleeps POLL_INTERVAL_S between passes)
python worker.py --once     # single pass, then exit (deploy verify / cron)
```

## Test

```bash
python -m pytest            # all offline: FakeLLM + NullOCR, no network
```

`test_parse.py` and `test_worker.py` need the native PyMuPDF binary; the rest
run without it.

## Adapters (env switches)

| Env | Values | Notes |
|-----|--------|-------|
| `OCR_BACKEND` | `null` \| `tesseract` | `null` returns empty text (dev/offline) |
| `LLM_BACKEND` | `fake` \| `openllm` | `fake` = deterministic first-line summary |

## Layout

- `config.py` — env → `Config` (fails fast on missing keys)
- `db.py` — `SupabaseDB` (service role) + `FakeDB` (tests); atomic claim
- `parse.py` — PyMuPDF text extraction, OCR fallback per page
- `ocr.py` / `llm.py` — swappable adapters
- `pageindex.py` — tree builder (TOC sections, else flat page nodes)
- `worker.py` — orchestration, `--once`, per-doc failure isolation
