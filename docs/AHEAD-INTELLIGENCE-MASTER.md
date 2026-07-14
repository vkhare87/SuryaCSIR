# AHEAD+ (SURYA) — Intelligence Platform Master Document

> Status: v1.0 — 2026-07-12. Owner: Vivek.
> Single reference merging the architecture understanding, the 5-year blueprint,
> the 12-month roadmap, and phase status — the one document to open when planning
> any future phase. Supersedes `INTELLIGENCE-DESIGN.md` and
> `INTELLIGENCE-BLUEPRINT.md` (archived in `docs/archive/`).
> Phase-1 executable tasks stay in
> `docs/superpowers/plans/2026-07-12-intelligence-phase1-digest-entity-catalog.md`.
>
> Naming: codebase = **SURYA**; product name = **AHEAD+**. Module names below are
> as they appear in code.
>
> **How to use for phase planning:** read Part V for the phase ladder → check the
> phase's entry criteria → resolve any `[DECIDE]` items it depends on (Part IV §10)
> → validate each planned feature against the principles and guardrails (Part IV
> §8–9) by asking *"which layer does this strengthen?"* → write the executable plan.

---

# PART I — CURRENT ARCHITECTURE (understanding baseline)

## 1. System inventory

**Stack:** React 19 + TS 5.9 strict SPA (Vite 8, Tailwind 4, HashRouter), Supabase
(Postgres + Auth + RLS + Storage + pgvector), separate Python 3.12 service (`rag/`:
FastAPI + polling worker), local LLM (Ollama/OpenLLM). Deploy: Windows Server, NSSM
services, nginx serving SPA + same-origin `/rag/` proxy. No external AI APIs.

**Database — 8-file domain baseline (2026-07-12) + cleanup, ~59 tables:**

| Stage | Domain | Tables |
|---|---|---|
| 01 | extensions/helpers | pgvector, helper fns |
| 02 | auth_rbac | user_roles, user_profiles, pms_audit_logs, access_requests |
| 03 | hr_core (17) | divisions, staff, projects, project_staff, phd_students, phd_milestones, equipment, labs, scientific_outputs, ip_intelligence, contract_staff, vacancy_advertisements, vacancy_posts, irins_profiles/sync_log, mous, tech_transfers |
| 04 | pms (13) | appraisal_cycles, pms_reports (+sections, annexures), evaluation/empowered/grievance committees, evaluations, decisions, notifications, representations, AWP activities |
| 05 | committees_helpdesk (11) | committees, helpdesk routing/tickets |
| 06 | proposals_reports (6) | proposals, project reports |
| 07 | calendar_recruitment (2) | meetings, recruitment |
| 08 | rag_documents (6) | documents, doc_indexes, doc_pages, query_log, collection_indexes, route_labels |

**Frontend:** 71 lazy routes; one `ACCESS_MAP` constant drives nav + guards.
8 contexts (Auth, Data, PMS, ProjectReports, Proposals, Theme, Toast, UI). Pages
never touch Supabase — contexts + pure derivation functions (`src/lib/*`,
`utils/*`) with tests beside them.

**Data pipeline:** Excel/CSV → ImportFlow → `dataMigration.ts` (column detection,
validation, division resolution) → Supabase. Read path: DataContext bulk-loads
~20 HR tables at session start; joins/aggregation client-side (`relations.ts`,
`useMemo`).

**RAG:** `documents.ingest_status` queue → worker parses (PyMuPDF/OCR) → PageIndex
tree per document (LLM bottom-up summaries) → `doc_indexes`. Query: `/query` with
caller's JWT (RLS = only doc gate); router LLM picks structured (whitelisted
`analytics.py` function — catalog membership = no-free-SQL guarantee) / document
(tree traversal, grounded-refusal invariant, signed-URL citations) / hybrid.
Learning loop: query_log + feedback + admin route_labels → few-shots + gold set →
`eval/run_eval.py`.

## 2. Architecture model

```
┌────────────────────────── React SPA (static host) ──────────────────────────┐
│  Pages (71 routes, role-gated by ACCESS_MAP)                                │
│    ↓ hooks only                                                             │
│  Contexts: Auth │ Data (HR bulk cache) │ PMS │ Proposals │ Reports │ UI     │
│    ↓                                                                        │
│  Derivation layer: src/lib/* + utils/*  (pure, tested, client-side joins)   │
└───────────────┬───────────────────────────────────────────┬─────────────────┘
                │ supabase-js (anon key + user JWT)          │ /rag/ proxy (nginx)
                ▼                                            ▼
┌────────── Supabase ──────────────┐          ┌────── Python rag/ service ─────┐
│ Postgres: 8 domain schemas       │◄─────────│ FastAPI /query /similar        │
│ RLS on everything (the gate)     │ caller   │  router → analytics | traverse │
│ Auth + Storage + pgvector        │ JWT      │ Worker: parse→PageIndex→index  │
│ PMS RPCs (SECURITY DEFINER)      │          │ Local LLM (Ollama/OpenLLM)     │
└──────────────────────────────────┘          └────────────────────────────────┘
```

