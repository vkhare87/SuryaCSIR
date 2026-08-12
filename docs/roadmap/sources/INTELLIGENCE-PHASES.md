# AHEAD+ Intelligence — Phase Implementation Planning

> **Source document for [ROADMAP.md](../ROADMAP.md).** This brief carries the implementation detail;
> the roadmap says which work package it belongs to and what it depends on. Item IDs here
> are the ones the roadmap references. Status lines below may predate the roadmap — check
> there first.


> Status: v1.0 — 2026-07-12. Owner: Vivek. Planning document — NO implementation.
> Breaks `docs/roadmap/sources/AHEAD-INTELLIGENCE-MASTER.md` (v1.1) Part V into executable phases
> with work packages, entry/exit criteria, and verification. Sits between the
> master (strategy) and per-phase task plans (execution, TDD-level).
>
> Rule: each phase gets its own task-level executable plan (like the phase-1 plan)
> written ONLY after its entry criteria pass. This document defines what those
> plans must contain — it does not replace them.
>
> References: master doc sections cited as `M§n`; roadmap items `R1–R5`;
> decisions `D1–D6`; review principles `RP1–RP5`; guardrails `M§9`.

## Phase overview

| Phase | Name | Objective | Layers | Calendar | Effort (dev-days) |
|---|---|---|---|---|---|
| 1a | Digest + Entity Catalog | Proactive alerts on dashboard; entity questions answerable | L7, L4, L1 | Month 1 | 4–6 |
| 1b | Production Gate (D6) | `/query` verified E2E on production host | L6 ops | Month 1–2 | 3–8 (host-dependent) |
| 2 | Semantic Catalog + Governance Hardening | 30+ typed catalog functions; decision trace + versioning live | L4, L1 | Month 3–4 | 10–15 |
| 3 | Institutional Memory | Verified answers loop closed | L5, L1 | Month 5–6 | 5–8 |
| 4 | Embedded Copilot | "Explain this" on Director dashboard | L6, L7 | Month 7–9 | 10–14 |
| 5 | Maturation & V2s | Dismissals, narration, follow-ups, drift checks — evidence-driven | polish | Month 10–12 | usage-driven |

Serial by design — each phase consumes evidence the previous one produces.
Effort assumes single developer + AI assistance; calendar assumes part-time.

---

## Phase 1a — Digest + Entity Catalog

**Objective:** dashboard tells stewards what needs attention; Ask answers
"who is X / what does X work on / who runs division Y".

**Status:** task-level plan WRITTEN —
`docs/superpowers/plans/2026-07-12-intelligence-phase1-digest-entity-catalog.md`
(6 tasks, TDD steps, full code). Execute as-is.

**Entry criteria:** none (in-flight work already in the tree).

**Work packages (from the existing plan):**
- WP1: verify + commit in-flight data-health digest (freshness scoring,
  DataHealthDigest card, DirectorView freshness column).
- WP2: `src/lib/digest/executive.ts` — projects past/near end date, overdue PhD
  milestones, closing vacancies; role-scoped.
- WP3: merge + `sortAndCap` into the dashboard card ("Needs Attention").
- WP4–5: four catalog functions — `staff_profile`, `projects_for_staff`,
  `division_summary`, `project_team` (ports of `relations.ts` joins).
- WP6: 8 gold routing questions + validator run.

**RP1 note (decided v1.1 review):** the four functions are grandfathered on the
prose-`Answer` pattern; typed contracts start Phase 2. Do not retrofit here.

**Exit criteria:**
- All plan tasks committed; `npm test`, `tsc`, eslint, `pytest tests/test_analytics.py` green.
- Digest renders for Director/steward roles with live data; items deep-link.
- Gold set passes `validate_gold.py`; eval baseline recorded for phase-2 comparison.

**Risks:** parseDate variance across real Excel date formats (mitigation: rules
skip unparseable rows — already in plan); digest noise on real data (cap 7 +
severity sort already designed).

---

## Phase 1b — Production Gate (D6) ★ BLOCKER for everything after

**Objective:** the intelligence layer runs where users are. `/query` + worker
verified end-to-end on the institute Windows Server host.

**Why a phase, not a checklist item:** M Part VI RP5 — phase 2 mines production
query logs; without 1b there is nothing to mine and Level-3 cannot be claimed.

**Entry criteria:** phase 1a merged (ship the entity functions so early
production traffic exercises them).

**Work packages:**
- WP1: host prerequisites per `deploy/README.md` — Python 3.12 venv, WDAC
  allowance for PyMuPDF `_mupdf` DLL (or policy exception process), Tesseract if
  OCR needed, Ollama/OpenLLM service.
- WP2: apply migration baseline to production via `supabase db push`; run
  `supabase/seed/*.sql`; confirm `rag/preflight.py` passes on host.
- WP3: NSSM services for worker + API; nginx `/rag/` same-origin proxy per
  `deploy/nginx.conf`.
- WP4: smoke verification — ingest 3–5 real institutional documents through the
  queue; run `eval/run_eval.py` against the production endpoint; confirm
  query_log rows land; confirm citations open via signed URLs.
