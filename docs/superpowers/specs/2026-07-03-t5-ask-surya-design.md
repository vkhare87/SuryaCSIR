# T5 — Ask SURYA (Query Surface) Design Spec

> Tranche T5 of the SURYA overhaul (F7). Server-side `/query` endpoint on the RAG service +
> SPA chat page. Builds on T4's `doc_indexes` PageIndex trees.
> Date: 2026-07-03. Status: approved to proceed ("go ahead with T5").

---

## 1. Goal & Scope

Answer natural-language questions, scoped to the caller's role/tier, with citations.
Router classifies each question → **document** (PageIndex traversal over trees the caller may
read) or **structured** (a whitelisted, parameterized analytics function). Answers carry
citations that deep-link to the source document.

**In scope (T5):**
- FastAPI `/query` on the existing `rag/` service (thin web layer).
- Auth: caller's Supabase JWT used end-to-end → **RLS is the single scoping gate**.
- Router (OpenLLM) → `document` | `structured`; robust parse, default `document`.
- Document path: reasoning traversal of `doc_indexes` trees → synthesized answer + citations.
- Structured path: **whitelist-guarded** function registry (never free-form SQL); MVP ships
  one function + the guard that rejects any non-whitelisted call.
- SPA `/ask` page + `lib/ask/client.ts`; citations deep-link via the existing signed-URL helper.

**Explicit non-goals (deferred to T6):**
- No `hybrid` mode (run-both) — router returns exactly one branch.
- No collection/corpus pre-filter — candidate docs come straight from RLS-scoped `doc_indexes`.
- No query log / feedback loop / eval set (T6).
- No pgvector.

---

## 2. Security Model (the core of T5)

1. SPA sends `Authorization: Bearer <supabase access_token>` (from the live session) to `/query`.
2. The service builds a **per-request Supabase client using the anon key + that JWT**. Every
   data read in the query path goes through this user-scoped client, so Postgres RLS decides
   exactly which `documents` / `doc_indexes` rows are visible. The service holds **no service
   key** — it cannot see anything the caller can't.
3. `auth.py` verifies the token (`supabase.auth.get_user(jwt)`); a missing/invalid token →
   `401`. The verified `user` + a scoped client are passed to the handlers.
4. Structured path executes only names present in the `ANALYTICS` whitelist, with typed params;
   an unknown name never reaches the database. This is the "no free-form text2SQL" guarantee.

Because RLS already enforces the confidential PMS tier (owner + admins + Director only), a
Scientist asking about another scientist's appraisal simply gets zero candidate rows — the
answer path has nothing to traverse. No tier logic is duplicated in Python.

---

## 3. Architecture (additions to `rag/`)

```
rag/
  auth.py        verify_token(jwt, anon_url, anon_key) -> User; scoped_client(jwt) -> Client
  router.py      route(question, llm) -> 'document' | 'structured'  (pure; llm-driven, safe default)
  retrieval.py   traverse(docs, question, llm) -> Answer            (pure; reasoning over trees)
  analytics.py   ANALYTICS registry + run_analytics(name, params, client) -> Answer (whitelist guard)
  answer.py      Answer / Citation dataclasses (shared shapes)
  api.py         FastAPI app: POST /query  (thin; wires auth -> router -> path -> Answer)
```

`router.py`, `retrieval.py`, `analytics.py`, `answer.py` are **pure and unit-tested with
fakes** (no network). `auth.py` and `api.py` are thin adapters over Supabase/FastAPI —
reviewed, not unit-tested locally (pydantic-core / Supabase need live services + native wheels
that this dev host's Application-Control policy blocks; same split as T4's parse/worker).

### Data shapes (`answer.py`)

```python
@dataclass
class Citation:
    document_id: str
    title: str
    node_title: str
    page_start: int
    page_end: int

@dataclass
class Answer:
    text: str
    mode: str                 # 'document' | 'structured'
    citations: list           # list[Citation]
```

### Document path (`retrieval.py`)

`traverse(docs, question, llm) -> Answer` where `docs = [{id, title, tree}]`:
1. Flatten each tree's nodes → `(document_id, title, node)` candidates.
2. Ask the llm to pick the most relevant nodes for the question (llm returns node indices).
3. Build context from picked node summaries; llm synthesizes a one-paragraph answer.
4. Emit a `Citation` per picked node. Empty candidate set → `Answer("No documents available
   to answer this.", 'document', [])`.

Tested with a `FakeLLM` whose `pick`/`summarize` are deterministic.

### Structured path (`analytics.py`)

```python
ANALYTICS = {
    "count_documents_by_status": _count_documents_by_status,  # (params, client) -> Answer
}

def run_analytics(name, params, client) -> Answer:
    fn = ANALYTICS.get(name)
    if fn is None:
        raise ValueError(f"Not a whitelisted analytics function: {name}")
    return fn(params, client)
```

Router's structured branch asks the llm for `{"function": ..., "params": {...}}`; the handler
validates `function` ∈ `ANALYTICS` (else falls back to the document path) before any DB call.

### `/query` (`api.py`)

`POST /query  { "question": str }`, `Authorization: Bearer <jwt>` →
`{ "answer": str, "mode": str, "citations": [...] }`. Verify token → `route` → run branch →
serialize `Answer`. Errors: `401` no/invalid token; `400` empty question.

---

## 4. SPA — Ask SURYA page

- **Route:** `/ask`, roles `ALL_ROLES` (RLS scopes results per caller).
- **Files:** `src/pages/AskSurya.tsx` (default export) + `src/lib/ask/client.ts`.
- **Env:** `VITE_RAG_URL` (e.g. `http://localhost:8000`) in `.env` / `.env.example`.
- **client.ts:** `askSurya(question): Promise<AskAnswer>` — POSTs to `${VITE_RAG_URL}/query`
  with the current session `access_token` (`supabase.auth.getSession()`); throws on non-200.
- **Page:** single question input + answer card + citation list. Each citation links to the
  document via the existing `getSignedUrl` helper in `src/lib/documents/registry.ts`. Loading
  + error states. Semantic tokens, `useMemo` where derived.
- **Nav:** add `/ask` ("Ask SURYA") to Layout Overview section; ACCESS_MAP + App route.

---

## 5. Testing

Python (`pytest`, offline, fakes):
- `test_router.py` — llm says "structured" → `'structured'`; unknown/garbage → `'document'`.
- `test_retrieval.py` — 2 docs with trees + FakeLLM picking node 0 → answer text set, exactly
  one citation with correct `document_id`/`page_start`; empty docs → empty-citation answer.
- `test_analytics.py` — `run_analytics` on a whitelisted name calls the fn; **unknown name
  raises** (the security guard).

SPA (`vitest`):
- `src/lib/ask/client.test.ts` — mocks fetch: 200 → parsed `AskAnswer`; non-200 → throws.

**Acceptance:** document question with a readable indexed doc returns an answer + ≥1 citation;
structured question routes to a whitelisted function; a non-whitelisted function name never
executes; unauthenticated `/query` → 401 (reviewed in `api.py`).

---

## 6. Deferred to T6
Hybrid answers; collection-level pre-filtering; query log + 👍/👎 feedback; eval set; pgvector.