**Coupling map:**
- HR/analytics half and PMS half = two nearly independent apps sharing auth +
  shell. HR columns quoted CamelCase (mirrors Excel headers, incl. the
  `CompletioDate` typo — provenance is deliberate); PMS snake_case (born
  digital). Bridge = staff identity + roles.
- Tight cluster: DataContext ↔ types barrel ↔ dataMapper ↔ dataMigration ↔ mock
  data (the documented "5-file dance" for adding entities — deliberate).
- Independent: `rag/` (talks to app only via DB tables + HTTP), ImportFlow, each
  `src/lib/<domain>`, PDF export.
- Boundaries: (1) client↔DB — RLS is the single hard security boundary; (2)
  SPA↔rag — HTTP + JWT pass-through; (3) worker↔app — async via documents queue;
  (4) PMS writes — RPC-only around the state machine.

**Design philosophy (inferred from code, consistent):**
1. DB is the fortress, client untrusted — RLS everywhere, RPCs for transitions,
   no role decisions in localStorage.
2. Load once, derive in memory — institute scale (10³–10⁴ rows) makes bulk fetch
   + `useMemo` right; same instinct in Python (plain select, filter in code).
3. Schema mirrors provenance — Excel is upstream truth; re-import fidelity beats
   aesthetics.
4. Whitelists over generality — catalog not NL-to-SQL; ACCESS_MAP not scattered
   guards; refusal not hallucination.
5. Pure tested functions for logic; thin components for rendering.
6. Operational sovereignty — local LLM, static host, on-prem.

**Baked-in assumptions:** dataset fits browser memory; single institute; Excel
remains an ingestion source; host permits constrained native binaries (WDAC
friction real); client untrusted, reviewers honest.

## 3. Five-lens findings (condensed)

**Data:** Central entities = `divisions` (hub code) and `staff` (identity hub:
PMS scientist, PhD supervisor, PI, IRINS, HoD). HR relations soft/name-keyed,
resolved at read time; PMS relations hard FKs — two integrity regimes split
exactly along the Excel/born-digital line. Business knowledge encoded in schema:
retirement 60, 90-duty-day NOT_ASSESSED, Nov-30 cycle lock, 15-day representation
window, PhD milestone canon.

**Application:** Clean separation (pages / lib / contexts / access constant).
Complexity accumulates in DataContext (god-context, ~20 fetches, rerender
fan-out), dataMigration heuristics, per-page aggregations, and (future)
analytics.py catalog. Bottlenecks-in-waiting: browser memory/initial load growth,
single-worker OCR throughput.

**Intelligence:** LLM routes; deterministic Python computes; tree traversal
reads; refusal invariant guards. Cannot reach the LLM today: dashboard state
(Ask is a separate blind page), non-whitelisted domains (equipment, recruitment,
committees, helpdesk, PMS aggregates), cross-module entity
joins (client relations layer has no server twin), trend framing.
*(v1.2 correction: conversation history IS reachable — AskSurya sends the last
3 turns to `/query`/`/query/stream`, folded in by `query_service.py`; SSE
streaming is also shipped. Earlier revisions understated the code.)*

**UX:** Strong lateral navigation (EntityLink, RelatedRail, ExploreGraph,
palette, MyActions, digest). Forced navigation for filter-combination questions
and cross-page synthesis. Repetitive: per-file upload-clean-import, one-by-one
committee processing, admin route labeling.

**Evolution:** Maintainability high (strict TS, tests, honest dated debt ledger
in CLAUDE.md). Extensible along paved roads; weakest road = anything needing
app-server compute for the SPA. Scale ceiling = one institute, by design. Agent
prerequisites present (tool whitelist, JWT-scoped execution, audit tables, eval
gate); absent by apparent choice: multi-step planning, server-side conversation
state (client passes recent turns down — see D4), write-tools.

## 4. Open questions for the architect `[DECIDE-CONTEXT]`

