# T4 — RAG Ingestion MVP (Design Spec)

> Tranche T4 of the SURYA overhaul (see `docs/OVERHAUL-PLAN.md` §6, feature F6 + minimal F8).
> Server-side document indexing worker + `doc_indexes` table + admin monitor page.
> Date: 2026-07-03. Status: approved design, pre-implementation.

---

## 1. Goal & Scope

Drain the `documents.ingest_status='pending'` queue (shipped in T1) by parsing each
document, building a hierarchical **PageIndex tree** (vectorless, reasoning-friendly),
and storing the tree JSON in a new `doc_indexes` table. Surface pipeline health in a
minimal admin monitor page.

**In scope (T4):**
- Standalone Python polling worker in a new top-level `rag/` directory.
- PDF parse (PyMuPDF) with OCR fallback for scanned/image-only pages.
- PageIndex tree builder producing node summaries via a self-hosted OpenLLM.
- LLM and OCR isolated behind **adapters** with deterministic fake implementations, so
  the entire pipeline runs and tests offline with zero external services.
- `doc_indexes` migration (table + RLS + admin requeue RPC).
- Minimal RAG admin monitor page (F8 subset): status counts, per-doc table, retry/re-index.

**Explicit non-goals (deferred):**
- No FastAPI / HTTP endpoint. Polling only. (`/query` is T5.)
- No `collection_indexes` / cross-document corpus layer. (T6.)
- No pgvector / vector DB. PageIndex is reasoning-based. (Optional hybrid = T6.)
- No webhook trigger. (Polling is sufficient for MVP; webhook is an optional later optimization.)
- No richer reasoning-based sectioning beyond TOC-or-flat. (T6 quality work.)

---

## 2. Architecture

New top-level `rag/` directory — sibling of `src/` and `scripts/`. Own Python venv,
`requirements.txt`, `.env.example`, `README.md`. Not part of the npm/Vite build; deployed
separately next to OpenLLM on the institute server.

```
rag/
  config.py        Env config: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENLLM_BASE_URL,
                   OPENLLM_MODEL, OCR_BACKEND, LLM_BACKEND, POLL_INTERVAL_S, BATCH_SIZE.
  db.py            supabase-py client (service key). Claim pending doc, mark
                   indexed/failed, upsert doc_index row, download file from storage.
  parse.py         PyMuPDF (fitz): per-page text extraction. Page with no extractable
                   text -> flagged for OCR fallback.
  ocr.py           OCR adapter. TesseractOCR (pytesseract over rendered page pixmap) |
                   NullOCR (returns "" — stub for offline/dev). Selected by OCR_BACKEND.
  llm.py           LLM adapter for node summaries. OpenLLMClient (OpenAI-compatible
                   /chat/completions) | FakeLLM (deterministic first-N-char summary).
                   Selected by LLM_BACKEND.
  pageindex.py     Build hierarchical tree. If PDF has a TOC (fitz get_toc), build a
                   section tree from it; otherwise a flat tree of page nodes. Each node
                   gets a summary via the llm adapter. Emits tree JSON.
  worker.py        Poll loop. Entry point. `--once` flag runs a single pass (tests/CI).
  tests/           pytest: test_pageindex, test_parse, test_worker.
  requirements.txt
  .env.example
  README.md
```

### Component contracts (isolation)

| Unit | Does | Input → Output | Depends on |
|---|---|---|---|
| `config.py` | Load + validate env | env → `Config` dataclass | stdlib `os` |
| `db.py` | All Supabase I/O | doc id / rows → claimed row, storage bytes | supabase-py |
| `parse.py` | PDF → text per page | pdf bytes → `list[Page(text, needs_ocr)]` | PyMuPDF |
| `ocr.py` | Image page → text | page pixmap → str | adapter (tesseract or null) |
| `llm.py` | Text → summary | node text → str | adapter (OpenLLM or fake) |
| `pageindex.py` | Pages → tree | `list[Page]` + llm → tree dict | parse, llm |
| `worker.py` | Orchestrate + status | — → side effects on DB | all above |

Each unit is import-testable with the adapters swapped for fakes. `worker.py` is the only
unit with orchestration/side effects; everything else is pure or single-responsibility I/O.

---

## 3. Data Model

### Migration `supabase/migrations/20260702020000_doc_indexes.sql`

```sql
create table public.doc_indexes (
  document_id uuid primary key references public.documents(id) on delete cascade,
  tree        jsonb not null,
  model       text  not null,        -- llm model id used for summaries (or 'fake')
  page_count  int   not null default 0,
  built_at    timestamptz not null default now()
);

alter table public.doc_indexes enable row level security;

-- Read: only if you can read the parent document. Reuse the tier helper from
-- the documents registry migration.
create policy doc_indexes_read on public.doc_indexes
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = doc_indexes.document_id
        and public.documents_can_read(d)
    )
  );
-- No client insert/update/delete policy: only the service-role worker writes
-- (service role bypasses RLS).

-- Admin requeue: reset a document back into the ingest queue.
-- SECURITY DEFINER so the client never patches documents.ingest_status directly.
create or replace function public.rag_requeue_document(p_doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.proposals_caller_has_role('SystemAdmin')
    or public.proposals_caller_has_role('MasterAdmin')
  ) then
    raise exception 'not authorized';
  end if;
  update public.documents
     set ingest_status = 'pending', ingest_error = null
   where id = p_doc_id;
end;
$$;

revoke all on function public.rag_requeue_document(uuid) from public;
grant execute on function public.rag_requeue_document(uuid) to authenticated;
```