- WP5: fallback decision if WDAC cannot be satisfied — document the alternative
  (different parse backend, separate parse host, or policy escalation). This is
  the phase's real risk; time-box investigation to 2 days before escalating.

**Exit criteria:**
- A Director-role user asks 5 scripted questions in production AskSurya; all
  return grounded answers or correct refusals with citations.
- Worker drains a pending document within one poll interval on the host.
- Eval smoke suite ≥ dev baseline on the production endpoint.
- Runbook updated with anything learned (deploy/README.md).

**Risks:** WDAC/Smart App Control blocks native DLLs (known — memory + CLAUDE.md);
Python 3.14 default on host (pin 3.12); Ollama model quality/latency on host
hardware (record latency in exit measurements; feeds phase-4 UX decisions).

---

## Phase 2 — Semantic Catalog Expansion + Governance Hardening

**Objective:** catalog grows ~17 → 30+ functions, prioritized by evidence; every
answer becomes traceable and versioned (RP3/RP4); typed contracts begin (RP1);
twinning ratchet enforced (RP2/D1).

**Entry criteria (M§18, amended):**
- [ ] Phase 1a merged, eval green.
- [ ] Phase 1b exit criteria met (production traffic exists).
- [ ] 4–6 weeks of production query_log to mine. If usage is too thin, substitute
      a structured Director/HoD interview (30 min, "what would you ask it?") and
      record that prioritization was synthetic.
- [ ] D5 decided if any new function needs per-user thresholds.

**Work packages:**
- WP1 — **Governance hardening first** (RP3/RP4, do before adding functions):
  - Migration: extend `query_log` with decision-trace columns — route, function
    name, params (jsonb), doc nodes touched, refusal reason, catalog version
    (git SHA). Additive, RLS unchanged.
  - `query_service.py`: populate the tuple on every answer path.
  - RagMonitor: surface trace fields in the existing log view.
  - Size: ~1 migration + ~100 lines Python + small UI. 2–3 days.
- WP2 — **Typed contract pattern** (RP1): define the structured-Answer
  convention (`{data, template}` or equivalent) with ONE reference function +
  test, documented in `analytics.py` header comment. All WP3 functions follow it.
  Grandfathered prose functions migrate only as touched. 1 day.
- WP3 — **Catalog expansion** (~13–15 new functions in priority order from log
  mining). Candidate domains (validate against evidence before committing):
  - equipment: utilization, AMC/warranty expiry horizon
  - recruitment: pipeline by drive stage, open positions by division
  - PMS aggregates (read-only, cycle-scoped): submission rate by division,
    status distribution — respects constitution (no status writes)
  - committees/helpdesk: open items by age bucket
  - trends: year-over-year publications, project starts, expenditure by year
  - Each function = ~30–60 lines + tests + 2 gold questions (guardrail M§9).
  Batched 3–5 functions per PR, eval gate per batch. 6–9 days total.
- WP4 — **Twinning ratchet compliance** (RP2): for each new function, decide the
  home; if a dashboard later needs the same number, dashboard consumes catalog
  output shape or a shared constant — no new TS twin. Record home decisions in
  a table in this doc's phase-2 completion notes.

**Exit criteria:**
- ≥30 catalog functions; routing accuracy on expanded gold set ≥ phase-1 baseline.
- Every production answer row carries full trace + version stamp.
- Zero new TS/Python metric twins introduced (spot-check per P1).
- Evidence file for D1: count of functions that *wanted* a twin (feeds D1 review).

**Risks:** catalog bloat degrading router accuracy (mitigate: batch + eval gate;
prune or merge functions the router confuses); PMS aggregate functions must not
leak individual scores across roles — RLS review per function (L2 check in PR).

---

## Phase 3 — Institutional Memory (Verified Answers)

**Objective:** admin-verified Q&A short-circuit; feedback loop terminates in
curated knowledge instead of a dead-end log (K10 → L5).

**Entry criteria:**
- [ ] Phase 2 trace/versioning live (verified answers depend on version stamps —
      RP4 — or they become a staleness factory).
- [ ] RagMonitor shows enough thumbs-up answers to seed ≥10 candidate promotions.
- [ ] Embedding model choice confirmed working on host (pgvector exists; needs
      an embedding path in `rag/` — check Ollama embedding support during 1b).

**Work packages:**
- WP1 — Migration: `verified_answers` (question, answer, citations jsonb,
  embedding vector, verified_by, verified_at, data_version). RLS:
  read-authenticated, write-admin. 1 day.
- WP2 — `/query` short-circuit: embed incoming question, cosine ≥ 0.9 against
  verified_answers → return with "verified" flag + stamp; else normal pipeline.
  Log the short-circuit in the decision trace. 2 days.
- WP3 — RagMonitor "Promote to verified" action on logged answers; verified
  badge in AskSurya answer card. 1–2 days.
- WP4 — Gold-set feedback: promoted pairs appended to `gold.jsonl` (validator in
  loop). ½ day.