1. Multi-institute (CSIR-wide) ever in scope, or single-institute permanent?
2. Excel upstream forever, or does SURYA become system-of-entry?
3. Name-keyed project↔staff links: accepted tradeoff or pending identity work?
4. Read-only AI tools: policy or not-yet?
5. Local-LLM constraint: contractual/policy or pragmatic?
6. Which dashboards do Director/HoDs actually open weekly?
7. migrations_archive fully reconciled with live prod after the restructure?

---

# PART II — BUSINESS KNOWLEDGE MAP (where intelligence lives today)

| # | Intelligence | Lives in | Belongs there? | Target home |
|---|---|---|---|---|
| K1 | PMS state machine, scoring windows, cycle lock | SQL (RPCs, constraints) | **Yes — never move** | stays (L3) |
| K2 | Access policy | RLS + `ACCESS_MAP` | Yes — RLS enforces, ACCESS_MAP navigates | stays (L2) |
| K3 | Entity relationships (staff↔project↔division, name resolution) | `relations.ts` (client only) | Logic right, location incomplete — invisible to server reasoning | **Semantic Layer** — one definition, two runtimes (TS + Python catalog) |
| K4 | KPI/metric math | Per-page `useMemo` + `utils/*Metrics.ts` + separately `analytics.py` | **No — duplicated definitions = trust risk** | **Semantic Layer** metric registry |
| K5 | Analytical judgments (variance 25pp, retirement 60, staleness bands, thresholds) | Constants in code; Director thresholds in **localStorage** | Mostly OK; localStorage = organizational memory that dies with a browser | Semantic constants; personal thresholds → `user_profiles` |
| K6 | Document understanding (PageIndex trees) | `doc_indexes` | Yes | stays (L5) |
| K7 | Routing knowledge (few-shots, labels, gold set) | `route_labels`, `gold.jsonl` | Yes — learned governance data | stays (L1) |
| K8 | Prompt templates / grounding rules | `rag/llm.py` | Yes; keep thin — catalog descriptions carry domain knowledge, not prompts | Reasoning mechanics (L6) |
| K9 | Excel column semantics | `dataMigration.ts` heuristics | Hidden knowledge — encodes what institute spreadsheets *mean* | stays in ingestion; document mappings as data |
| K10 | Institutional Q&A memory | query_log + feedback (terminates unused) | No — collected, not operationalized | Knowledge Layer (`verified_answers`, R4) |
| K11 | Operating conventions | CLAUDE.md, docs/ | Yes — builder knowledge | stays |

**Reading:** *enforcement* intelligence (K1, K2) correctly placed, untouchable.
*Definition* intelligence (K3, K4, K5) scattered/duplicated — consolidating it IS
the architecture work of the next two years. *Learned* intelligence (K6, K7, K10)
has right storage, incomplete loop.

---

# PART III — TARGET ARCHITECTURE (5-year blueprint)

## 5. The layer model

Seven layers — new *contracts* over mostly existing code, not new services.

```
┌─ L7 EXPERIENCE ──────────────────────────────────────────────────────┐
│   dashboards · Ask/AskDrawer · digest · exports · command palette    │
├─ L6 REASONING ───────────────────────────────────────────────────────┤
│   router · catalog executor · tree traversal · refusal invariant     │
├─ L5 KNOWLEDGE ───────────────────────────────────────────────────────┤
│   doc_indexes · collection indexes · verified answers · citations    │
├─ L4 SEMANTIC ────────────────────────────────────────────────────────┤
│   entity definitions · relationship joins · metric registry ·        │
│   business constants · catalog descriptions                          │
├─ L3 DATA & PROVENANCE ───────────────────────────────────────────────┤
│   Postgres schemas · migrations · ingestion (Excel, documents queue, │
│   IRINS) · storage · integrity RPCs (PMS state machine)              │
├─ L2 IDENTITY & ACCESS (cross-cutting) ───────────────────────────────┤
│   Supabase Auth · RLS · roles · caller-JWT threading · ACCESS_MAP    │
├─ L1 GOVERNANCE & LEARNING (cross-cutting) ───────────────────────────┤
│   eval harness + gold set · query/audit logs · feedback ·            │
│   route labels · migrations discipline · this document               │
└──────────────────────────────────────────────────────────────────────┘
```

L2 and L1 are cross-cutting: every layer runs inside them (every read
RLS-scoped; every reasoning change eval-gated).

## 6. Layer responsibilities

### L3 — Data & Provenance
- **Purpose:** durable, auditable institutional facts with origin intact.
- **Owns:** schemas, migrations, RLS-enabled tables, ingestion pipelines,
  storage, integrity RPCs (PMS state machine = data integrity, not reasoning).
