# Feature Ideas — SURYA (beyond the report)

> **Source document for [ROADMAP.md](../ROADMAP.md).** This brief carries the implementation detail;
> the roadmap says which work package it belongs to and what it depends on. Item IDs here
> are the ones the roadmap references. Status lines below may predate the roadmap — check
> there first.


New feature catalog, for planning after the viva. Existing proposals already cover:
- RAG stack upgrades P1–P10 → `docs/roadmap/sources/IMPROVEMENT-PROPOSALS.md`
- Infra/UX hardening + phased implementation → `docs/roadmap/sources/improvement-proposals-grok.md`, `docs/roadmap/sources/IMPLEMENTATION-PLAN-IMPROVEMENTS.md`
- Dissertation future work (§10.4): portfolio construction, cross-lab duplication, temporal analytics, continuous measurement, public transparency view

Everything below is **not** in those docs (verified 2026-08-08). Effort: S ≈ half day, M ≈ 1–2 days, L ≈ 3+ days. Each item notes where it would live in the existing code.

---

## A. Financial & portfolio (strengthens the FinTech story)

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| A1 | **Exception-alert engine** | Cross-module threshold alerts: budget variance, AMC/MOU expiry (90-day), PhD overdue, report dues, PMS deadlines. Today only `pms_notifications` exists — generalize it to all modules and surface in My Actions + a bell. | M | `src/contexts/`, `MyActions.tsx`, new `notifications` table |
| A2 | **Portfolio risk view** | Project scatter (sanctioned value vs utilisation vs duration), sponsor/division concentration (top-10 exposure share), fund-type mix treemap. | M | `ProjectsAnalytics.tsx`, `rag/analytics.py` |
| A3 | **Utilisation S-curves** | Per-project burn curves vs planned spend (S-curve bands) once F&A utilisation data exists. | M | `ProjectDetail.tsx`, ReCharts |
| A4 | **What-if allocation simulator** | "Shift ₹50L from group X to Y" → recompute portfolio exposure/completion impact. Deliberately advisory only (matches report boundary: monitoring not optimisation). | L | new page `/portfolio` |
| A5 | **PFMS/F&A auto-ingest** | Monthly expenditure export → mapped import (extends the Data Management pipeline to the financial category; same column-mapping machinery). | M | `dataMigration.ts`, `DataManagement.tsx` |

## B. HR & expertise

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| B1 | **Division expertise matrix** | Topic × division coverage heatmap — who covers what, where the gaps are. Complements succession risk. | S | `Intelligence.tsx` or `DivisionsAnalytics.tsx` |
| B2 | **Workforce planning simulator** | Retirement waves (age pyramid projection, N-year horizon) + "hire X/year" scenarios → future headcount/expertise gap. | M | `StaffAnalytics.tsx` |
| B3 | **Scientist workload view** | Active projects per person, PI/Co-PI split, sanctioned value managed, overload flags. | S–M | `StaffDetail.tsx`, `HumanCapital.tsx` |
| B4 | **Staff profile self-service** | Scientists update own expertise/bio (admin approval); directly feeds expertise search quality. | S | `StaffDetail.tsx`, access-rules on update RPC |
| B5 | **Public staff profile pages** | Read-only external-viewable profiles (expertise, outputs, projects) — step toward the report's transparency view (§10.4). | S | `StaffDetail.tsx` render mode |

## C. Research operations

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| C1 | **Project health score** | Composite traffic-light per project: burn vs plan, milestone delay, report compliance, utilisation. Roll up on Director dashboard. | M | `ProjectDetail.tsx`, `DirectorView.tsx` |
| C2 | **Project milestone/Gantt** | Milestones + dates + slippage flags for projects (PhD tracker already does this — reuse the pattern). | M | `ProjectDetail.tsx`, `PhDMilestonePanel.tsx` pattern |
| C3 | **Proposal evaluation rubric** | Weighted criteria scoring + evaluator comments (underwriting-style), score roll-up for the review chain. | M | `proposals/` pages, new `proposal_scores` table |
| C4 | **Output↔project linkage** | Link publications/patents to projects; per-project output impact view. | M | `Intelligence.tsx`, `ProjectDetail.tsx` |
| C5 | **Patent annuity/renewal tracker** | Filing/renewal/annuity due dates with reminders for the IP registry. | S | `Intelligence.tsx` IP tab |
| C6 | **Equipment booking calendar** | Request/approve instrument time, maintenance windows, utilisation stats. | L | `Facilities.tsx`, `InstrumentDetail.tsx` |
| C7 | **Equipment utilisation logging** | Run-hours per instrument (manual or from booking C6). | S–M | `InstrumentDetail.tsx` |