### PageIndex tree JSON shape

```json
{
  "root": {
    "title": "<document title>",
    "summary": "<llm summary of whole doc>",
    "nodes": [
      {
        "title": "<section title or 'Page N'>",
        "summary": "<llm node summary>",
        "page_start": 1,
        "page_end": 3,
        "nodes": []
      }
    ]
  }
}
```

Recursive `nodes`; flat mode = one node per page under root; TOC mode = section nodes
with page ranges. Leaf text is not stored in the tree (kept lean); traversal in T5 will
re-fetch page text on demand or store it later if evals require.

---

## 4. Processing Flow (worker.py)

1. **Claim** — atomic update:
   `update documents set ingest_status='processing' where id=? and ingest_status='pending'`
   returning the row. No row returned → another pass already took it, skip.
   `# ponytail: single-worker assumed; swap for a SELECT ... FOR UPDATE SKIP LOCKED RPC if we ever run >1 worker`
2. **Download** — fetch bytes from `storage_bucket`/`storage_path` via service key.
3. **Parse** — `parse.py` → per-page text; mark pages needing OCR.
4. **OCR fallback** — for flagged pages, render pixmap → `ocr.py` adapter.
5. **Build tree** — `pageindex.py` (TOC or flat) → node summaries via `llm.py` adapter.
6. **Persist** — upsert `doc_indexes` row (tree, model, page_count).
7. **Mark** — `ingest_status='indexed'`. On any exception in steps 2–6:
   `ingest_status='failed'`, `ingest_error=<message>`; log and continue to next doc.
8. Loop sleeps `POLL_INTERVAL_S`, processes up to `BATCH_SIZE` per pass.
   `--once` exits after a single pass (used by tests / manual verify).

Non-PDF mime types → mark `skipped` (out of MVP scope), not `failed`.

---

## 5. Admin Monitor (F8 minimal)

- **Route:** `/admin/rag`, roles `['SystemAdmin','MasterAdmin']`.
- **Registration:** add to `src/constants/access.ts` ACCESS_MAP, `src/App.tsx` route,
  `src/components/layout/Layout.tsx` NAV_ITEMS (Admin group).
- **Page:** `src/pages/admin/RagMonitor.tsx` (`export default function`).
- **Data lib:** `src/lib/rag/monitor.ts` — direct-supabase queries, mirroring the
  `src/lib/documents/registry.ts` pattern (lib does Supabase, page consumes lib; this is
  an admin utility outside DataContext, consistent with existing lib usage).
  - `fetchIngestStatusCounts()` → `{ pending, processing, indexed, failed, skipped }`.
  - `fetchDocumentsWithIndex()` → documents joined with `doc_indexes` (status, error,
    page_count, built_at).
  - `requeueDocument(docId)` → `supabase.rpc('rag_requeue_document', { p_doc_id })`.
- **UI:** status-count summary cards + a table (title, entity_type, status badge,
  ingest_error, page_count, built_at). Row actions: **Retry** (visible when `failed`),
  **Re-index** (visible when `indexed`) → both call `requeueDocument`. Semantic Tailwind
  tokens; `useMemo` for any derived counts; `<EmptyState>` when no documents.

---

## 6. Error Handling & Resilience

- Per-document isolation: one bad doc never halts the loop; it is marked `failed` with the
  error text and the worker moves on.
- Claim guard prevents double-processing across passes.
- Admin retry/re-index is the recovery path (resets to `pending` via the RPC).
- Worker logs to stdout (systemd/journald-friendly). No secret values logged.
- Config validation fails fast at startup with a clear message if required env is missing.

---

## 7. Testing

Python `pytest`, no network. Adapters default to `FakeLLM` + `NullOCR` in tests.

- `test_parse.py` — generate a tiny text PDF (PyMuPDF) → assert text extracted; generate an
  image-only page → assert it is flagged `needs_ocr` and routes through the OCR adapter.
- `test_pageindex.py` — flat mode: N pages → root with N child nodes, each summarized by
  FakeLLM; TOC mode: a PDF with bookmarks → section tree with correct page ranges.
- `test_worker.py` — a fake DB adapter seeded with one `pending` doc; run `--once`; assert
  the doc ends `indexed` and a `doc_indexes` row was written with a well-formed tree.

SPA: `src/lib/rag/monitor.ts` count-aggregation is the only non-trivial client logic; one
light unit test for the status-count shaping. `RagMonitor.tsx` is display-only — no
dedicated test (matches project convention for thin pages).

**Acceptance (plan's bar):** a seeded `pending` document, after one `--once` run with the
fake adapters, becomes `indexed` with an inspectable `tree` JSON; an image-only PDF routes
through the OCR adapter path.

---

## 8. Deferred / Follow-ups

- Real reasoning-based sectioning (full PageIndex) — T6.
- `collection_indexes` corpus layer — T6.
- Webhook-driven ingest (drop polling latency) — optional later.
- pgvector hybrid — only if T6 evals demand it.
- Multi-worker concurrency (SKIP LOCKED claim RPC) — only if throughput demands.
