# AHEAD+ Intelligence Blueprint

> **SUPERSEDED 2026-07-12 by `docs/roadmap/sources/AHEAD-INTELLIGENCE-MASTER.md`** — kept as history; edit the master instead.
>
> Status: DRAFT v0.1 — 2026-07-12. Owner: Vivek.
> The architectural constitution for AHEAD+ (SURYA): where intelligence lives, how
> information flows, which layers exist, and the rules every future feature follows.
> Horizon: 5 years. Companion: `docs/INTELLIGENCE-DESIGN.md` (current-state
> understanding + 12-month roadmap — this blueprint does not repeat it).
>
> Acceptance test for this document: any future feature request can be answered
> with "which layer does this strengthen?" If it can't, either the request is
> incoherent or this blueprint is incomplete — amend one of them.

---

## 1. Current Architecture (one paragraph — details in INTELLIGENCE-DESIGN.md)

A sovereignty-first, database-centric SPA: Postgres+RLS is the trust anchor; the
React client bulk-loads institutional data and derives everything in tested pure
functions; a separate Python service provides grounded RAG plus a whitelisted
analytics catalog routed by an LLM; a local LLM keeps everything on-prem. Two
halves (HR/analytics, PMS) share auth and shell. Intelligence exists but is
scattered and duplicated — that scatter, not missing features, is the
architectural problem this blueprint addresses.

## 2. Business Knowledge Map — where intelligence lives today

Inventory of every place business intelligence currently resides, with verdicts.

| # | Intelligence | Lives in | Belongs there? | Target home |
|---|---|---|---|---|
| K1 | PMS state machine, scoring windows, cycle lock | SQL (RPCs, constraints) | **Yes — never move.** Transitions are integrity, integrity lives in the DB | stays |
| K2 | Access policy (who sees what) | RLS policies + `ACCESS_MAP` | Yes. Two-tier by design: RLS = enforcement, ACCESS_MAP = navigation convenience | stays |
| K3 | Entity relationships (staff↔project↔division joins, name resolution) | `relations.ts` (client only) | Partially. Logic correct, location incomplete — invisible to server-side reasoning | **Semantic Layer** — one definition, two runtimes (TS for UI, Python catalog for Ask) |
| K4 | KPI/metric math (headcounts, utilization, director metrics) | Per-page `useMemo` + `utils/*Metrics.ts` + separately `analytics.py` | **No.** Duplicated definitions = the trust risk | **Semantic Layer** (metric registry; dashboards and catalog consume the same definition) |
| K5 | Analytical judgments (budget-variance 25pp, retirement 60, succession horizon, staleness bands, digest thresholds) | Constants in `analytics.py`, `freshness.ts`, `directorMetrics.ts`; some in **localStorage** (Director thresholds) | Mostly acceptable; localStorage is organizational memory loss — one Director's calibration dies with their browser | Semantic Layer constants; personal thresholds → `user_profiles` |
| K6 | Document understanding (PageIndex trees, summaries) | `doc_indexes` built by worker | Yes | stays — Knowledge Layer |
| K7 | Question-routing knowledge (few-shots, route labels, gold set) | `route_labels`, `eval/gold.jsonl` | Yes — learned governance data | stays — Governance Layer |
| K8 | Prompt templates / grounding rules | `rag/llm.py` (centralized) | Yes, and keep them thin: the catalog's descriptions should carry the domain knowledge, not the prompts | Reasoning Layer (mechanics only) |
| K9 | Excel column semantics (header detection, division resolution, date coercion) | `dataMigration.ts` heuristics | Hidden knowledge — this file silently encodes what institute spreadsheets *mean* | stays in ingestion, but is Semantic-Layer knowledge; document mappings as data, not only code |
| K10 | Institutional Q&A memory | query_log + feedback (terminates unused) | No — collected but not operationalized | Knowledge Layer (`verified_answers`, roadmap B4) |
| K11 | Operating conventions | `CLAUDE.md`, docs/ | Yes — knowledge for builders, not runtime | stays |

**Reading of the map:** enforcement intelligence (K1, K2) is correctly placed and
untouchable. Definition intelligence (K3, K4, K5) is the scattered/duplicated
class — consolidating it IS the architecture work of the next two years. Learned
intelligence (K6, K7, K10) has correct storage but an incomplete loop.

## 3. Future Architecture — the layer model

