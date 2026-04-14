---
phase: 04-analytics-cross-table-search
plan: "01"
subsystem: analytics-dashboards
tags: [analytics, recharts, kpi, division-metrics, director-view, division-head-view]
dependency_graph:
  requires: [03-data-management-missing-tables]
  provides: [division-metrics-helpers, director-scorecards, division-head-kpis]
  affects: [DirectorView, DivisionHeadView]
tech_stack:
  added: [recharts@3.8.0]
  patterns: [cross-table-aggregation, name-normalization-fuzzy-match, datacontext-derived-analytics]
key_files:
  created:
    - SuryaFD/src/utils/analytics.ts
  modified:
    - SuryaFD/src/pages/dashboards/DirectorView.tsx
    - SuryaFD/src/pages/dashboards/DivisionHeadView.tsx
decisions:
  - "Centralized division metric computation in analytics.ts getDivisionMetrics to ensure consistent KPIs across all views (T-04-02 tamper mitigation)"
  - "Used personNamesMatch fuzzy matching for PhD supervisor lookup to handle name format inconsistencies in real institute data"
  - "DivisionHeadView consumes already role-scoped DataContext arrays rather than filtering in-view, preserving T-04-01 information disclosure mitigation"
metrics:
  duration_minutes: 30
  completed_date: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
requirements: [ANALYTICS-01, ANALYTICS-02, ANALYTICS-04]
---

# Phase 04 Plan 01: Division Analytics Dashboards Summary

## One-liner

Live division KPI scorecards and Recharts warm-palette comparison chart for Director and Division Head roles, derived entirely from DataContext arrays via centralized `getDivisionMetrics` helper.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement shared division analytics helpers | b7a0c70 | SuryaFD/src/utils/analytics.ts (created) |
| 2 | Render Director scorecards and comparison chart | 017a119 | SuryaFD/src/pages/dashboards/DirectorView.tsx |
| 3 | Harden Division Head KPI view | f981b63 | SuryaFD/src/pages/dashboards/DivisionHeadView.tsx |

## What Was Built

### Task 1 — `analytics.ts`

Created `SuryaFD/src/utils/analytics.ts` with:

- **`DivisionMetric` interface** — `divCode`, `divName`, `staffCount`, `activeProjectCount`, `projectCount`, `scientificOutputCount`, `phdStudentCount`, `equipmentCount`
- **`normalizePersonName(name)`** — lowercases, strips honorific prefixes (`dr`, `prof`, `sh`, `smt`, `mr`, `mrs`, `ms`), removes punctuation, collapses whitespace
- **`personNamesMatch(a, b)`** — returns false for blank normalized names; true when equal or one includes the other (handles partial name formats)
- **`getDivisionMetrics(params)`** — iterates all divisions, computing per-division counts by matching field names (`Division`, `DivisionCode`, `divisionCode`) across staff, projects, scientific outputs, equipment, and PhD students via supervisor name matching
- **`getStaffPortfolio(params)`** — bonus: cross-table scientist portfolio helper (used by StaffDetail page)

### Task 2 — `DirectorView.tsx`

Full Director dashboard with:
- 5 institute-level KPI cards: Total Staff, Active Projects, PhD Students, Equipment, Scientific Outputs
- Division scorecard grid (Staff / Active Projects / Outputs / PhDs per division card)
- Recharts `BarChart` with `ResponsiveContainer` comparing all divisions on `projectCount` (`fill="#c96442"`) and `scientificOutputCount` (`fill="#5e5d59"`)
- Tooltip styled with parchment background (`#faf9f5`), warm border (`#e8e6dc`), `borderRadius: 8`
- Division breakdown table from `divisions` array

### Task 3 — `DivisionHeadView.tsx`

Hardened Division Head dashboard with:
- 5 KPI cards: Division Staff, Active Projects, PhD Supervisees, Outputs, Equipment
- `divisionCode` from `useAuth()` displayed in header subtitle
- `activeProjects` computed via `ProjectStatus === 'Active'` filter
- `divisionPhDs` computed by matching supervisor names against division staff names set
- Staff and Projects tables rendering role-scoped DataContext arrays directly (no double-filtering)

## Verification

All acceptance criteria met. Build passes:

```
vite v8.0.0 building for production...
✓ 2850 modules transformed
✓ built in 1.19s
```

- `analytics.ts` exports `DivisionMetric`, `getDivisionMetrics`, `normalizePersonName`, `personNamesMatch`
- `DirectorView.tsx` contains `getDivisionMetrics`, `ResponsiveContainer`, `BarChart`, `dataKey="projectCount"`, `dataKey="scientificOutputCount"`, `fill="#c96442"`, `fill="#5e5d59"`
- `DivisionHeadView.tsx` renders `Division Staff`, `Active Projects`, `PhD Supervisees`, uses `scientificOutputs.length`, `equipment.length`, `divisionCode`
- `package.json` contains `"recharts": "^3.8.0"`

## Deviations from Plan

### Additional functionality included (Rule 2 — not a deviation, added during prior session)

`analytics.ts` also includes `StaffPortfolio` interface and `getStaffPortfolio` function (beyond what the plan specified). This was already present when execution began — it serves the `StaffDetail.tsx` page for scientist portfolio view (ANALYTICS-03). No plan deviation occurred; the file was pre-implemented with extra capability.

None — plan executed exactly as written for the three specified tasks.

## Threat Model Compliance

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-04-01 | DivisionHeadView uses DataContext arrays already scoped by role in DataProvider; no direct unscoped fetches in the view |
| T-04-02 | All KPI formulas centralized in `getDivisionMetrics` with exact field name matching (`Division`, `DivisionCode`, `divisionCode`) |
| T-04-03 | Chart tooltip shows aggregate division counts only (staffCount, projectCount, scientificOutputCount) — no person-level data exposed |

## Known Stubs

None — all values derived from live DataContext arrays (Supabase or mock fallback).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| SuryaFD/src/utils/analytics.ts exists | FOUND |
| SuryaFD/src/pages/dashboards/DirectorView.tsx exists | FOUND |
| SuryaFD/src/pages/dashboards/DivisionHeadView.tsx exists | FOUND |
| .planning/phases/04-analytics-cross-table-search/04-01-SUMMARY.md exists | FOUND |
| Commit b7a0c70 (analytics helpers) | FOUND |
| Commit 017a119 (DirectorView chart) | FOUND |
| Commit f981b63 (DivisionHeadView KPIs) | FOUND |
| npm run build exits 0 | PASSED |