- **Never here:** display aggregation, LLM calls, UI concerns.
- **Today:** `supabase/migrations`, `dataMigration.ts`, worker ingest.
- **Evolution:** new sources register through the `documents` queue; casing
  unification only if Excel stops being upstream (D2).

### L4 — Semantic ★ the layer to BUILD (everything else exists)
- **Purpose:** single definition of every business concept — entities,
  relationships, metrics, judgment thresholds.
- **Owns:** entity types; relationship joins (name resolution); metric registry
  (name → definition → compute); business constants; catalog entries + their
  natural-language descriptions (the router reads the semantic layer to know
  what the institution can compute).
- **Never here:** rendering, prompt mechanics, storage details, side effects.
  Pure functions only — which is why it can exist twice (TS + Python) with tests
  keeping twins honest.
- **Contract:** L6 catalog execution and L7 dashboards **must call the same
  definitions** — eliminating the K4 duplication is this layer's reason to exist.
- **Today (scattered):** `relations.ts`, `src/lib/*`, `utils/*Metrics.ts`,
  `analytics.py` bodies + `CATALOG`.
- **Evolution:** yr 1 consolidate (R1/R5); yr 2+ single-home only if twinning
  tax proves real (D1).

### L5 — Knowledge
- **Purpose:** what the institution has written and verified.
- **Owns:** document trees, collection rollups, verified Q&A memory, citations
  with provenance.
- **Never here:** business math (L4); uncited assertions.
- **Today:** `doc_indexes`, `doc_pages`, `collection_indexes`, `pageindex.py`.
- **Evolution:** verified_answers (R4); drift detection after ingest; freshness
  metadata.

### L6 — Reasoning
- **Purpose:** question + role-scoped capability → grounded answer. The only
  layer calling an LLM at query time.
- **Owns:** routing, catalog execution under caller identity, tree traversal,
  context assembly, refusal invariant, citations.
- **Never here:** business definitions (consumes L4), free-form SQL, credentials
  beyond caller JWT, state (conversation state belongs to L7 sessions, D4).
- **Today:** `router.py`, `retrieval.py`, `query_service.py`, `llm.py`.
- **Evolution:** context envelope (R2); multi-step planning ONLY with eval
  evidence (see rejections §13).

### L7 — Experience
- **Purpose:** deliver intelligence where the user already is; capture intent,
  context, feedback.
- **Owns:** role dashboards, Ask surfaces, proactive digest, exports, navigation,
  forms/workflow screens.
- **Never here:** business math (call L4), direct Supabase writes from pages,
  security decisions (L2 enforces, UI only hides).
- **Today:** pages, contexts, `DataHealthDigest`, AskSurya.
- **Evolution:** three delivery modes converge — *look* (dashboards), *ask*
  (embedded copilot), *told* (digest) — all fed by the same L4/L6 stack.

### L2 — Identity & Access (cross-cutting)
- One identity, one enforcement point. Auth, composite roles + active_role, RLS,
  caller-JWT threading, ACCESS_MAP. Never: per-layer role logic duplication;
  service keys in user paths. Future write-capable agent tools inherit this
  layer as-is — the JWT is the agent's identity too.

### L1 — Governance & Learning (cross-cutting)
- The system knows how well it works and improves on evidence. Eval harness +
  gold set as merge gate; query/audit logs; feedback; route labels; curation;
  migrations discipline; maintenance of this document. Never: ungoverned
  learning — every learned artifact is admin-inspectable data.

## 7. Intelligence flow

```
 Excel / documents / forms / IRINS
        │  (L3 ingestion, provenance kept)
        ▼
 Role-scoped facts  ──────────────  Parsed documents
        │  (L2: every read RLS-scoped)      │ (worker)
        ▼                                   ▼
 L4 SEMANTIC: entities resolved,      L5 KNOWLEDGE: trees,
 metrics computed, judgments applied  citations, verified memory
        │                                   │
        └────────────┬──────────────────────┘
                     ▼
        L6 REASONING: route → execute/traverse → ground → cite (or refuse)
                     │
                     ▼
        L7 EXPERIENCE: dashboard │ answer-in-place │ proactive digest
                     │
                     ▼
                  Decision
                     │
        feedback / labels / promotions
                     ▼
        L1 GOVERNANCE: eval gate ──► improves L4 catalog + L6 routing
```

Invariant properties of the flow:
1. No layer skipping on the answer path — Experience never computes business
   facts, never calls the LLM directly.
2. Identity flows with the request — the JWT that scopes a dashboard scopes the
   agent's tool call.
