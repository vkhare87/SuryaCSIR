# SURYA — Improvement Proposals (DeepSeek)

> **Source document for [ROADMAP.md](../ROADMAP.md).** This brief carries the implementation detail;
> the roadmap says which work package it belongs to and what it depends on. Item IDs here
> are the ones the roadmap references. Status lines below may predate the roadmap — check
> there first.


Companion to `improvement-proposals-grok.md` (infra/UX) and `IMPROVEMENT-PROPOSALS.md`
(P1–P10 RAG stack). This file charts the **exact implementation scheme** for the new
feature catalog in `docs/roadmap/sources/FEATURE-IDEAS.md`, classified by value. Each scheme names the
files to touch, the migration to add, and the acceptance criteria, so any section can
be handed to a Claude session as-is ("implement feature A1 from
docs/improvement-proposals-deepseek.md").

Conventions used: migrations are timestamped (`supabase/migrations/20260808000001_*.sql`),
new tables get RLS + policies mirroring existing ones, new routes go in `src/App.tsx`
with `ACCESS_MAP` entries (`src/constants/access.ts`) and nav items in `src/components/layout/Layout.tsx`,
state transitions only via SECURITY DEFINER RPCs, and every lib/rag change ships with
tests (vitest / pytest). Effort in sessions (1 session ≈ half day).

---

## 0. Value classification (read this first)

**High value** = moves a dissertation use case forward, is visible to a decision-maker
weekly, or builds trust in the data. **Low value** = large effort for a capability that
is rarely needed, has an external dependency, or depends on data we do not yet hold.

| Feature | Value | Effort | Why |
|---|---|---|---|
| A1 Exception-alert engine | **High** | M | Every due date in the institute becomes visible; the single biggest adoption win |
| C1 Project health score | **High** | M | Direct "decision-support" visual for Director; extends UC-1 |
| E1 Decision-brief export | **High** | S | Turns Ask SURYA answers into printable evidence; demo gold |
| F1 Import history & diff UI | **High** | S | Data-steward trust; the `import_events` table already exists |
| C3 Proposal evaluation rubric | **High** | M | Makes UC-4 real underwriting instead of a panel |
| E2 Chart answers | **High** | M | Visible AI value without touching grounding guarantees |
| C5 Patent annuity tracker | High | S | Real institute need; IP register exists, deadlines don't |
| B1 Division expertise matrix | High | S | Pairs with succession risk; one RPC + one heatmap |
| B4 Staff profile self-service | Medium-High | S | Improves expertise-search corpus with admin control |
| F5 Export any analytics view | Medium | S | Universal utility, near-zero risk |
| A2 Portfolio risk view | Medium-High | M | Director portfolio depth; needs no new data |
| A3 Utilisation S-curves | Medium-High | M | **Blocked on F&A utilisation data** — build the chart, numbers arrive later |
| B2 Workforce planning simulator | Medium | M | Retirement waves; nice-to-have beyond succession risk |
| B3 Scientist workload view | Medium | S–M | Useful, but My Actions already covers most of it |
| C2 Project milestone/Gantt | Medium | M | PhD tracker pattern reuse; medium demand |
| C4 Output↔project linkage | Medium | M | Impact view; depends on publications data quality |
| D1 Email notifications | Medium | M | Requires SMTP/edge fn; in-app alerts (A1) first |
| D2 Document versioning + sign-off | Medium | M | Registry value; not asked for by any current user |
| D3 Audit export packs | Medium | S | Compliance nicety; low frequency |
| D4 Helpdesk SLA + knowledge base | Medium | M | SLAs useful; KB duplicates Ask SURYA capability |
| D5 Decision→action closure analytics | Medium | S | Committee ops; small audience |
| E3 Pinned queries as widgets | Medium | S–M | Cute, low urgency |
| E4 Scheduled briefs | Medium | M | Needs A1/D1 delivery channels first |
| E5 Related questions + confidence | Medium | S | Polish; cheap, do with E1 |
| F2 Bulk edit + duplicate detection | Medium | M | Import path already validates; edge benefit |
| F3 Record-level change history | Medium | S–M | Audit exists globally; per-record surface is nice |
| F4 Per-division quality scorecards | Medium | S | Extends DataHealthDigest; small |
| F6 2FA (TOTP) for admins | Medium | M | Security; no user demand signal yet |
| F7 Role-home customization | Medium | M | Feature controls exist; widget config is scope creep for now |
| A4 What-if allocation simulator | **Low (defer)** | L | Advisory-only by dissertation boundary; big build, modest use |
| A5 PFMS/F&A auto-ingest | **Low (defer)** | M | Blocked until F&A export shape is known (utilisation still absent) |
| C6 Equipment booking calendar | **Low (defer)** | L | High effort; institute has no booking pain reported |
| C7 Equipment utilisation logging | Low (defer) | S–M | Depends on C6; standalone manual entry has weak adoption |
| D6 DSC/e-signature | **Low (defer)** | L | External vendor dependency; paper sign-off acceptable today |
| E6 Hindi i18n | **Low (defer)** | L | Large surface, ongoing translation maintenance |

---

## 1. High-value features — exact implementation schemes

### A1 — Exception-alert engine

**Story.** A Finance Admin opens the app and sees "3 projects ahead of burn · AMC due for
2 instruments · 5 MOUs expiring in 90 days" without opening five pages. Today only
`pms_notifications` exists (`src/contexts/PMSContext.tsx`).

**Schema** — `supabase/migrations/20260808000001_alerts.sql`
- `alerts(id uuid pk default gen_random_uuid(), user_id uuid references auth.users null,
  role text null, type text not null, severity text check in ('info','warning','critical'),
  message text not null, entity_type text, entity_id text, due_at timestamptz,
  dedupe_key text not null unique, status text default 'open' check in ('open','acknowledged','resolved'),
  read_at timestamptz null, created_at timestamptz default now())`.
  RLS: user sees own `user_id` rows or rows matching their active role; admins see all.
- `run_alert_generation()` SECURITY DEFINER RPC: builds candidate rows from existing
  sources — `project_budget_variance` (rag/analytics logic as SQL), `amc_status`
  (dateUtils.ts logic), MOU 90-day expiry, PhD overdue milestones, project-report dues,
  PMS deadlines — and upserts on `dedupe_key` (type + entity_id + due window) so re-runs
  don't spam. Returns inserted count.

**Backend.** Schedule: add `--alerts` mode to `rag/worker.py` main loop (run after each
ingest pass, ~hourly); or pg_cron if the host allows it. No API endpoint needed for v1
(frontend reads the table directly under RLS).

**Frontend.**
- `src/components/AlertBell.tsx` (new): bell in topbar (Layout.tsx), unread count,
  dropdown of open alerts with severity colour, "acknowledge" button calling an RPC
  `ack_alert(id)`; polls every 60 s.
- `src/components/MyActions.tsx`: add an "Exceptions" section fed by the same table.
- Route `/alerts` optional later; v1 is bell + My Actions.

**Tests.** pytest for `run_alert_generation` SQL via test harness style of
`rag/tests/test_analytics.py` (whitelisted function + dedupe idempotency); vitest for
the bell (unread count, ack).

**Acceptance.** With seeded MOU/AMC/PhD data, alerts appear within one worker pass,
re-run adds zero duplicates, ack hides the item, RLS hides another role's alerts.

**Effort.** ~2 sessions.

---

### C1 — Project health score

**Story.** Director dashboard shows a traffic light per project: green/amber/red from
burn vs plan, report compliance, and status. Rolls up UC-1's "which projects need
intervention" into one glance.

**Schema** — `20260808000002_project_health.sql`
- Computed view `project_health_v(project_id, score int, label text, flags jsonb)`:
  burn ratio (utilized/sanctioned vs elapsed/duration, when utilisation exists),
  report compliance (expected vs submitted from `project_reports`), status staleness,
  overdue end dates (dateUtils `isWithinMonths`/`diffInDays` logic in SQL). No stored
  column — always computed, so it cannot go stale. Score 0–100 with label bands.

**Frontend.**
- `src/components/HealthBadge.tsx` (new): badge reused in `Projects.tsx` list, `ProjectDetail.tsx` header, `DirectorView.tsx` portfolio table.
- `DirectorView.tsx`: sort projects by score; "needs intervention" filter.

**Tests.** vitest on the badge; SQL view smoke-tested via the 82-project real import
(expect: 35 overdue projects flagged — matches the date-serial fix outcome).

**Acceptance.** Every project row shows a consistent score; overdue and over-burn
projects appear red; score matches manual computation on 5 spot-checked projects.

**Effort.** ~1–2 sessions.

---

### E1 — Decision-brief export

**Story.** One click on any Ask SURYA answer produces a dated PDF brief: question, mode
badge, answer, citations with page numbers, asker, timestamp.

**Implementation.** Frontend-only — `@react-pdf/renderer` is already in
`package.json`. In `src/pages/AskSurya.tsx`: keep the last answer object in state;
"Export brief" button renders a `<Document>` (brand header, question, mode, answer
text, citation list, footer with user + timestamp) and `pdf().toBlob()` download.
Structured answers export as CSV instead. No backend, no schema change, RLS untouched.

**Tests.** vitest on the brief-builder (answer → props → sections present); no PDF
snapshot (renderer non-determinism), assert blob produced.

**Acceptance.** Document and structured answers both export; citations appear verbatim;
file name encodes date.

**Effort.** ~1 session.

---

### F1 — Import history & diff UI

**Story.** A data steward imports a monthly staff sheet and wants to see "83 updated,
4 added, 2 failed — here's why" without digging into logs.

**Schema.** `import_events` and `import_field_mappings` already exist
(`20260719000001_import_events.sql`, `20260719000003_import_field_mappings.sql`).
Inspect their columns first; add `rows_added int`, `rows_updated int`, `rows_failed int`,
`error_summary jsonb` if absent (new migration `20260808000003_import_history.sql`),
populated by `pushToSupabase` (`src/utils/dataMigration.ts`) which already returns
per-row results.

**Frontend.** `src/components/ImportHistoryPanel.tsx` (new), mounted as a tab in
`src/pages/DataManagement.tsx` beside the existing ImportFlow/EntityRecords panels:
table of events (entity, filename, date, counts, status), filter by entity, expand row
→ error details; "view current records" links into `EntityRecordsPanel`.

**Tests.** vitest on the event-aggregation helper; manual: import a sheet with one bad
row → counts correct.

**Acceptance.** Every import after the change appears with correct add/update/fail
counts; failed rows show their validation reason.

**Effort.** ~1 session.

---

### C3 — Proposal evaluation rubric

**Story.** Evaluators score a proposal against weighted criteria (novelty, feasibility,
budget realism, track record) instead of free text; the review chain sees a weighted
total. This is UC-4's underwriting made concrete.

**Schema** — `20260808000004_proposal_rubric.sql`
- `proposal_criteria(id, active bool, criterion text, weight numeric)` seeded with 4–6
  criteria (weights sum to 1).
- `proposal_scores(proposal_id, evaluator_id, criterion_id, score int check 1..5,
  comment text, created_at, updated_at, pk(proposal_id, evaluator_id, criterion_id))`.
- RPC `submit_proposal_scores(proposal_id, scores jsonb)` SECURITY DEFINER: checks the
  caller is the assigned evaluator and the proposal is in an evaluation state; upserts;
  computes `weighted_total` on read via view `proposal_score_v`.
  RLS: evaluators read/write own rows; proposal owner and review chain read totals.

**Frontend.**
- `src/pages/proposals/ProposalDetail.tsx`: "Evaluate" tab for assigned evaluators —
  slider/radio per criterion, comment box, live weighted total; read-only summary for
  the review chain.
- `src/pages/proposals/Proposals.tsx` list: score badge once evaluated.

**Tests.** pytest-style RPC tests (permission denied for non-assigned evaluator, state
guard, weights sum) following `src/lib/pms/permissions.test.ts` patterns; vitest on the
scoring panel.

**Acceptance.** Assigned evaluator can score and resubmit; non-assigned caller gets a
clear denial; total reconciles to hand computation.

**Effort.** ~2 sessions.

---

### E2 — Chart answers

**Story.** "Patent filings by year" answers with a bar chart next to the number; the
grounding contract (source table named, whitelisted functions only) is unchanged.

**Backend.** `rag/analytics.py`: extend whitelisted functions to optionally return a
`series: [{label, value}]` (e.g. publications by year, patent funnel stages, projects
by division). `rag/query_service.py` structured path: pass the series through the
response when present. Add to `rag/tests/test_analytics.py`.

**Frontend.** `src/pages/AskSurya.tsx`: if the answer carries `series`, render a small
ReCharts bar/line card under the text; show "source table" caption as today. Refusal
and citation rules untouched — series only ever accompanies a computed structured answer.

**Tests.** pytest for series shape on two functions; vitest for chart render from a
fixture answer.

**Acceptance.** Three structured questions return charts; structured answer without
series still renders plain; no document-mode answer ever carries a chart.

**Effort.** ~2 sessions.

---

### C5 — Patent annuity/renewal tracker

**Story.** IP registry (Intelligence page) shows next renewal/annuity due dates with
warnings, feeding A1 alerts later.

**Schema** — `20260808000005_ip_renewals.sql`: columns on `ip_intelligence` —
`filing_date date`, `next_renewal_date date`, `annuity_notes text`; view
`ip_renewals_v` flagging due < 90 days.

**Frontend.** IP tab in `src/pages/Intelligence.tsx`: renewal-due strip + date fields in
the existing IP form modal; once A1 ships, `run_alert_generation` adds a source.

**Tests.** vitest on the 90-day flagging util (mirror `dateUtils.amcStatus`).

**Acceptance.** Adding a filing date computes the first renewal; due-in-90 flags appear;
editing updates the strip.

**Effort.** ~1 session.

---

### B1 — Division expertise matrix

**Story.** A heatmap shows which division covers which expertise topic; gaps (topics no
division claims) pop visually. Complements UC-3 succession risk.

**Backend.** `rag/analytics.py`: `expertise_matrix()` whitelisted function — tokenise
`Expertise`/`CoreArea` across staff, group by division, return topic × division
coverage; register in `rag/router.py` catalog and `rag/tests/test_analytics.py`.

**Frontend.** `src/pages/Intelligence.tsx` (or `DivisionsAnalytics.tsx`): heatmap
(CSS grid or ReCharts) with topic rows, division columns, coverage colouring; "no
coverage" row highlight.

**Acceptance.** Matrix renders from real staff data; a topic appearing in one division
only is visually distinct from multi-division topics.

**Effort.** ~1 session.

---

## 2. Medium-value features — condensed schemes

| Feature | Scheme | Effort |
|---|---|---|
| **B4 Staff self-service** | RPC `update_own_profile(payload)` SECURITY DEFINER (staff may edit own expertise/bio fields only, admin-approval flag off for v1); `StaffDetail.tsx` "Edit my profile" for the owner; audit row on change | S |
| **F5 Export analytics** | Shared `src/utils/exportAnalytics.ts` (CSV via existing xlsx dep; PDF via react-pdf): export button on each analytics page header | S |
| **A2 Portfolio risk view** | `ProjectsAnalytics.tsx` new tab: scatter (sanctioned vs utilised, bubble = duration) + sponsor/division concentration bars; pure frontend over existing data | M |
| **A3 Utilisation S-curves** | `ProjectDetail.tsx` chart: cumulative utilisation vs elapsed fraction (banded expected-burn); renders "no data" state honestly until F&A data lands | M |
| **B2 Workforce planning** | `StaffAnalytics.tsx` tab: age pyramid + retirement-wave projection from `getRetirementDate` (dateUtils); "add N hires/year" slider → future headcount; frontend-only | M |
| **B3 Workload view** | `StaffDetail.tsx` section: active projects, PI/Co-PI split, sanctioned value managed, overload flag (>4 active); RPC `staff_workload(id)` or client join | S–M |
| **C2 Project Gantt** | Reuse PhD milestone panel pattern (`PhDMilestonePanel.tsx`): `project_milestones` table + timeline on ProjectDetail; slippage = past-due flags | M |
| **C4 Output↔project linkage** | `scientific_outputs` gains `project_id`; link picker on output records + "Outputs" section on ProjectDetail | M |
| **D1 Email notifications** | After A1: edge function or worker SMTP hook reading open alerts (severity ≥ warning) → daily digest email; env vars in `deploy/rag-worker.env.example` | M |
| **D2 Document versioning** | `documents` gains `version int`, `supersedes uuid`; DocumentPanel upload flow creates new version; history list with access-tier checks | M |
| **D3 Audit export packs** | `pms/AuditLog.tsx` "Export" → CSV of filtered timeline (already has the data) | S |
| **D4 Helpdesk SLA + KB** | SLA: `helpdesk_tickets.sla_due_at` set by category on create; aging strip in TicketList. KB: resolved tickets → optional "promote to FAQ" (new `faq` table) searchable via Ask SURYA document path with entity_type filter | M |
| **D5 Decision→action closure** | `committees/`: action-item board gains closure-rate/aging stats columns; small analytics strip | S |
| **E3 Pinned queries** | `AskSurya.tsx` "Pin" → saved to `user_preferences` (table exists) → rendered as cards on the role dashboard | S–M |
| **E4 Scheduled briefs** | After A1+D1: `scheduled_queries(owner, query, cron)` + worker mode that runs `/query` and posts result to alerts/email | M |
| **E5 Related questions + confidence** | `AskSurya.tsx`: after answer, 2 suggested follow-ups (router returns `suggestions` from llm.pick-style call, optional) + latency/grounded badge; cheap, ship with E1 | S |
| **F2 Bulk edit + duplicates** | `EntityRecordsPanel.tsx` selection mode → bulk update RPC; duplicate flags at import via fuzzy name/email util in `dataMigration.ts` | M |
| **F3 Record-level change history** | Global audit already exists (`pms/AuditLog.tsx` "All" tab) — add per-record filter: detail pages fetch audit rows where entity_id = record | S–M |
| **F4 Division quality scorecards** | Extend `DataHealthDigest.tsx`/`DataFreshnessLedger.tsx` with per-division completeness (null-rate per table group) view | S |
| **F6 2FA (TOTP)** | `AuthContext.tsx` + Login: TOTP secret per admin user (new `user_preferences` fields), QR enrollment screen, verify at login; library: `otplib` or `speakeasy` | M |
| **F7 Role-home customization** | Extend `/admin/features` (`FeatureControlsAdmin.tsx`): per-role widget visibility map stored in a `role_widgets` table, read by dashboards | M |

---

## 3. Low-value / defer — and when to revisit

| Feature | Defer reason | Revisit when |
|---|---|---|
| **A4 What-if simulator** | Large build; dissertation boundary says monitoring not optimisation — building it invites the exact question the report disclaims | Post-viva, if Director asks for scenario analysis |
| **A5 PFMS auto-ingest** | Utilisation data still absent; mapping shape unknown | The day an F&A/PFMS export exists (it's then ~M, same machinery as Data Management) |
| **C6 Equipment booking** | No booking pain reported at AMPRI; high effort | A technician or facilities head asks for it |
| **C7 Utilisation logging** | Adoption weak without C6 | With C6 |
| **D6 DSC e-signature** | External vendor + procurement; paper/uploaded signature acceptable | When PMS goes institute-wide formal |
| **E6 Hindi i18n** | Large surface, perpetual translation upkeep; no user request yet | When a Hindi-first user group is identified |

---

## 4. Build order (dependencies respected)

**Wave 0 — quick wins (~1 week, all S):** E1 → F1 → C5 → B1 → F5 → B4 → E5.
Independent, low risk, visible in the viva's shadow.

**Wave 1 — flagship quarter (~2–3 weeks):** A1 (foundation for D1/E4) → C1 →
C3 → E2. A1 and C1 can start in parallel; C3 independent; E2 touches `rag/` so run the
harness (`python eval/run_eval.py --report`) before and after to prove no regression.

**Wave 2 — depth (~1 month):** A2, A3 (data-permitting), B2, B3, C2, C4, D2, D3, D4,
E3, F2, F3, F4, F6, F7. Parallelisable; D4's KB and E3 can reuse Ask SURYA surfaces.

**Wave 3 — conditional:** D1 + E4 (after A1 is stable), C6/C7, A4, A5, D6, E6.

**Hard rules throughout:** every migration timestamped + RLS'd; every analytics change
re-runs the eval harness; every RPC audited; no client-side status writes (existing
convention). Re-check `rag/eval/eval_report.md` numbers are still green after Wave 1 —
the report's metrics must survive these features.

---

## 5. Success metrics

- **Adoption:** ≥1 acknowledged alert per admin user per week (A1); ≥5 briefs exported
  (E1); import-history opened on ≥half of data-console sessions (F1).
- **Decision impact:** Director dashboard shows health scores on 100% of active projects
  (C1); ≥3 evaluations using the rubric in the next proposal cycle (C3).
- **Quality:** eval harness M2/M3 unchanged (≥0.93 / ≥0.95) after Wave 1; no alert
  duplicates across 10 consecutive generation runs (A1).
- **Data:** utilisation coverage >0 once F&A export arrives (A3/A5); renewal dates
  recorded on ≥80% of live patents (C5).

## 6. Non-goals (do not prioritise early)

Autonomous allocation or optimisation outputs (dissertation boundary); replacement of
ERP/eHRMS; real-time streaming; organisation-wide rollout beyond AMPRI; any feature
that weakens the grounding invariant or the whitelist-only analytics rule.

## 7. Document history

- 2026-08-08 — Initial catalog (DeepSeek), built from `docs/roadmap/sources/FEATURE-IDEAS.md`;
  schemes verified against repo structure (`src/`, `rag/`, `supabase/migrations/`).
