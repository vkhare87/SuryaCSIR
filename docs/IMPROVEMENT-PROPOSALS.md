# Improvement Proposals — Structure Upgrades to Take Up Next

Prioritized upgrade briefs for the intelligence stack. Each is self-contained enough
to hand to a Claude session as-is ("implement proposal P1 from
docs/IMPROVEMENT-PROPOSALS.md"). Ordered by answer-quality impact per unit of effort.
Dissertation objective mapping noted where it applies (Outline §4.x).

Current state to know before any of these: trees are one level deep
(`rag/pageindex.py` — TOC top-level or flat per-page nodes, children always empty),
answers are generated from node *summaries* (never source page text,
`rag/retrieval.py:31`), traversal is a two-stage pick (doc roots → sections) added as
a scale guard, and the router is a single JSON-decision LLM call over a 10-function
whitelist (`rag/router.py`, `rag/analytics.py`).

---

## P1 — True hierarchical PageIndex trees (highest impact)

**Problem.** "PageIndex" currently means a one-level list of sections. Long reports
(100+ pages, nested TOCs) flatten into either a handful of huge sections or one node
per page — both hurt pick precision, and neither is the reasoning-over-hierarchy the
dissertation describes (§4.2).

**Proposed shape.**
- `rag/pageindex.py`: build multi-level trees from the full TOC (`parsed.toc` already
  carries levels 1..n); recursively summarize bottom-up (child summaries feed the
  parent's summary prompt). Cap depth at 3 and fan-out per node (~10) to bound LLM calls.
- `rag/retrieval.py`: replace the flat section pick with recursive descent — pick at
  each level using `llm.pick`, descend only into picked nodes, collect leaf nodes as
  answer candidates. Keep the existing refusal invariant at every level (empty picks
  → refusal).
- Store format is already JSON in `doc_indexes.tree` with a `nodes` child array —
  no migration needed. Bump a `tree_version` field so old flat trees still traverse.

**Effort:** ~2 sessions. **Risk:** more LLM calls per query (one pick per level);
mitigate by only recursing when a node has children.

## P2 — Answer synthesis from source page text, not summaries

**Problem.** The final answer is generated from one-sentence node summaries. The
model never sees the pages it cites, so answers hit a hard quality ceiling and the
citation (page range) is more precise than the evidence actually used.

**Proposed shape.**
- Ingest: store per-node page text (or per-page text) alongside the tree — either a
  `node_texts` jsonb column on `doc_indexes` or a `doc_pages(document_id, page, text)`
  table (new migration, RLS mirroring `doc_indexes`).
- Query: after picks, fetch the picked nodes' text (budget ~8k chars, truncate per
  node) and pass *that* to `llm.answer` instead of summaries. Summaries remain the
  navigation layer; text becomes the evidence layer.
- Grounding invariant unchanged: empty text → refusal.

**Effort:** ~1–2 sessions. Storage grows with corpus size — acceptable at institute
scale; revisit if past tens of GB. Pairs naturally with P1 (do P1 first).

## P3 — Conversation memory in Ask SURYA

**Problem.** `/query` is single-shot; follow-ups ("what about LWMD?") start from zero.

**Proposed shape.**
- SPA: keep a message list in `AskSurya.tsx` state; send the last N turns.
- API: `/query` accepts optional `history: [{question, answer}]`; router prompt gets
  a condensed history line; document path prepends it to the pick/answer prompts.
- No schema change (query_log rows stay per-question). Cap history at ~3 turns.

**Effort:** ~1 session.

## P4 — Collection-stage traversal + corpus pagination

**Problem.** `read_docs` caps at 200 docs (marked `ponytail:` in
`rag/query_service.py`); the doc-level pick prompt grows linearly with corpus size;
`collection_indexes` is built (`worker.py --build-collections`) but never read at
query time.

**Proposed shape.** Three-stage descent: pick over `collection_indexes` summaries →
fetch only that collection's doc roots (paginated query filtered by `entity_type`) →
existing doc/section picks. Removes the 200-doc cap entirely. Schedule
`--build-collections` after each worker pass so collections stay fresh.

**Effort:** ~1 session. Do when the corpus approaches ~100 docs; before that the
current two-stage pick is fine.

## P5 — Ingest robustness: retry, dead-letter, re-index

**Problem.** A `failed` doc stays failed until a human retries; a model upgrade
doesn't refresh stale trees; a poison document can be retried forever by hand.

**Proposed shape.**
- `documents` gains `ingest_attempts int default 0` (new migration); worker retries
  failures with backoff up to 3 attempts, then leaves `failed` (dead-letter) with the
  last error.
- `worker.py --reindex-model <model>`: reset `indexed` docs whose `doc_indexes.model`
  differs, letting the normal loop rebuild them.
- RagMonitor: show attempts + "reindex all" for admins.

**Effort:** ~1 session. **Dissertation:** operational-readiness evidence for §4.5.

## P6 — Router quality loop: feedback-driven few-shots

**Problem.** Route accuracy depends on a static prompt. `query_log` already captures
mode, latency, and 👍/👎, but nothing feeds back.

**Proposed shape.** Nightly (or manual) job: pull 👎-rated queries, have the admin
label the correct route in RagMonitor (one click), append labeled cases to
`eval/gold.jsonl`, and inject the top-K confusable examples as few-shots into
`_route_user_prompt`. Track accuracy per release via `run_eval.py` in CI.

**Effort:** ~1–2 sessions. **Dissertation:** the evaluation-framework story (§4.6)
becomes a closed loop instead of a one-off score.

## P7 — Multi-institute scalability (the §4.5 commitment)

**Problem.** Schema has no laboratory dimension; the scalability architecture exists
only as prose. Scaling to other CSIR labs today means one deployment per lab.

**Proposed shape (design doc first, then migration).**
- `labs` table + `lab_code` column on `documents`, `divisions`, and new entities;
  default `'AMPRI'` backfill so nothing breaks.
- RLS policies gain a lab predicate; `user_profiles` gets `lab_code`.
- Collections become per-lab; cross-lab queries are a Director/HQ-role capability.
- Write it as `docs/superpowers/specs/` design first — this is a coordinated
  DB + RLS + UI change, the same class as the HR column-casing debt.

**Effort:** ~3–4 sessions. Do the design doc for the dissertation now; implement later.

## P8 — Optional pgvector hybrid retrieval

**Problem (conditional).** If P1/P2 evals still miss on paraphrase-heavy queries
(reasoning picks depend on section titles/summaries being well-phrased), a semantic
recall layer helps.

**Proposed shape.** pgvector column on the per-node text from P2; hybrid = vector
top-K as *candidate filter*, LLM pick as *reasoner* over that subset. Explicitly
deferred by the original plan ("add hybrid only if evals demand") — hold until
citation hit-rate on real docs is measured and found wanting.

**Effort:** ~2 sessions + infra. Don't start before P10 produces a real number.

## P9 — Latency budget + streaming answers

**Problem.** 2 sequential LLM calls (route → answer) plus picks, each with a 300s
timeout, on CPU-only Ollama. `latency_ms` is logged but nothing acts on it.

**Proposed shape.** Per-stage timeout budget (route 10s, pick 20s, answer 60s) with
graceful degradation (route timeout → document path); stream the answer token-by-token
(`stream: true` from Ollama, SSE from FastAPI, incremental render in AskSurya).
Latency percentile chart in RagMonitor from existing `query_log.latency_ms`.

**Effort:** ~2 sessions. **Dissertation:** decision-preparation-time baseline (§10.1)
gets real numbers.

## P10 — Gold-set authoring on real documents (do this first, costs nothing)

**Problem.** Router gold set is 50 synthetic cases; citation gold set is 1
placeholder. The dissertation's ≥80% retrieval-accuracy target is unmeasured, and
every proposal above should be judged by whether it moves these numbers.

**Proposed shape.** On the institute host after real docs are ingested: dump the
corpus (SQL in `eval/run_eval.py` docstring) → author 25–50
`{question, expected_citation}` cases with a supervisor/scientist → run
`LLM_BACKEND=openllm python eval/run_eval.py` → record both metrics in the
dissertation (validation evidence, §4.4/§4.6 and supervisor's real-data remark).

**Effort:** an afternoon, mostly human. **This is the yardstick for P1–P9 — do it
before optimizing further.**

---

## Suggested order

**P10 → P1 → P2** (measure, then fix the two structural ceilings) → **P3/P5/P9**
(UX + ops, independent) → **P4** when corpus grows → **P6** ongoing → **P7** design
doc now, build later → **P8** only if the numbers demand it.