3. Every answer traceable to a catalog function or citation; otherwise refusal.
4. Every interaction feeds the loop — bad routing becomes a label; good answers
   can become verified memory.

## 8. Principles every future feature must follow

P1. **One definition of truth.** A number computed in two places is a bug even
    when both are right. New metric → L4 registry first, consumers second.
P2. **Intelligence is a governed capability, not a prompt.** Extending what the
    system answers = catalog function + gold questions, not cleverer prompts.
P3. **Identity travels with every request.** New service/tool executes under the
    caller's JWT; needing a service key in the user path = misdesign.
P4. **Grounded or silent.** Citation or catalog name on every AI answer, or
    refusal. No exceptions.
P5. **Deterministic before generative.** Rules decide where rules can (digest,
    validation, state machine). LLMs route, summarize, traverse — never compute
    institutional facts.
P6. **Meet the user where they look.** New intelligence lands in existing
    surfaces before it earns a new page.
P7. **Every capability ships with its measurement.** Catalog fn → gold
    questions; digest rule → test; reasoning change → eval run. Unmeasured
    intelligence does not merge.
P8. **Provenance is sacred.** Preserve where facts came from, even when ugly.
P9. **Layers over features.** A request that strengthens no layer is reshaped or
    declined.

## 9. Architectural guardrails (mechanical checks)

- New table → RLS + policy block in same migration. No exceptions.
- New catalog function → `ANALYTICS` + `CATALOG` + tests + gold questions in the
  same PR (mirror test enforces the first two).
- New page → contexts/`useData()` only; registered in `ACCESS_MAP`.
- New dashboard metric → pure function in `src/lib/` with test; page holds only
  `useMemo` composition.
- No LLM call outside `rag/llm.py` paths; no prompt strings in the SPA.
- No PMS status writes outside RPCs; no role decisions from localStorage.
- Learned artifacts live in admin-inspectable tables — never buried in code or
  model state.
- Eval regression on `gold.jsonl` blocks merge of any router/catalog change.
- **Typed tool contracts (v1.1):** new catalog functions return structured data
  with narration separated (e.g. `{data, template}` inside `Answer`) — never
  prose-only. Presentation is an L6/L7 concern; a tool whose output another tool
  cannot consume is misdesigned. Existing prose functions migrate as touched.
- **Decision trace (v1.1):** `query_log` captures the full answer tuple — user,
  question, route, function + params, doc nodes touched, refusal reason. An
  answer that cannot be reconstructed is an audit liability.
- **Definition versioning (v1.1):** every logged answer stamps the catalog
  version (git SHA suffices); verified answers stamp the data-load date. When a
  threshold or metric definition changes, past answers remain explainable.

## 10. Pre-feature architectural decisions `[DECIDE]`

| # | Decision | Default until decided | Trigger to revisit |
|---|---|---|---|
| D1 | Semantic twinning: keep TS+Python dual runtimes vs single home (Postgres fns / endpoint) | **Ratchet (amended v1.1):** existing twins tolerated; NEW metrics pick one home and the other side consumes the result | Any new metric proposed with a twin |
| D2 | Excel endgame: mirror-source forever vs SURYA as system-of-entry (unlocks casing unification) | Excel stays upstream | Before any large new HR entity |
| D3 | Read-only boundary for AI tools (gates Level 5 / any write-capable agent) | Read-only stands | Explicit sponsor + audit design, Director sign-off |
| D4 | Conversation state: L7 browser session passing context down vs L6 server sessions | **DECIDED by shipped code (v1.2):** L7 — AskSurya passes last 3 turns to `/query`; L6 stays stateless | Multi-device continuity requested |
| D5 | Personal calibration storage (Director thresholds etc.) | Move to `user_profiles` | Before more per-user knobs ship |
| D6 | Production E2E gate: resolve WDAC/Python-3.12 host blockers (or change deployment shape) | **BLOCKER (amended v1.1):** not a decision — the exit criterion of phase 1. No phase-2 planning before `/query` runs verified on the production host | — |

## 11. Constitution — things that never change

1. RLS as the only hard data gate; caller-JWT threading end-to-end.
2. PMS transitions via SECURITY DEFINER RPCs only.
3. Catalog-membership whitelist — no free-form SQL from any model, ever.
4. Grounded-refusal invariant.
5. Deployment sovereignty: static-host SPA (HashRouter), on-prem local LLM.
6. Pages never touch Supabase directly.
7. Migrations discipline: append-only, `db push` only, baseline immutable.

---

# PART IV — ROADMAP (12 months)

## 12. Existing seeds vs wishlist

Half the "Oracle Agent Studio wishlist" already exists here in seed form:

