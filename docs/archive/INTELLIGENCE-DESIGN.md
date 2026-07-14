# SURYA / AHEAD+ — Intelligence Platform Design Document

> **SUPERSEDED 2026-07-12 by `docs/AHEAD-INTELLIGENCE-MASTER.md`** — kept as history; edit the master instead.
>
> Status: DRAFT v0.1 — 2026-07-12. Owner: Vivek. This document consolidates (A) the
> architecture understanding of the current system and (B) the intelligence roadmap
> proposal that evolves SURYA from "Analytics Dashboard + RAG" into an Enterprise
> Intelligence Platform. Edit freely; sections marked `[DECIDE]` need an owner call.
>
> Companion artifacts:
> - Phase-1 executable plan: `docs/superpowers/plans/2026-07-12-intelligence-phase1-digest-entity-catalog.md`
> - Operating manual (conventions): `CLAUDE.md`
> - Existing architecture docs: `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`

Naming note: the codebase calls the system **SURYA**; product-facing name is **AHEAD+**.
This doc uses module names as they appear in code.

---

# PART A — Architecture Understanding (baseline)

## A1. System inventory

**Stack:** React 19 + TS 5.9 strict SPA (Vite 8, Tailwind 4, HashRouter), Supabase
(Postgres + Auth + RLS + Storage + pgvector), separate Python 3.12 service (`rag/`:
FastAPI + polling worker), local LLM (Ollama/OpenLLM). Deploy: Windows Server, NSSM
services, nginx serving SPA + same-origin `/rag/` proxy.

**Database:** 8-file domain baseline (2026-07-12) + cleanup migration, ~59 tables:

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

**Frontend:** 71 lazy routes; one `ACCESS_MAP` constant drives nav + route guards.
8 contexts (Auth, Data, PMS, ProjectReports, Proposals, Theme, Toast, UI). Pages
never touch Supabase directly — contexts + pure derivation functions (`src/lib/*`,
`utils/*`) with tests beside them.

**Data pipeline:** Excel/CSV → ImportFlow → `dataMigration.ts` → Supabase. Read
path: DataContext bulk-loads ~20 HR tables at session start; all joins/aggregation
client-side (`relations.ts`, `useMemo`).

**RAG:** `documents.ingest_status` queue → worker parses (PyMuPDF/OCR) → PageIndex
tree per doc (LLM bottom-up summaries) → `doc_indexes`. Query: `/query` with
caller's JWT (RLS = only doc gate); router LLM picks structured (whitelisted
`analytics.py` function — catalog membership = no-free-SQL guarantee) / document
(tree traversal, grounded-refusal invariant, signed-URL citations) / hybrid.
Learning loop: query_log + feedback + admin route labels → few-shots + gold set →
`eval/run_eval.py`.

## A2. Architecture model

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
- HR/analytics half and PMS half = two nearly independent apps sharing auth + shell.
  Different casing regimes (HR quoted CamelCase mirrors Excel; PMS snake_case).
  Bridge = staff identity + roles.
- Tight cluster: DataContext ↔ types barrel ↔ dataMapper ↔ dataMigration ↔ mock
  (the documented "5-file dance" — deliberate).
- Independent: `rag/` (talks to app only via DB tables + HTTP), ImportFlow, each
  `src/lib/<domain>`, PDF export.
- Boundaries: (1) client↔DB — RLS is the single hard security boundary; (2) SPA↔rag
  — HTTP + JWT pass-through; (3) worker↔app — async via documents queue; (4) PMS
  writes — RPC-only around the state machine.

**Design philosophy (inferred, consistent):**
1. DB is the fortress, client untrusted — RLS everywhere, RPCs for transitions.
2. Load once, derive in memory — institute scale (10³–10⁴ rows) makes bulk fetch +
   `useMemo` the right call; same instinct in Python (plain select, filter in code).
3. Schema mirrors provenance — Excel headers preserved (incl. `CompletioDate` typo)
   because Excel is upstream truth; PMS born-digital, so clean.
4. Whitelists over generality — analytics catalog not NL-to-SQL; ACCESS_MAP not
   scattered guards; refusal not hallucination.
5. Pure tested functions for logic; thin components for rendering.
6. Operational sovereignty — local LLM, static host, on-prem, no external AI APIs.

**Baked-in assumptions:** dataset fits browser memory; single institute; Excel
remains an ingestion source; host permits constrained native binaries (WDAC
friction is real); client is untrusted but reviewers are honest.

## A3. Five-lens findings (condensed)

**Data:** Central entities = divisions (hub code) and staff (identity hub). HR
relations soft/name-keyed, resolved at read time (`relations.ts`); PMS relations
hard FKs. Business knowledge encoded in schema: retirement age 60, 90-duty-day
NOT_ASSESSED, Nov-30 lock, 15-day representation window, PhD milestone canon.

