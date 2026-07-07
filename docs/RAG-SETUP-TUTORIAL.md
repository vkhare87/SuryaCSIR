# Tutorial: Set Up the PageIndex RAG System

You'll stand up SURYA's document-intelligence stack on your machine: the ingestion
worker that turns uploaded PDFs into hierarchical PageIndex trees, and the Ask SURYA
query API that answers questions over them with citations. By the end you will upload
a PDF, watch it get indexed, and get a cited answer back — first offline with fake
adapters (no LLM needed), then with a real local LLM via Ollama.

**PageIndex in one paragraph:** instead of chopping documents into chunks and storing
embeddings in a vector database, the worker builds a tree per document — top-level
table-of-contents sections (or per-page nodes), each with an LLM-written one-sentence
summary. At query time the LLM *reasons* over these titles and summaries to pick
relevant sections, then answers only from that context. No vector DB, no embeddings,
and every answer cites the sections it came from.

## What you'll need

- **Python 3.12** (hard requirement — PyMuPDF ships no 3.14 wheel yet)
- A **Supabase project** with the SURYA migrations applied (or your existing dev project)
- The SPA running (`npm run dev`) with a signed-in user
- Optional for the real-LLM part: **Ollama** (ollama.com) and **Tesseract** (for scanned PDFs)
- Windows note: if Smart App Control / WDAC is active, the PyMuPDF native DLL
  (`_mupdf.pyd`) is blocked — allow it, or you can still complete every step except
  actual PDF parsing (tests use fakes).

## Step 1: Apply the RAG migrations

In the Supabase SQL Editor (as `postgres`), run — in order — any of these not yet applied:

```
supabase/migrations/20260702000000_documents_registry.sql
supabase/migrations/20260702010000_project_reports.sql
supabase/migrations/20260702020000_doc_indexes.sql
supabase/migrations/20260702030000_rag_scale_quality.sql
supabase/migrations/20260707000000_query_log_latency.sql
```

You now have: the `documents` registry (whose `ingest_status` column **is** the
ingestion queue), `doc_indexes` (tree storage), `collection_indexes`, `query_log`,
and RLS policies on all of them.

## Step 2: Install the worker and configure env

```bash
cd rag
py -3.12 -m venv .venv
.venv/Scripts/activate            # source .venv/bin/activate on *nix
pip install -r requirements.txt
cp .env.example .env
```

Fill `.env` (all keys required — `config.py` fails fast on missing ones):

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<service role key>      # worker only — drains the queue across users
SUPABASE_ANON_KEY=<anon key>                 # query API — caller JWT + RLS do the scoping
OPENLLM_BASE_URL=http://localhost:11434/v1   # Ollama's OpenAI-compatible endpoint
OPENLLM_MODEL=llama3.1:8b
OCR_BACKEND=null                             # null | tesseract
LLM_BACKEND=fake                             # start with fake; switch to openllm later
POLL_INTERVAL_S=30
BATCH_SIZE=5
```

`LLM_BACKEND=fake` uses a deterministic offline adapter (summaries = first line of
text) so you can verify the whole pipeline before involving a real model.

## Step 3: Index your first document

Terminal 1 — run the worker once:

```bash
python worker.py --once
```

Expected output: `[rag] processed 0 document(s)` — the queue is empty. Now feed it:

1. In the SPA, open any module with a document upload (easiest: **Proposals** → open a
   proposal → upload a text-based PDF; or **Committees** → meeting → upload).
2. The upload creates a `documents` row with `ingest_status='pending'`.
3. Run `python worker.py --once` again. Expected: `[rag] processed 1 document(s)`.

**Verify:** open `/admin/rag` in the SPA (SystemAdmin) — the document shows `indexed`.
Or in SQL: `select tree from doc_indexes;` — you'll see the root node with per-section
summaries and page ranges.

You have a working ingestion pipeline. Everything after this is the query side.

## Step 4: Run the query API

```bash
uvicorn api:app --port 8000
```

Point the SPA at it — add to the repo-root `.env`:

```
VITE_RAG_URL=http://localhost:8000
```

Restart `npm run dev`, sign in, open **Ask SURYA** (`/ask`), and ask something about
your uploaded document. With `LLM_BACKEND=fake` the "answer" is the first line of the
picked section's summary — not smart, but it proves the full path: JWT auth → route
decision → tree traversal → cited answer → query log. Click the citation: the source
PDF opens at the cited page.

Also try a structured question — "How many documents are indexed?" — the badge flips
to `structured` and the answer names its source table.

## Step 5: Switch to a real LLM

```bash
ollama pull llama3.1:8b
```

In `rag/.env` set `LLM_BACKEND=openllm`, restart the worker and API. Re-index existing
docs to get real summaries: in `/admin/rag` hit retry on the document (or in SQL set
`ingest_status='pending'`), then `python worker.py --once`.

Ask the same questions again — answers are now generated, grounded in the picked
sections, and still refuse ("Not found in institute documents.") when the corpus
doesn't contain the answer.

**Heads-up on first-query latency:** Ollama cold-loads the model on first request;
on CPU-only machines this can take minutes. Keep the model resident with
`OLLAMA_KEEP_ALIVE=-1`.

## Step 6: Scanned PDFs (OCR)

Government PDFs are often scans. With `OCR_BACKEND=null` a scanned PDF yields no text
and the worker marks it **`failed`** with "no extractable text — scanned PDF with OCR
disabled?" (visible in `/admin/rag`). To fix: install Tesseract
(`choco install tesseract`), set `OCR_BACKEND=tesseract`, retry the document.

## Step 7: Measure it

```bash
python -m pytest -q                 # offline suite (FakeLLM/NullOCR, no network)
python eval/run_eval.py             # router accuracy vs eval/gold.jsonl (50 cases)
```

Under `LLM_BACKEND=openllm`, `run_eval.py` gives the real router-accuracy number
(dissertation metric). For the citation hit-rate metric, dump your corpus per the SQL
in `eval/run_eval.py`'s docstring to `eval/corpus.json` and author real cases in
`eval/gold_citations.jsonl` (target ≥ 0.80).

## What you built

Upload → parse (+ OCR) → PageIndex tree → RLS-scoped retrieval → routed, cited,
logged answers — the Memory Layer and the retrieval half of the Brain Layer. Next:
production deployment as Windows services behind nginx is in
[`deploy/README.md`](../deploy/README.md); the feature surface is in
[FEATURES.md](FEATURES.md); planned upgrades (true hierarchical traversal, answer
synthesis from page text) are in [IMPROVEMENT-PROPOSALS.md](IMPROVEMENT-PROPOSALS.md).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pip install` fails on PyMuPDF | Python 3.14 | Use `py -3.12 -m venv .venv` |
| Worker crashes importing `fitz` | WDAC/Smart App Control blocks `_mupdf.pyd` | Allow the DLL under `site-packages`, or ask IT |
| `Missing required env: ...` | Empty key in `.env` | Every key in Step 2 is required, even unused adapters |
| Document stuck `pending` | Worker not running | `python worker.py --once`; check its stdout |
| Document `failed`: "no extractable text" | Scanned PDF, OCR off | Step 6 |
| Ask SURYA: "VITE_RAG_URL is not configured" | SPA env missing | Step 4, restart dev server |
| 401 from `/query` | Not signed in / stale session | Sign in again; API validates the Supabase JWT |
| First real-LLM query times out | Ollama cold load on CPU | `OLLAMA_KEEP_ALIVE=-1`; wait out the first load |
| Answer is always the refusal | Corpus empty for your role | RLS-scoped: check the doc's access tier vs your role |