| Wishlist | Existing seed | Layer |
|---|---|---|
| Planner / agent routing | `rag/router.py` (structured/document/hybrid) | L6 |
| Semantic layer / tool registry | `rag/analytics.py` whitelisted catalog | L4 |
| Knowledge graph | `relations.ts` + ExploreGraph (client-side) | L4 |
| Institutional memory | query_log + feedback + route_labels + eval harness | L1/L5 |
| Dashboard intelligence | `src/lib/intelligence/*`, `src/lib/digest/*` | L4/L7 |
| Grounded RAG + citations | PageIndex traversal, refusal invariant, signed URLs | L5/L6 |

Strategy: **connect existing islands before building new systems.**

## 13. Roadmap items

### R1 — Semantic Business Layer (metric registry + catalog expansion) → L4
- **Problem:** KPI definitions duplicated (React `useMemo` vs `analytics.py`);
  chatbot and dashboard can disagree; one wrong number in an official reply
  kills trust.
- **Design:** grow catalog to 40–60 named metrics (name, description, params);
  lift dashboard KPI math into `src/lib/metrics/` pure functions as pages are
  touched. No new DB objects for MVP.
- **MVP:** 15→30 functions, prioritized by query-log mining of document-route
  fallbacks. **V2:** param-aware ranges/filters; catalog browser in RagMonitor.
- **Risk:** catalog bloat → routing confusion; mitigate with gold questions per
  function + eval gate (P7).

### R2 — Dashboard-Embedded Copilot ("Explain this", context envelope) → L6/L7
- **Problem:** Ask is a destination page; executive questions occur while
  looking at a chart; context is lost by the time they ask.
- **Design:** shared `AskDrawer`; KPI cards pass `{page, metric, filters,
  currentValue, period}`; `/query` accepts optional `context` block (~50 lines
  in `query_service.py`). Grounding unchanged — context is metadata, not
  authority.
- **MVP:** DirectorView cards, fixed question templates. **V2:** free-text
  follow-ups with session-scoped conversation context (per D4).
- **Risk:** prompt bloat (cap context size); causal "why" expectations —
  template answers separating "what data shows" from "possible factors per
  documents".

### R3 — Proactive Executive Digest → L7 (deterministic, zero LLM) ★ phase 1
- **Problem:** dashboards are pull; the platform knows things nobody looked at.
- **Design:** pure rule functions in `src/lib/digest/` over `useData()` arrays,
  merged + severity-sorted + capped 7 in the existing dashboard card.
- **Status:** phase 1 IN PLAN (see Part V). **V2:** per-role digests,
  `digest_dismissals` table, one-call LLM narration, PMS-cycle rule; email
  digest deferred (needs scheduler).
- **Risk:** alert fatigue → cap, rank, dismiss.

### R4 — Institutional Memory (verified answers) → L5/L1
- **Problem:** same questions recur (reviews, RTI, Parliament season); feedback
  collected but terminates unused (K10).
- **Design:** `verified_answers` table (question, answer, citations, embedding,
  verified_by/at; pgvector exists; RLS read-all/write-admin). `/query` embeds
  question, ≥0.9 similarity → verified answer with badge; else normal pipeline.
  "Promote to verified" in RagMonitor; verified pairs join the gold set.
- **Risk:** staleness after data changes → "verified as of <date>" stamp; V2
  re-validation job flags drift after uploads.

### R5 — Entity Layer for Ask → L4 ★ phase 1
- **Problem:** "What is Dr. X working on?" is a relational join that exists
  client-side (`relations.ts`) but is invisible to the structured route.
- **Explicitly NOT a graph database** — entities fit Postgres joins (~20 lines
  each, proven client-side).
- **Design:** catalog functions `staff_profile`, `projects_for_staff`,
  `division_summary`, `project_team`; normalized substring name match; ambiguity
  returns candidates, never guesses.
- **Status:** phase 1 IN PLAN. **V2:** composed cross-entity chains; ExploreGraph
  "ask about this node".

### Explicit rejections (revisit only with evidence)

