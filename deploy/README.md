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

From a machine with the Supabase CLI linked to the project, run `supabase db push` —
it applies every unapplied file in `supabase/migrations/` (the 8-file domain
baseline, 2026-07-12 restructure) in timestamp order and tracks what ran. Do **not**
paste SQL into the Dashboard SQL Editor — that is how the live project drifted from
the repo before the restructure. The RAG stack's schema ships in
`20260712000008_rag_documents.sql`; structured analytics also read HR tables from
`20260712000003_hr_core.sql`. (The `preflight.py --worker` check in §3.5 verifies
the schema so a missing migration is caught before the services start.)

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

## 3.5 Preflight (run before installing services)

```powershell
cd C:\surya\rag
# worker env (has the service key — validates DB schema too):
Get-Content C:\surya\env\rag-worker.env | ForEach-Object { $k,$v = $_ -split '=',2; if ($k) { Set-Item "env:$k" $v } }
.venv\Scripts\python.exe preflight.py --worker
# api env:
.venv\Scripts\python.exe preflight.py --api
```
Fix every `[FAIL]` before continuing; each line names the migration/action needed.

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

## 7. Phase B: watched-folder / mail-in capture (optional)

Only worth installing once you actually have a network folder share and/or an
IT-provisioned mailbox — the design doc left both as open questions. No native
deps (unlike `rag/`), so any Python 3.10+ works, no WDAC DLL concerns.

```powershell
cd C:\surya\ingest
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Fill in `C:\surya\env\ingest-worker.env` (copy `ingest/.env.example`) —
`INGEST_OWNER_USER_ID` needs a real `auth.users` row created via the
Dashboard first. Leave `WATCH_ROOT` and/or `IMAP_*` blank to run with only
one source active.

```powershell
nssm install surya-ingest-worker C:\surya\ingest\.venv\Scripts\python.exe worker.py
nssm set     surya-ingest-worker AppDirectory C:\surya\ingest
nssm set     surya-ingest-worker AppEnvironmentExtra :C:\surya\env\ingest-worker.env
nssm start   surya-ingest-worker
```

Harvested structured files show up under Data Management → **Harvested** for
review; harvested PDFs/scans flow into the existing RAG ingest queue
automatically.

## Model host sizing (read before choosing hardware)

The retrieval path costs **three model calls per question** — route, section pick,
answer — so end-to-end latency is roughly three times the single-call latency.
Measured on a CPU-only laptop (Intel Arc iGPU not used by Ollama), `qwen3-vl:8b`
took route 104 s + pick 54 s + answer 67 s ≈ **3–4 minutes per question**.
Disabling thinking tokens only moved the answer step to 47 s, so this is raw
CPU inference, not reasoning overhead.

Measured on the real 6-document corpus with `eval/bench_local.py` (same laptop,
CPU-only, gold citation questions):

| Model | Retrieval hit-rate | Latency per question |
|---|---|---|
| `qwen2.5:3b-instruct` (local, CPU) | 0.20 (1/5) | median 45 s, max 123 s |
| `qwen3-vl:8b` (local, CPU) | 1/1 completed | **586 s**; 2 of 3 hit the 600 s cap |
| hosted `deepseek-v4-flash` | 0.93 (13/14) | 7–20 s |

Two things follow. **Quality is fine locally** — the 8B answered correctly with a
precise citation, so self-hosting is not a accuracy compromise. **Speed is entirely
the GPU question**: the same model on this CPU-only host needs ~10 minutes per
question, largely because the section-pick prompt carries node summaries (~10 KB)
and CPU prefill of that is slow. A GPU that holds the model makes the prefill
negligible.

Do not reach for a smaller model to buy speed back: the 3B was still slow *and*
failed four of five questions by refusing — it could not pick the right section or
ground an answer. Retrieval quality is set by the model, so size down only with a
`bench_local.py` run to back it up.

Consequences:

- **Give the model host a GPU** with enough VRAM to hold the chosen model, or
  expect minutes per question. `ollama ps` shows `100% CPU` when there is no
  GPU offload — check it after install; that one line predicts your latency.
- Raise `RAG_*_TIMEOUT_S` (see the env examples) on any CPU-only host. The
  shipped defaults of 10/20/60 s assume a GPU and every query will time out.
- Ingestion is unaffected in practice: it is a batch job behind a queue, so a
  slow local model only means indexing takes longer, not that anything fails.
- `OCR_BASE_URL` lets page images stay on the local vision model even if the
  summarising LLM is a hosted API — the mixed mode where scans never leave the
  institute but answers are fast.

Whatever the model, verify it on the real corpus before trusting it:
`python rag/eval/bench_local.py --model <name> --cases 5` reports hit-rate and
per-question latency against the gold citation set.

## Notes

- Windows paths in this doc assume `C:\surya`; adjust consistently.
- `python rag/eval/run_eval.py` (with `LLM_BACKEND=openllm`, base URL pointed at Ollama)
  scores router + refusal behavior against `rag/eval/gold.jsonl` — extend that file with
  real institute Q&A over time.
