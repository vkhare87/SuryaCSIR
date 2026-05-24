# Director Decision Cockpit — Design Spec

**Date:** 2026-05-24
**Scope:** Rebuild `src/pages/dashboards/DirectorView.tsx` into a decision-support cockpit.
**Status:** Approved design, pending implementation plan.

---

## Goal

Today the Director dashboard shows raw counts (staff, projects, PhDs, equipment, outputs) plus
division scorecards and one bar chart. It tells the Director *how many*, never *what needs a decision*.

This rebuild adds a **decision cockpit**: a top section that surfaces problems needing attention now,
backed by charts that explain the situation and support the call. The existing count cards, division
scorecards, comparison chart, and breakdown table are **kept below** the cockpit as reference.

## Principles

- **Cockpit on top, current overview retained below.** No existing functionality removed.
- **Decision-first.** Every cockpit element answers "what should the Director do / look at?"
- **Drill-down only.** Flags and chart elements navigate to existing detail/list pages. No new
  writes, no new tables, no schema or RLS changes.
- **Reuse the viz kit.** Build on `src/components/viz/*`, `parseCost`, and `getDivisionMetrics`.
- **Director-tunable thresholds**, persisted to `localStorage`.

## Non-Goals

- No Workforce/Succession domain (explicitly dropped by stakeholder).
- No action-item creation, notifications, or review-queue state (drill-down only).
- No backend, migration, or RLS work.
- No PMS appraisal integration in this iteration.

---

## Page Structure (top → bottom)

1. Header (existing)
2. **Threshold controls** (new — tunable inputs)
3. **Attention Strip** (new — derived flags)
4. **Domain: Project & Finance** (new)
5. **Domain: Research Productivity** (new)
6. **Domain: Equipment & Operations** (new)
7. Existing KPI count cards (retained)
8. Existing division scorecards (retained)
9. Existing division comparison chart (retained)
10. Existing division breakdown table (retained)

---

## Threshold Controls

Small control row above the Attention Strip. Three tunable numeric thresholds, each persisted to
`localStorage` using the project's lazy-initializer pattern
(`useState(() => localStorage.getItem(...) ?? default)`).

| Threshold | Key | Default | Drives |
|-----------|-----|---------|--------|
| Low fund burn % | `surya_director_low_burn_pct` | `40` | Low-burn flag + utilization color |
| Project ending window (days) | `surya_director_ending_days` | `90` | Ending-soon flag |
| AMC expiry window (days) | `surya_director_amc_days` | `60` | AMC-expiring flag |

UI: compact labeled number inputs (or `viz/TimeRangePicker`-style chips) styled with semantic tokens.
Changing a value re-derives all dependent `useMemo` flags immediately. A "reset to defaults" affordance
clears the keys.

---

## Attention Strip

Row of severity-colored flag tiles (`viz/KpiTile`). **Only nonzero flags render.** When every flag is
zero, render a single green "All clear" tile. Each tile shows count + label and is clickable → drill target.

| Flag | Rule | Severity | Drill → |
|------|------|----------|---------|
| Overdue projects | `ProjectStatus === 'Active'` AND `CompletioDate` parses to a date < today | red | `/projects` |
| Ending soon | Active AND `CompletioDate` within `ending_days` from today | amber | `/projects` |
| Low fund burn | Active AND `parseCost(UtilizedAmount)/parseCost(SanctionedCost) < low_burn_pct/100` (skip if Sanctioned = 0) | amber | `/projects` |
| Equipment down | `WorkingStatus` not in the working set (see Data Notes) | red | `/facilities` |
| AMC expiring | `amc_end_date` within `amc_days` from today | amber | `/facilities` |
| Critical/open tickets | `tickets` with `status` in {Open, InProgress} AND `urgency` in {High, Critical} | red | `/helpdesk` |
| Overdue actions | `actionItems` with `status` ≠ Completed AND `deadline` < today | amber | `/committees` |

Navigation via React Router `useNavigate` (HashRouter-compatible). Drill targets are the existing list
pages; deep filter pre-seeding is out of scope for this iteration (land on the page, Director filters there).

---

## Domain: Project & Finance

Section card group. Source: `projects` from `useData()`. Cost parsing via existing `parseCost` helper
(extract to a shared util if currently local to `ProjectsAnalytics.tsx`).