## D. Governance & operations

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| D1 | **Email notifications** | Due-date/status-change emails (SMTP or Supabase edge fn) for AMC/MOU/reports/PMS/action items. | M | new `notifications` + worker hook |
| D2 | **Document versioning + sign-off** | Version history and approval sign-off for registry documents. | M | `DocumentPanel.tsx`, `documents` schema |
| D3 | **Audit export packs** | Filterable compliance exports (PDF/CSV) per module from the audit log. | S | `pms/AuditLog.tsx` |
| D4 | **Helpdesk SLA + knowledge base** | SLA per category, ticket aging, and a RAG-searchable FAQ built from resolved tickets. | M | `helpdesk/` pages + `rag/` |
| D5 | **Decision→action closure analytics** | Committee decisions → action items → closure rate/aging board. | S | `committees/` |
| D6 | **DSC/e-signature integration** | Digital signature (DSC) on PMS finalization. External dependency — plan as L. | L | `pms/SignatureUpload.tsx` |

## E. Intelligence & AI (beyond P1–P10)

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| E1 | **Decision-brief export** | One-click PDF/Word brief of any Ask SURYA answer with its citations — the "evidence pack" output. | S | `AskSurya.tsx` + `@react-pdf/renderer` (already a dependency) |
| E2 | **Chart answers** | Structured/hybrid answers render a chart (expenditure time-series, patent funnel) alongside the number. | M | `AskSurya.tsx`, `rag/` structured path |
| E3 | **Pinned queries as widgets** | Save a good query as a dashboard card (auto-refreshes). | S–M | `AskSurya.tsx`, dashboards |
| E4 | **Scheduled briefs** | Recurring NL queries (weekly portfolio digest) delivered to inbox/email. | M | worker + `notifications` |
| E5 | **Related-question suggestions + confidence** | Next-question chips and a confidence indicator per answer. | S | `AskSurya.tsx` |
| E6 | **Hindi interface (i18n)** | Full UI translation (large but high adoption value at a CSIR lab). | L | `i18n` layer |

## F. Platform & data operations

| # | Feature | Description | Effort | Where |
|---|---|---|---|---|
| F1 | **Import history & diff UI** | Show per-import events (`import_events` table exists) with rows added/updated/failed — visible audit of data changes. | S | `DataManagement.tsx` |
| F2 | **Bulk edit + duplicate detection** | Bulk update records; fuzzy name/email duplicate flags at import. | M | `dataMigration.ts`, `EntityRecordsPanel.tsx` |
| F3 | **Record-level change history** | Per-record who/when/what on detail pages (audit already exists globally — surface it per record). | S–M | `StaffDetail.tsx`, `ProjectDetail.tsx` |
| F4 | **Per-division data quality scorecards** | Extend `DataHealthDigest` to per-division completeness/freshness reports. | S | `DataHealthDigest.tsx` |
| F5 | **Export any analytics view** | Excel/PDF export on every analytics page. | S | shared export util |
| F6 | **2FA (TOTP) for admin roles** | Time-based OTP for System/Master/HR/Finance admins. | M | `AuthContext.tsx`, login flow |
| F7 | **Role-home customization** | Admins arrange which widgets each role sees (extends `/admin/features`). | M | `FeatureControlsAdmin.tsx`, dashboards |

---

## Recommended top 10 (value ÷ effort)

1. **A1 Exception-alert engine** — one mechanism, every module's due dates become visible; biggest operational win.
2. **C1 Project health score** — the single most "decision-support" visual for the Director.
3. **E1 Decision-brief export** — tiny, and it turns Ask SURYA answers into printable evidence (great demo).
4. **F1 Import history UI** — the table already exists; this is audit visibility for data stewards.
5. **C5 Patent annuity tracker** — small, real institute need (IP register exists, deadlines don't).
6. **B1 Division expertise matrix** — small, pairs with succession risk on the Intelligence page.
7. **F5 Export analytics** — S-sized, universally useful.
8. **C3 Proposal evaluation rubric** — makes UC-4 feel like real underwriting.
9. **B4 Staff profile self-service** — improves corpus quality (expertise search) with admin control.
10. **E2 Chart answers** — the most visible "AI wow" without changing the grounding guarantees.

**Suggested sequencing:** S-sized items first (E1, F1, C5, B1, F5, B4) as a confidence-building batch; then A1 + C1 as the flagship quarter; leave A4, C6, D6, E6 as "next dissertation" scale projects.