| Rejected | Why |
|---|---|
| Agent orchestration framework / multi-agent teams | One agent surface + deterministic router suffice at institute scale; orchestration adds latency + failure modes for zero visible value |
| Full multi-step planner | Router IS a one-step planner; build only if eval shows answers needing 3+ tool calls |
| NL-to-SQL | Whitelist-only IS the security property making government deployment defensible (Constitution #3) |
| Separate knowledge-graph store / GraphRAG | R5 covers it at ~5% of cost |
| MCP tool bus, agent marketplace | No user problem behind them. (v1.2: SSE answer streaming was in fact already shipped — `/query/stream` — and stays; the rejection covers new streaming *infrastructure*, e.g. websockets/queues) |

## 14. Executive experience targets

Interaction mix per role — *told / ask / navigate*. Percentages are directional
intent, not measured targets (no instrumentation behind them yet — v1.1 review):

| Role | Told | Ask | Navigate | Rationale |
|---|---|---|---|---|
| Director | 40% | 40% | 20% | Consumes exceptions and answers, not tables: digest says what changed → asks "why" in place → navigates only to verify |
| DivisionHead / HoD | 30% | 30% | 40% | Own slice; division-scoped digest; still works rosters/approvals |
| Scientist | 10% | 30% | 60% | Task-driven (PMS, own projects); Ask for institutional lookups |
| HR / Finance | 30% | 20% | 50% | Stewardship is navigational; digest carries data-health + deadlines |
| SystemAdmin | 20% | 10% | 70% | Consoles remain consoles |

Feel: **the system already knows** — no retyping visible context, no answer
without source, no alert without a deep link. Conversation is a mode of the same
surface, not a separate destination.

## 15. Maturity model & position

| Level | Name | Characteristics | AHEAD+ |
|---|---|---|---|
| 1 | Traditional Information System | CRUD + reports | passed |
| 2 | Integrated Analytics | Role dashboards, unified data, derived metrics | **passed** |
| 3 | Knowledge Platform | Data + documents in one grounded, cited surface; feedback captured | **≈70% — current position.** Missing: entity coverage (R5), catalog breadth (R1), operationalized memory (R4), **production E2E verification (D6)** |
| 4 | Enterprise Intelligence Platform | Intelligence embedded in every surface; one semantic truth; proactive by default; loop closed | Requires L4 consolidation + R2 + R3 matured + R4 live |
| 5 | Decision Intelligence Platform | Simulations, recommendations, workflow-triggering agents with human approval | **Gated on policy (D3), not tech** |

Trajectory: L3 by month 6 · L4 by month 18–24 · L5 only by deliberate governance
decision, never by drift.

---

# PART V — PHASE PLAN

> Detailed per-phase implementation planning (work packages, entry/exit
> criteria, decision-consumption map): `docs/INTELLIGENCE-PHASES.md`.

## 16. Phase ladder

| Phase | When | Ships | Layer strengthened | Status |
|---|---|---|---|---|
| **1** | Month 1–2 | R3 digest (finish in-flight) + R5 entity functions + gold questions | L7, L4, L1 | **Plan written** — `docs/superpowers/plans/2026-07-12-intelligence-phase1-digest-entity-catalog.md` |
| **2** | Month 3–4 | R1 catalog expansion driven by query-log mining | L4 | entry criteria below |
| **3** | Month 5–6 | R4 verified answers | L5, L1 | — |
| **4** | Month 7–9 | R2 embedded copilot (DirectorView first) | L6, L7 | depends on phase-2 catalog maturity |
| **5** | Month 10–12 | V2s: dismissals + narration, drawer follow-ups, drift checks | polish | driven by observed usage |

Cross-cutting rule for every phase: every new catalog function lands with gold
eval questions; routing-accuracy regression blocks merge (P7, guardrails §9).

## 17. Phase 1 scope summary (executable plan exists — 6 tasks)

1. Verify + commit in-flight data-health digest work (freshness scoring,
   DataHealthDigest, DirectorView freshness column).
2. `src/lib/digest/executive.ts` — TDD: active projects past/near end date
   (60-day window), overdue PhD milestones, vacancies closing ≤14 days;
   role-scoped (stewards institute-wide, HoD own division).
3. Merge into dashboard card: `sortAndCap` (urgent>warning>info, max 7), heading
   "Needs Attention".
4. `staff_profile` + `projects_for_staff` in `analytics.py` (ports `relations.ts`
   joins; ambiguity → candidate list).
5. `division_summary` + `project_team`.
6. 8 gold routing questions + validator run.

Deferred from phase 1 (with reasons recorded in plan): PMS-cycle digest rule
(PMS data not in `useData()`), dismissals table, LLM narration, fuzzy name match.

**Phase-1 exit criterion (added v1.1, per D6):** `/query` verified end-to-end on
the production host — smoke eval passes there, query_log receiving real traffic.
Phase 1 is not "done" while the intelligence layer runs only in development.

## 18. Phase 2 planning frame (use this when planning next)

**Goal:** widen the semantic layer (R1) from ~17 functions (13 existing + 4 from
phase 1) toward 30, prioritized by evidence.

**Entry criteria — check before writing the phase-2 plan:**
- [ ] Phase 1 merged; eval green with new gold questions.
- [ ] Query log has ≥4–6 weeks of real usage to mine (which questions fell to the
      document route or refused — those are the missing functions).
- [ ] D6 status known: is `/query` running E2E on the production host? If not,
      query-log mining has no data — resolve D6 first or accept synthetic
      prioritization (Director interview instead of log mining).
- [ ] D5 decided if any phase-2 item adds per-user thresholds.

**Candidate function domains for phase 2 (validate against log/interview):**
equipment (utilization, AMC expiry), recruitment (pipeline by stage, time-to-fill),
PMS aggregates (submission rate by division — read-only, cycle-scoped),
committees/helpdesk (open items by age), trend variants of existing counts
(year-over-year publications, project starts).

**Phase-2 exit criteria:** ≥30 catalog functions; routing accuracy on expanded
gold set ≥ current baseline; zero KPI computed differently between a dashboard
and its catalog twin for migrated metrics (P1 spot-check).

**Standing questions to answer during phase 2:** twinning tax evidence for D1
(how many functions needed a TS twin?); which dashboards executives actually
open (Part I §4 Q6) — decides R2's landing spot in phase 4.

---

# PART VI — EXTERNAL REVIEW ADDENDUM (v1.1)

Critical review conducted 2026-07-12 from the standpoint of an enterprise agent-
platform chief architect (Oracle AI Agent Studio lens). Findings below; concrete
amendments already applied inline and marked "(v1.1)".

## 19. What passed review unchanged

Caller-JWT threading as agent identity, catalog-membership whitelist, grounded-
refusal invariant, eval-as-merge-gate. Enterprise-grade governance; do not touch.

## 20. Five principles the review insists on

**RP1 — Tools are typed contracts, not prose formatters.** Catalog functions
returning English sentences bake presentation (L7) into the tool layer (L4),
violating this document's own boundary. Consequences: composed/hybrid answers
can't consume tool output, AskDrawer can't render structured results, dashboards
can never call the functions (undermining P1), tests reduce to string-contains.
Cheap to adopt now, brutal at 60 functions. → Guardrail added §9.

**RP2 — One home per definition; twinning is an exception with an expiry.**
Managed duplication still drifts; paired tests catch divergence only where
someone remembered to write them. → D1 default flipped to a ratchet: existing
twins tolerated, new metrics pick one home.

**RP3 — Every answer carries a complete decision trace.** Citations cover
documents, not decisions. Government audit question: who asked what, which route
fired, which function with which params, why refusal. Schema-of-one-table fix
now; forensic archaeology later. → Guardrail added §9.

**RP4 — Version everything that shapes an answer.** Data provenance is sacred
(P8) but definition provenance was unaddressed: threshold changes silently
invalidate past answers; verified answers become a staleness factory without
stamps. → Guardrail added §9 (git SHA in query_log, data-load date on verified
answers).

**RP5 — Production parity precedes capability expansion.** The entire L4–L6
stack was verified only in development while the roadmap stacked five
capabilities on it — and phase 2 depends on production query logs that don't
exist. → D6 reclassified from decision to blocker; phase-1 exit criterion added
§17.

Ranked by cost-of-delay: RP1 > RP5 > RP3 > RP4 > RP2.

## 21. Simplifications noted (not yet applied)

- L5 (Knowledge) does little work as a separate layer at institute scale; if
  verified-answers does not grow into real curation by phase 3, fold L5 into
  L3 storage + L4 semantics and run a five-layer model.
- Maturity Level 5 discussion: keep to one line ("gated on D3"); further ink
  invites scope dreams.
- Experience percentages (§14): now marked directional; instrument before
  treating as targets.

---

## Change log

| Date | Version | Change |
|---|---|---|
| 2026-07-12 | 1.0 | Merged INTELLIGENCE-DESIGN + INTELLIGENCE-BLUEPRINT + phase-1 plan summary into single master reference; added phase-2 planning frame |
| 2026-07-12 | 1.1 | External review addendum (Part VI): typed-contract, decision-trace, versioning guardrails added §9; D1 flipped to twinning ratchet; D6 promoted to phase-1 exit blocker; §14 percentages marked directional |
| 2026-07-14 | 1.2 | Doc-vs-code corrections: SSE streaming (`/query/stream`) and 3-turn conversation history already shipped — §3 intelligence lens fixed, D4 marked decided-by-code (L7-side), §13 streaming rejection narrowed to new infra |
