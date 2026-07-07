# T6 — Scale & Quality Design Spec

> Final tranche of the SURYA RAG overhaul. Corpus indexes, query log + feedback, eval harness,
> re-index tooling. Date: 2026-07-03. Status: approved ("then T6").

## 1. Scope

Four independently useful additions on top of T4 (ingestion) + T5 (query):

1. **Query log + feedback.** Persist every `/query` (question, mode, answer, citations) as a
   row owned by the caller; let the user rate it 👍/👎. Powers future eval + audit.
2. **Collection indexes.** A per-collection document-summary layer so cross-document questions
   start at collection → document → node. MVP keys collections by `entity_type`.
3. **Eval harness.** A runner that scores router/retrieval behaviour against a gold JSONL set.
   Ships the harness + format + a small seed; real institute gold Q&A are added over time.
4. **Re-index-all tooling.** Bulk admin requeue (all `indexed`/`failed` → `pending`).

**Non-goals:** pgvector / hybrid retrieval (only if evals later demand it); merged audit
timeline; automated eval-in-CI.

## 2. Security

- Query log rows are inserted through the caller's **scoped client** (T5 model, no service
  key). RLS: a user inserts/reads/updates only their own rows (`user_id = auth.uid()`);
  admins read all. Feedback is an owner-only update of `feedback` on one's own row.
- `rag_requeue_all()` is `SECURITY DEFINER`, admin-only (same guard as `rag_requeue_document`).

## 3. Data model — migration `20260702030000_rag_scale_quality.sql`

```sql
create table public.query_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
  question    text not null,
  mode        text not null,
  answer      text not null,
  citations   jsonb not null default '[]'::jsonb,
  feedback    smallint,                       -- null | 1 (up) | -1 (down)
  created_at  timestamptz not null default now()
);
-- RLS: owner full access to own rows; admins read all. (policies in the migration)

create table public.collection_indexes (
  collection_key text primary key,            -- entity_type, e.g. 'project_report'
  title          text not null,
  summary        text not null,
  document_count int not null default 0,
  model          text not null,
  built_at       timestamptz not null default now()
);
-- RLS: any authenticated user may read (collection summaries are non-confidential rollups);
-- only the service-role worker writes.

-- Bulk requeue (admin only).
create function public.rag_requeue_all() returns int ...   -- resets indexed/failed -> pending
```

## 4. Worker — collection builder

- `collections.py` (pure): `build_collection_summaries(rows, llm) -> list[dict]` where
  `rows = [{'entity_type','root_summary'}]`; groups by `entity_type`, `llm.summarize` over the
  concatenated member root-summaries → `[{collection_key, title, summary, document_count}]`.
- `worker.py --build-collections`: `SupabaseDB.fetch_index_summaries()` (service role) →
  `build_collection_summaries` → `SupabaseDB.save_collections(...)` upsert. Glue untested
  locally; the pure builder is unit-tested.

## 5. Eval harness — `rag/eval/`

- `eval/gold.jsonl` — one JSON object per line: `{"question","expected_mode","expect_doc_substr"?}`.
  Seed with a few structural examples (clearly marked as seed, not institute gold).
- `eval/run_eval.py`: `run_eval(cases, llm) -> {"total","mode_correct","accuracy"}` — runs the
  T5 `router.route` per case, compares to `expected_mode`. Pure; offline with `FakeLLM`.
  `main()` loads `gold.jsonl` and prints the score.
- Test: `run_eval` on a tiny inline set with `FakeLLM` returns `accuracy == 1.0` when the
  `COUNT`-prefix convention matches `expected_mode`.

## 6. API + SPA

- `api.py`: after building the Answer, insert a `query_log` row via the scoped client and add
  its `id` to the JSON response as `query_id`.
- `src/lib/ask/client.ts`: `AskAnswer` gains `queryId: string | null`; add
  `sendFeedback(queryId, value: 1 | -1)` → `supabase.from('query_log').update({feedback})`.
- `AskSurya.tsx`: 👍/👎 buttons under an answer (disabled once sent).
- `src/lib/rag/monitor.ts`: `requeueAll()` → `supabase.rpc('rag_requeue_all')`.
- `RagMonitor.tsx`: "Re-index all" button in the header.

## 7. Testing

Python (offline): `test_collections.py` (grouping + counts), `test_eval.py` (accuracy on a
fake set). SPA (vitest): extend `client.test.ts` for `sendFeedback` fetch/rpc shape (mock
supabase). Acceptance: builder groups N docs across M entity_types into M collections; eval
runner reports accuracy; feedback update targets the right row id.