**Application:** Clean separation (pages/lib/contexts/access). Complexity
accumulates in DataContext (god-context, ~20 fetches), dataMigration heuristics,
per-page aggregations, and (future) analytics.py catalog. Bottlenecks-in-waiting:
browser memory/initial load growth, DataContext rerender fan-out, single-worker
OCR throughput.

**Intelligence:** LLM routes; deterministic Python computes; tree traversal reads;
refusal invariant guards. What can't reach the LLM today: dashboard state (Ask is
a separate blind page), non-whitelisted domains (equipment, recruitment,
committees, helpdesk, PMS aggregates), conversation history, cross-module entity
joins (client relations layer has no server-side counterpart), trend framing.

**UX:** Strong lateral navigation (EntityLink, RelatedRail, ExploreGraph, palette,
MyActions, digest). Forced navigation for filter-combination questions and
cross-page synthesis. Repetitive: per-file upload-clean-import, one-by-one
committee processing, admin route labeling. Inherited "system of record" screens:
DataManagement, SetupWizard.

**Evolution:** Maintainability high (strict TS, tests, honest dated debt ledger).
Extensible along paved roads; weakest road = anything needing app-server compute.
Scale ceiling = one institute, by design. Agent prerequisites already present
(tool whitelist, JWT-scoped execution, audit tables, eval gate); absent by
apparent choice: multi-step planning, conversation state, write-tools.

## A4. Invariants — decisions that must NOT change

1. RLS mandatory on every table; no service key in user-facing query paths.
2. PMS transitions via SECURITY DEFINER RPCs only.
3. No free-form SQL from any LLM; catalog membership is the guarantee.
4. Grounded-refusal invariant (no citations → no answer).
5. HashRouter/static-host SPA; local LLM (deployment sovereignty).
6. Pages consume contexts, never Supabase directly.

## A5. Open questions for the architect `[DECIDE]`

1. Multi-institute (CSIR-wide) ever in scope, or single-institute permanent?
2. Excel upstream forever, or does SURYA become system-of-entry?
3. Name-keyed project↔staff links: accepted tradeoff or pending identity work?
4. Read-only AI tools: policy or not-yet? (Gates any future action-taking agent.)
5. Local-LLM constraint: contractual/policy or pragmatic?
6. Which dashboards do Director/HoDs actually open weekly?
7. migrations_archive fully reconciled with live prod after 2026-07-12 restructure?

---

# PART B — Intelligence Roadmap Proposal

## B0. Principles

- Small engineering effort, large user value, minimal architectural disruption.
- Connect existing islands before building new systems — half the "Oracle wishlist"
  already exists here in seed form.
- Every new catalog capability ships with gold eval questions; the eval harness is
  the governance mechanism.
- Single developer + AI assistance assumed throughout.

**Already in repo (verified) vs wishlist:**

| Wishlist item | Existing seed |
|---|---|
| Planner / agent routing | `rag/router.py` (structured/document/hybrid) |
| Semantic layer | `rag/analytics.py` whitelisted catalog |
| Knowledge graph | `src/lib/relations.ts` + ExploreGraph (client-side) |
| Institutional memory | query_log + feedback + route_labels few-shots + eval harness |
| Dashboard intelligence | `src/lib/intelligence/*`, `src/lib/digest/*` (in flight) |
| RAG + citations | PageIndex traversal, refusal invariant, signed-URL citations |

## B1. Semantic Business Layer — metric registry + catalog expansion

- **Problem:** KPI definitions live twice (React `useMemo` per dashboard;
  `analytics.py` for Ask). Chatbot and dashboard can disagree; one wrong number in
  an official reply kills trust.
- **Oracle analog:** Fusion semantic business objects / agent tool catalog.
- **Before → after:** ~15 canned analytics → 40–60 named metrics with one
  definition each, consumed by both dashboards and Ask.
- **Design:** grow `analytics.py` catalog (name, description, params); mirror on
  the frontend by lifting dashboard KPI math into `src/lib/metrics/` pure functions
  as pages are touched. No new DB objects (docstrings suffice for MVP).
- **Complexity:** low-moderate, additive. **Risks:** catalog bloat → routing
  confusion; mitigated by gold questions per function + eval gate.
- **MVP:** 15→30 functions, prioritized by query-log mining of document-route
  fallbacks. **V2:** param-aware date ranges/filters; catalog browser in RagMonitor.

## B2. Dashboard-Embedded Copilot ("Explain this") — context builder

- **Problem:** Ask is a destination page; executive questions occur while looking
  at a chart. Context (filters, metric, period) is lost by the time they ask.