Seven layers. Not new services — new *contracts* over mostly existing code. The
smallest set that fits this application; resist adding more.

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
│   Postgres schemas · migrations · ingestion (Excel/ImportFlow,       │
│   documents queue, IRINS sync) · storage                             │
├─ L2 IDENTITY & ACCESS (cross-cutting) ───────────────────────────────┤
│   Supabase Auth · RLS · roles · caller-JWT threading · ACCESS_MAP    │
├─ L1 GOVERNANCE & LEARNING (cross-cutting) ───────────────────────────┤
│   eval harness + gold set · query/audit logs · feedback ·            │
│   route labels · migrations discipline · this blueprint              │
└──────────────────────────────────────────────────────────────────────┘
```

L2 and L1 are cross-cutting: every other layer runs *inside* them (every read is
RLS-scoped; every reasoning change is eval-gated).

## 4. Layer Responsibilities

### L3 — Data & Provenance
- **Purpose:** durable, auditable institutional facts with their origin intact.
- **Responsibilities:** schemas, migrations, RLS-enabled tables, ingestion
  pipelines (Excel, document queue, IRINS), storage, integrity RPCs (the PMS
  state machine lives here — it is data integrity, not reasoning).
- **In/out:** raw uploads + transactions in; role-scoped rows out.
- **Never here:** aggregation for display, LLM calls, UI concerns.
- **Communicates:** upward only, via supabase-js / plain selects. Nothing above
  writes except through sanctioned paths (import pipeline, RPCs, forms).
- **Today:** `supabase/migrations`, `dataMigration.ts`, worker ingest.
- **Evolution:** more sources (email, files, APIs) register through the
  `documents` queue; schema casing unification only if Excel stops being upstream.

### L4 — Semantic (the layer to BUILD — everything else exists)
- **Purpose:** single definition of every business concept: what an entity is,
  how entities relate, what every metric means, what thresholds encode judgment.
- **Responsibilities:** entity types; relationship joins (name resolution);
  metric registry (name → definition → compute); business constants; the catalog
  entries and their natural-language descriptions (the router reads the semantic
  layer to know what the institution can compute).
- **In/out:** role-scoped rows in; named, computed business facts out.
- **Never here:** rendering, prompt mechanics, storage details, side effects.
  Pure functions only — this is why it can exist twice (TS + Python) with tests
  keeping the twins honest.
- **Communicates:** consumed by L6 (catalog execution) and L7 (dashboards) —
  *both must call the same definitions*; the duplication that motivates this
  layer is dashboards and Ask computing the same number differently.
- **Today (scattered):** `relations.ts`, `src/lib/*`, `utils/*Metrics.ts`,
  `analytics.py` bodies + `CATALOG` descriptions.
- **Evolution:** year 1 — consolidate metric math into `src/lib/metrics/` +
  catalog functions (roadmap B1/B5). Year 2+ — if TS/Python twinning becomes the
  dominant tax, consider single-home options (Postgres functions or semantic
  endpoints); decide from evidence, not anticipation (see §11 D3).

### L5 — Knowledge
- **Purpose:** what the institution has *written and verified* — unstructured
  understanding and curated memory.
- **Responsibilities:** document trees (PageIndex), collection rollups, verified
  Q&A memory, citations with provenance (signed URLs).
- **In/out:** parsed documents + curation actions in; retrievable, citable
  knowledge out.
- **Never here:** business math (that is L4); uncited assertions.
- **Communicates:** read by L6 during traversal; written by worker (from L3
  queue) and by admin curation (L1 governance action).
- **Today:** `doc_indexes`, `doc_pages`, `collection_indexes`, `pageindex.py`.
- **Evolution:** verified_answers (B4); drift detection (re-run verified Qs after
  ingest); knowledge freshness metadata.

### L6 — Reasoning
- **Purpose:** turn a question plus role-scoped capability into a grounded answer.
  The only layer that calls an LLM at query time.
- **Responsibilities:** route (structured/document/hybrid), execute catalog
  functions under caller identity, traverse knowledge trees, assemble context,
  enforce the refusal invariant, attach citations.
- **In/out:** question (+ optional interaction context from L7) in; answer +
  citations + confidence/refusal out.
- **Never here:** business definitions (consumes L4), free-form SQL, credentials
  beyond the caller's JWT, state (single-shot; conversation state, when added,
  belongs to L7 sessions passing context in).
- **Communicates:** HTTP from L7; supabase reads via caller JWT; L4 functions by
  whitelisted name; logs every decision to L1.
- **Today:** `router.py`, `retrieval.py`, `query_service.py`, `llm.py`.
- **Evolution:** context envelope (B2); hybrid composition; multi-step planning
  only when eval evidence demands it (rejected until then — DESIGN B6).

### L7 — Experience
- **Purpose:** deliver intelligence where the user already is; capture intent
  and context.
- **Responsibilities:** role dashboards, Ask surfaces, proactive digest, exports,
  navigation (palette, entity links, graph), forms and workflow screens.
- **In/out:** L4 computed facts + L6 answers + L5 citations in; rendered
  decisions-support + user intent/context/feedback out.
- **Never here:** business math (call L4), direct Supabase writes from pages
  (contexts only), security decisions (L2 enforces; UI only hides).
- **Communicates:** contexts for data; HTTP to L6; every Ask interaction emits
  feedback to L1.
- **Today:** pages, contexts, `DataHealthDigest`, AskSurya.
- **Evolution:** three delivery modes converge — *look* (dashboards), *ask*
  (embedded copilot), *told* (digest) — all fed by the same L4/L6 stack.

### L2 — Identity & Access (cross-cutting)
- **Purpose:** one identity, one enforcement point, everywhere.
- **Responsibilities:** auth, composite roles + active_role, RLS policies,
  caller-JWT threading through every service, ACCESS_MAP navigation gating.
- **Never here:** role logic duplicated per-layer; service keys in user paths.
- **Evolution:** unchanged in shape. Any future write-capable agent tool inherits
  this layer as-is — the JWT is the agent's identity too (§11 D3).

### L1 — Governance & Learning (cross-cutting)
- **Purpose:** the system knows how well it works and improves on evidence.
- **Responsibilities:** eval harness + gold set as merge gate; query/audit logs;
  feedback capture; route labels; curation workflows; migrations discipline;
  maintenance of this blueprint.
- **Never here:** ungoverned learning (no silent fine-tuning; every learned
  artifact — few-shot, verified answer — is admin-visible data).
- **Evolution:** every new L4 function ships gold questions; verified-answer
  promotion; drift alerts; periodic eval trend reporting.

## 5. Intelligence Flow

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

Properties the flow must always satisfy:
1. **No layer skipping on the answer path.** Experience never computes business
   facts (L4's job) and never calls the LLM directly (L6's job).
2. **Identity flows with the request.** The same JWT that scopes a dashboard
   scopes the agent's tool call.
3. **Every answer is traceable** — to a catalog function or a citation; otherwise
   it is a refusal.
4. **Every interaction feeds the loop.** A question that routes badly becomes a
   label; a good answer can become verified memory.

## 6. Executive Experience (user thinking, not pages)

Target interaction mix per role — *told / ask / navigate*:

| Role | Told (proactive) | Ask (conversation) | Navigate | Rationale |
|---|---|---|---|---|
| Director | **40%** | 40% | 20% | Directors consume exceptions and answers, not tables. Opens dashboard → digest says what changed → asks "why" in place → navigates only to verify |
| DivisionHead / HoD | 30% | 30% | 40% | Manages own slice; digest scoped to division; still works rosters and approvals |
| Scientist | 10% | 30% | 60% | Task-driven (PMS self-report, own projects); Ask for institutional lookups ("who works on X") |
| HR / Finance Admin | 30% | 20% | 50% | Data stewardship is inherently navigational; digest carries data-health and deadline load |
| SystemAdmin | 20% | 10% | 70% | Operational consoles remain consoles |

Feel of every interaction: **the system already knows.** No retyping context the
screen already shows (context envelope); no answer without source (citation or
catalog name visible); no alert without a deep link to act. Conversation is a
*mode of the same surface*, not a separate destination — AskSurya the page remains
for open-ended work; the drawer meets users where they look.

Proactive ceiling: max 7 digest items, severity-ranked, each dismissible (V2) —
proactive intelligence that cries wolf gets ignored, then resented.

## 7. Intelligence Maturity Model

| Level | Name | Characteristics | AHEAD+ status |
|---|---|---|---|
| 1 | Traditional Information System | CRUD + reports; knowledge in people's heads | passed |
| 2 | Integrated Analytics | Role dashboards over unified data; derived metrics; manual insight | **passed** (dashboards, analytics pages, intelligence lib) |
| 3 | Knowledge Platform | Documents + data queryable in one grounded surface; answers cited; feedback captured | **≈70% here today.** Have: RAG, router, catalog, eval loop. Missing: entity coverage (B5), catalog breadth (B1), operationalized memory (B4), production E2E verification |
| 4 | Enterprise Intelligence Platform | Intelligence embedded in every surface; one semantic definition of truth; proactive by default; learning loop closed | Requires: L4 consolidation (metric registry both runtimes), context envelope (B2), digest matured (B3), verified answers live |
| 5 | Decision Intelligence Platform | System participates in decisions: simulations, recommendations, workflow-triggering agents with human approval | **Gated on policy, not tech** — requires reversing the read-only-tools decision (§11 D3), plus L6 planning + write-tools under L2 identity |

**Today: Level 2 complete, Level 3 in progress.** Next-level requirement =
finish Level 3 (roadmap phases 1–3: digest, entity catalog, catalog expansion,
verified answers) and verify RAG E2E on the production host — Level 3 is not
"reached" while the intelligence layer is unverified in production.

Five-year trajectory: L3 by month 6 · L4 by month 18–24 · L5 only after a
deliberate governance decision, not by drift.

## 8. Principles every future feature must follow

P1. **One definition of truth.** A number computed in two places is a bug even
    when both are right. New metric → L4 registry first, consumers second.
P2. **Intelligence is a governed capability, not a prompt.** Extending what the
    system can answer = adding a catalog function + gold questions — not
    engineering a cleverer prompt.
P3. **Identity travels with every request.** Any new service/tool executes under
    the caller's JWT. A capability that needs a service key in the user path is
    misdesigned.
P4. **Grounded or silent.** Every AI answer carries a citation or catalog name,
    or it refuses. No exceptions for "obviously correct" answers.
P5. **Deterministic before generative.** If a rule can decide it (digest,
    validation, state machine), no LLM is involved. LLMs route, summarize,
    traverse — they do not compute institutional facts.
P6. **Meet the user where they look.** New intelligence lands in existing
    surfaces (dashboard, digest, drawer) before it earns a new page.
P7. **Every capability ships with its measurement.** Catalog function → gold
    questions; digest rule → test; reasoning change → eval run. Unmeasured
    intelligence does not merge.
P8. **Provenance is sacred.** Preserve where facts came from (Excel headers,
    document citations, verified-by stamps) even when it is ugly.
P9. **Layers over features.** A feature request that strengthens no layer is
    either reshaped until it does, or declined.

## 9. Architectural Guardrails (mechanical checks)

- New table → RLS enabled + policy block in the same migration. No exceptions.
- New catalog function → entry in `ANALYTICS` + `CATALOG` + tests + gold
  questions in the same PR (mirror test enforces the first two).
- New page → consumes contexts/`useData()` only; registered in `ACCESS_MAP`.
- New metric on a dashboard → pure function in `src/lib/` with a test; page holds
  only `useMemo` composition.
- No LLM call outside `rag/llm.py` call paths; no prompt strings in the SPA.
- No PMS status writes outside RPCs; no role decisions from localStorage.
- Learned artifacts (few-shots, labels, verified answers) live in tables an admin
  can inspect — never buried in code or model state.
- Eval regression on `gold.jsonl` blocks merge of any router/catalog change.

## 10. Things that should never change

(Constitution — carried from INTELLIGENCE-DESIGN §A4, restated as permanent.)

1. RLS as the only hard data gate; caller-JWT threading end-to-end.
2. PMS transitions via SECURITY DEFINER RPCs only.
3. Catalog-membership whitelist — no free-form SQL from any model, ever.
4. Grounded-refusal invariant.
5. Deployment sovereignty: static-host SPA, on-prem local LLM.
6. Pages never touch Supabase directly.
7. Migrations discipline: append-only, `db push` only, baseline files immutable.

## 11. Architectural decisions to make BEFORE building new features `[DECIDE]`

D1. **Semantic-layer twinning policy.** Accept TS+Python dual runtimes with tests
    as the twin-keeper (current path), or designate one home (Postgres functions /
    semantic endpoint) once duplication tax is felt? Decide by: count of functions
    ported twice by month 6. *Default: keep twins; revisit at 20+ twinned
    functions.*
D2. **Excel endgame.** If SURYA becomes system-of-entry, the HR mirror-casing
    rationale dissolves and a unification migration becomes worth its cost.
    Decide before any large new HR entity. *Blocks: K9 formalization.*
D3. **Read-only boundary for AI tools.** Level 5 (and any "agent that files the
    reminder for you") needs write-tools. Policy decision with the Director, not
    an engineering one. *Default: read-only stands; revisit only with an explicit
    sponsor and audit design.*
D4. **Conversation state ownership.** When follow-ups arrive (B2 V2): state in L7
    session (browser) passing context down, or L6 server sessions? *Default: L7 —
    keeps L6 stateless; revisit if multi-device continuity is ever asked for.*
D5. **Personal calibration storage.** Director thresholds and future per-user
    tunings: `user_profiles` column vs settings table. Small, but decides where
    "personal organizational memory" lives. *Do before more per-user knobs ship.*
D6. **Production E2E gate.** WDAC/Python-3.12 blockers on the target host must be
    resolved (or deployment shape changed) before Level-3 claims. This is the
    single biggest risk to the whole intelligence trajectory: everything above L3
    data is unverified in production.

---

## Change log

| Date | Version | Change |
|---|---|---|
| 2026-07-12 | 0.1 | Initial blueprint: knowledge map, 7-layer model, flow, maturity model, principles, guardrails, pre-feature decisions |