**Exit criteria:**
- ≥10 verified answers live; repeat of a verified question returns the verified
  answer with stamp in <1s (no LLM call).
- Staleness surfaced: verified answer shows "verified as of <date>"; answers
  older than the latest relevant data load visibly flagged (simple date compare
  for MVP — drift re-validation is phase 5).
- Router eval unchanged (short-circuit must not mask routing regressions —
  eval runs bypass the cache).

**Risks:** similarity threshold too loose → wrong verified answer for a
different question (start 0.9, log near-misses, tune on evidence); admin
curation habit doesn't form (mitigate: promotion is one click from the existing
log view they already use).

---

## Phase 4 — Embedded Copilot ("Explain this")

**Objective:** intelligence meets the user where they look — grounded answers in
a drawer on Director dashboard cards, context pre-filled.

**Entry criteria:**
- [ ] Phase 2 catalog breadth (answers must be good before embedding them —
      an embedded copilot that shrugs damages trust faster than a separate page).
- [ ] Latency measured in 1b acceptable for in-place UX (target: first answer
      <10s on host hardware; if not, phase includes a UX treatment for waiting,
      or scope narrows to precomputed-template questions).
- [ ] D4 confirmed (default: conversation state in L7 browser session).

**Work packages:**
- WP1 — `/query` context envelope: optional `context` block `{page, metric,
  filters, currentValue, period}` in `QueryIn`; router prompt includes it;
  size-capped. Trace logs it (RP3). ~50 lines `query_service.py` + tests. 2 days.
- WP2 — `AskDrawer` component (`src/components/AskDrawer.tsx`): drawer UI,
  citation rendering reusing `citations.ts` deep-links, loading/refusal states.
  3–4 days.
- WP3 — DirectorView integration: "Explain" affordance on KPI cards passing the
  context object; fixed question templates for MVP ("Explain this metric",
  "Compare to last year" where a trend function exists). 2 days.
- WP4 — Answer template separating "what the data shows" (catalog result) from
  "possible factors per documents" (document route) — honesty guard against
  causal over-claiming. 1–2 days.
- WP5 — Feedback capture in-drawer (thumbs → query_log, same loop). ½ day.

**Exit criteria:**
- Director-role user explains any DirectorView KPI without leaving the page;
  answer cites catalog function or documents; refusals render gracefully.
- Context envelope visible in decision trace for every drawer query.
- Usage instrumentation live: drawer opens + question types logged — this is the
  data that makes M§14 percentages measurable and drives phase 5.

**Risks:** "why did X drop" expectations exceed what data supports (WP4 template
is the mitigation; test with real Director questions before rollout); prompt
bloat from context (hard cap; truncate filters list).

---

## Phase 5 — Maturation (evidence-driven, scope decided at entry)

**Objective:** deepen what usage proves valuable. Menu, not commitment — pick
3–4 items based on phase 2–4 telemetry.

**Candidate items (from master V2 lists + review addendum):**
- Digest: `digest_dismissals` table + per-role scoping + one-call LLM narration;
  PMS-cycle rule (wire PMS data into digest path).
- Copilot: free-text follow-ups with session context (D4 default);
  drawer on more role dashboards (HoD next per M§14).
- Memory: drift re-validation job — re-run verified questions after data loads,
  flag changed answers to admin.
- Governance: eval trend report in RagMonitor; L5-fold decision per M§21 (if
  verified-answers curation didn't take hold, simplify the layer model).
- Prose-function migration to typed contracts (RP1) if drawer/composition work
  demands it.
- D2 revisit (Excel endgame) if data-entry-in-app requests accumulated.

**Entry criteria:** phase 4 instrumentation has ≥4 weeks of drawer + digest usage.

**Exit criteria:** defined per selected item when phase-5 task plan is written.

---

## Standing rules for every phase (from M§9 guardrails)

1. Task-level executable plan written per phase before implementation; reviewed
   against blueprint principles P1–P9 ("which layer does this strengthen?").
2. Every catalog function ships with tests + gold questions in the same PR.
3. Eval regression blocks merge. Baseline recorded at each phase exit.
4. New tables ship RLS + policies in the same migration.
5. Phase completion = exit criteria demonstrated, not tasks checked off. Record
   completion notes (evidence, surprises, D-item evidence) in this document.

## Decision-consumption map

| Decision | Consumed by | Must be resolved by |
|---|---|---|
| D6 (production gate) | Phase 1b IS the resolution | end of phase 1b |
| D5 (personal thresholds) | Phase 2 entry | phase 2 planning |
| D1 (twinning ratchet) | Phase 2 WP4 evidence → formal review | end of phase 2 |
| D4 (conversation state) | Phase 4 entry | phase 4 planning |
| D2 (Excel endgame) | Phase 5 menu | only if triggered |
| D3 (read-only boundary) | Not consumed in this 12-month window | Level-5 discussion only |

---

## Change log

| Date | Version | Change |
|---|---|---|
| 2026-07-12 | 1.0 | Initial phase breakdown from master v1.1: 1a/1b/2/3/4/5 with work packages, entry/exit criteria, decision-consumption map |