- **Oracle analog:** context-aware embedded agents in Fusion screens.
- **Design:** shared `AskDrawer` component; KPI cards pass a small context object
  `{page, metric, filters, currentValue, period}`; `/query` accepts optional
  `context` block (≈50 lines in `query_service.py`); router prompt includes it.
  Grounding invariant unchanged — context is metadata, not authority.
- **Complexity:** moderate. **Risks:** prompt bloat (cap context size); users
  expect causal "why" the data can't support — template answers to separate "what
  data shows" from "possible factors per documents".
- **MVP:** DirectorView KPI cards, fixed question templates. **V2:** free-text
  follow-ups with session-scoped conversation context.

## B3. Proactive Executive Digest

- **Problem:** dashboards are pull; the platform knows things nobody looked at
  (project ending sans completion report, PMS non-submission, expiring AMC/MOU,
  stale uploads).
- **Oracle analog:** agent monitoring / scheduled agents — here rule-based,
  deterministic, zero LLM for MVP.
- **Design:** pure rule functions in `src/lib/digest/` over `useData()` arrays
  (pattern proven by `dataHealth.ts`), merged + severity-sorted + capped in the
  existing dashboard card. Client-side only.
- **Status:** phase 1 IN PLAN — see companion plan doc (data-health committed;
  executive rules: projects at/near end date, overdue PhD milestones, closing
  vacancies).
- **Risks:** alert fatigue → cap 7, severity-ranked, dismissible in V2.
- **V2:** per-role digests, `digest_dismissals` table, one-call LLM narration,
  PMS-cycle rule (needs PMS data wiring). Email digest deferred (needs scheduler).

## B4. Institutional Memory — verified answers

- **Problem:** same questions recur (reviews, RTI, Parliament season); each ask
  re-runs retrieval; plausible-wrong answers can recur too. Feedback is collected
  but terminates in RagMonitor.
- **Oracle analog:** knowledge curation / human-in-the-loop refinement. ~80% of
  the loop already exists.
- **Design:** `verified_answers` table (question, answer, citations, embedding,
  verified_by/at; pgvector already installed; RLS read-all/write-admin). `/query`
  embeds question, ≥0.9 similarity → return verified answer with badge; else
  normal pipeline. "Promote to verified" button in RagMonitor; verified pairs join
  the gold set.
- **Complexity:** low-moderate (one migration, one endpoint branch, two UI touches).
- **Risks:** staleness after data changes → stamp "verified as of <date>"; V2
  re-validation job that re-runs verified Qs after uploads and flags drift.

## B5. Entity Layer for Ask — expose the existing graph

- **Problem:** "What is Dr. X working on?" — the authoritative answer is a
  relational join that exists client-side (`relations.ts`) but is invisible to the
  structured route, so entity questions fall to document retrieval.
- **Explicitly NOT a graph database.** Entities fit Postgres joins; the client
  code proves each join is ~20 lines.
- **Design:** port relations logic to catalog functions — `staff_profile`,
  `projects_for_staff`, `division_summary`, `project_team`. Normalized substring
  name match; ambiguity returns a candidate list, never a guess.
- **Status:** phase 1 IN PLAN — see companion plan doc.
- **V2:** cross-entity chains ("students supervised by PIs in division X") as
  composed whitelisted functions; ExploreGraph "ask about this node".

## B6. Explicit rejections (revisit only with evidence)

| Rejected | Why |
|---|---|
| Agent orchestration framework / multi-agent | One agent surface + deterministic router suffice; orchestration adds latency + failure modes for zero visible value at this scale |
| Full multi-step planner | Router IS a one-step planner; build only if eval shows answers needing 3+ tool calls |
| NL-to-SQL | Whitelist-only is the security property making government deployment defensible |
| Separate knowledge-graph store / GraphRAG | B5 covers it at ~5% of the cost |
| Streaming infra, MCP tool bus, agent marketplace | No user problem behind them |

## B7. Sequencing (6–12 months, single dev)

| When | Ship | Rationale |
|---|---|---|
| Month 1–2 | B3 digest (finish in-flight) + B5 entity functions | Lowest effort, Director-visible; fixes most common query failures. **Plan written.** |
| Month 3–4 | B1 catalog expansion, driven by query-log mining | Real failure data now exists to prioritize |
| Month 5–6 | B4 verified answers | Close the feedback loop before usage scales |
| Month 7–9 | B2 embedded copilot (DirectorView first) | Depends on catalog maturity; the demo-able capstone |
| Month 10–12 | V2s: dismissals + narration, drawer follow-ups, drift checks | Polish driven by observed usage |

Cross-cutting rule: every new catalog function lands with gold eval questions in
`rag/eval/gold.jsonl`; routing accuracy gates merges.

---

## Change log

| Date | Version | Change |
|---|---|---|
| 2026-07-12 | 0.1 | Initial draft: architecture baseline + roadmap consolidated |
