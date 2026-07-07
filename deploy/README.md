# SURYA — Windows Server Deployment

Everything runs on one Windows server: the SPA (static files behind nginx), the two RAG
processes (worker + query API) as Windows services, and Ollama serving the LLM locally.
Database/Auth/Storage stay on cloud Supabase; **the LLM never leaves the premises** and
answers are grounded in institute documents only (refusal otherwise).

```
browser ── https ──> nginx ──┬── C:\surya\dist          (SPA static files)
                             └── /rag/ → 127.0.0.1:8000 (surya-rag-api, uvicorn)
surya-rag-worker ── service key ──> Supabase (drains documents ingest queue)
surya-rag-api ───── caller JWT ───> Supabase (RLS-scoped reads)
both ──────────────────────────────> Ollama http://localhost:11434/v1
```

## 0. One-time: apply migrations

In the Supabase SQL Editor (as `postgres`), run the migrations in
`supabase/migrations/` that aren't applied yet — for the RAG stack:
`20260702000000_documents_registry.sql`, `20260702010000_project_reports.sql`,
`20260702020000_doc_indexes.sql`, `20260702030000_rag_scale_quality.sql`.

## 1. Prerequisite (hard): allow Python native DLLs

If the server runs WDAC / Smart App Control, PyMuPDF (`_mupdf.pyd`) and pydantic-core
are **blocked by default** — the worker and API will not start. Institute IT must
allow/sign the DLLs under the venv's `site-packages` before anything else. This is the
same block seen on dev laptops; there is no workaround in code.

## 2. Install runtime

1. **Python 3.12** (not 3.14 — PyMuPDF ships no 3.14 wheel yet): python.org installer,
   "Add to PATH" checked.
2. ```powershell
   cd C:\surya
   git clone <repo> . # or copy the release archive
   py -3.12 -m venv rag\.venv
   rag\.venv\Scripts\pip install -r rag\requirements.txt
   ```
3. **Ollama**: Windows installer from ollama.com (installs as a service).
   ```powershell
   ollama pull llama3.1:8b     # or the institute's chosen model
   setx OLLAMA_KEEP_ALIVE -1 /M   # keep the model resident; cold loads take minutes on CPU
   ```
4. **Tesseract** (for scanned PDFs): UB Mannheim Windows build; note the install path.

## 3. Environment files (never in the repo)

Copy the two examples and fill them in; ACL-restrict to the service account
(`icacls C:\surya\env /inheritance:r /grant "SYSTEM:(OI)(CI)F"`):

- `C:\surya\env\rag-api.env` ← `deploy/rag-api.env.example` — anon key only.
- `C:\surya\env\rag-worker.env` ← `deploy/rag-worker.env.example` — adds
  `SUPABASE_SERVICE_KEY`. **Split on purpose: the API process (which handles user
  input) never holds the service key.**

## 4. Register the services (NSSM)

```powershell
nssm install surya-rag-api  C:\surya\rag\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
nssm set     surya-rag-api  AppDirectory C:\surya\rag
nssm set     surya-rag-api  AppEnvironmentExtra :C:\surya\env\rag-api.env

nssm install surya-rag-worker C:\surya\rag\.venv\Scripts\python.exe worker.py
nssm set     surya-rag-worker AppDirectory C:\surya\rag
nssm set     surya-rag-worker AppEnvironmentExtra :C:\surya\env\rag-worker.env

nssm start surya-rag-api
nssm start surya-rag-worker
```

## 5. Build + serve the SPA

On a build machine (or the server):
```powershell
$env:VITE_RAG_URL = "/rag"   # same-origin path through nginx — no CORS needed
npm ci; npm run build
Copy-Item -Recurse dist C:\surya\dist
```
Install **nginx for Windows**, drop `deploy/nginx.conf` into `conf/`, adjust paths,
run nginx as a service (NSSM again works). TLS: use an institute-CA-signed cert if the
institute runs an internal CA (typical for government networks); otherwise self-signed
plus a documented browser exception.

## 6. Smoke checklist

1. `rag\.venv\Scripts\python.exe worker.py --once` — a seeded `pending` document flips
   to `indexed` with a tree in `doc_indexes`.
2. `curl -X POST https://<host>/rag/query -d "{\"question\":\"x\"}" -H "Content-Type: application/json"`
   → **401** (no token) — proves auth is on.
3. Log into the SPA → **Ask SURYA** → a question about an indexed document returns an
   answer **with citations**; an off-corpus question returns
   *"Not found in institute documents."*
4. `/admin/rag` shows the ingestion counts.

## Notes

- Windows paths in this doc assume `C:\surya`; adjust consistently.
- `python rag/eval/run_eval.py` (with `LLM_BACKEND=openllm`, base URL pointed at Ollama)
  scores router + refusal behavior against `rag/eval/gold.jsonl` — extend that file with
  real institute Q&A over time.