- **Institute fund-utilization gauge** — `ProgressRing`: `Σ Utilized / Σ Sanctioned` across all projects, as %.
- **Utilization % by division** — `CategoryBar` (horizontal): per-division `Σ Utilized / Σ Sanctioned`.
  Bars below `low_burn_pct` visually flagged. Click → `/divisions`.
- **Active projects timeline** — `GanttLite`: active projects keyed by `StartDate → CompletioDate`.
  Overdue/ending-soon bars colored per thresholds. Click bar → `/projects/:id`.
- **Sponsor mix by value** — `Treemap` sized by `parseCost(SanctionedCost)` (reuse existing pattern).

## Domain: Research Productivity

Sources: `scientificOutputs`, `ipIntelligence`, `staff`, `divisions`.

- **Publication trend by year** — `TrendLine`: count of `scientificOutputs` grouped by `year`.
- **IP pipeline** — `Funnel`: `ipIntelligence` by `status` Filed → Published → Granted (exposes conversion gaps).
- **Output + avg impact factor by division** — `CategoryBar`: count and mean `impactFactor`
  (ignore null IF) per `divisionCode`. Click → `/divisions`.
- **Output-per-scientist by division** — derived ratio: division output count ÷ division staff count
  (from `getDivisionMetrics`). Productivity, not raw volume.

## Domain: Equipment & Operations

Sources: `equipment`, `tickets`, `actionItems`.

- **Equipment uptime gauge** — `ProgressRing`: working ÷ total `equipment`.
- **AMC expiry timeline** — list/`CategoryBar` of instruments with `amc_end_date` in next 6 months,
  soonest first. Click → `/facilities/:uInsID`.
- **Open tickets by urgency** — `CategoryDonut` of open/in-progress `tickets` grouped by `urgency`.
  Click → `/helpdesk`.
- **Overdue action items** — compact list (task, assignee, deadline) where `status` ≠ Completed and
  `deadline` < today. Click → `/committees`.

---

## Data Notes & Edge Cases

- **Cost fields are strings**, often with `₹`/`,`/`L` noise. Always parse via `parseCost`; treat
  unparseable or `0` Sanctioned as "no data" (exclude from utilization ratios to avoid divide-by-zero).
- **Dates are loose strings.** Validate with the project's date util / `/^\d{4}-\d{2}-\d{2}/` guard
  before comparison; ignore unparseable dates rather than mis-flagging.
- **`WorkingStatus` values are free-text.** Define a working set (e.g. case-insensitive match on
  `working`/`functional`/`operational`); anything else counts as down. Confirm actual distinct values
  against live/mock data during planning.
- **Empty data.** Every chart uses `viz/ChartEmpty` (or the inline empty-text pattern) when its series
  is empty. The cockpit must render cleanly on a fresh/empty institute.
- **`impactFactor` / `citationCount` are optional** — guard nulls in averages.

## Components & Files

**Reused (no change):** `viz/KpiTile`, `ProgressRing`, `CategoryBar`, `CategoryDonut`, `TrendLine`,
`Funnel`, `GanttLite`, `Treemap`, `ChartCard`, `ChartEmpty`, `Card`, `KpiCard`.

**New/changed:**
- `src/pages/dashboards/DirectorView.tsx` — add cockpit sections above retained existing layout.
- `src/utils/analytics.ts` (or a new `src/utils/directorMetrics.ts`) — derived selectors:
  fund utilization (institute + per division), project flags, research aggregates, equipment/ops flags.
  All pure, unit-testable functions taking `useData()` slices + thresholds.
- `src/utils/parseCost.ts` — extract shared `parseCost` if it currently lives only in `ProjectsAnalytics.tsx`.
- Optional small `ThresholdControls` block — inline in `DirectorView` or `src/components/dashboard/`.

**Conventions:** all derived data in `useMemo`; semantic Tailwind tokens only; named exports for
components/utils; `useData()` only (no direct Supabase); `import type` for types.

## Testing

- Unit-test the new pure selectors in `src/utils/` (vitest, matching existing `dateUtils`/permissions specs):
  fund-utilization math, divide-by-zero guard, each flag rule at/around its threshold boundary, empty-data cases.
- Manual: verify cockpit renders with populated data, with empty data (all-clear tile + ChartEmpty),
  and that each flag/chart drill navigates to the correct route.

## Open Items for Planning

- Confirm distinct `WorkingStatus` values to finalize the "working" set.
- Confirm whether `parseCost` is local to `ProjectsAnalytics.tsx` (extract) or already shared.
- Decide threshold-control widget style (number inputs vs chips) — cosmetic.
