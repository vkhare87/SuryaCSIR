---
phase: 04-analytics-cross-table-search
plan: "02"
subsystem: staff-portfolio
tags: [portfolio, cross-table, staff-detail, analytics, dateutils]
dependency_graph:
  requires: [04-01, 03-data-management-missing-tables]
  provides: [staff-portfolio-view, staff-route]
  affects: [StaffDetail, App]
tech_stack:
  added: []
  patterns: [cross-table-aggregation, personNamesMatch-fuzzy-lookup, getStaffPortfolio-helper]
key_files:
  created:
    - SuryaFD/src/utils/dateUtils.ts
  modified:
    - SuryaFD/src/pages/StaffDetail.tsx
decisions:
  - "StaffDetail delegates all cross-table aggregation to getStaffPortfolio rather than maintaining inline useMemo chains, ensuring consistent name-matching with the rest of the analytics layer"
  - "dateUtils.ts added to worktree as a Rule 2 missing-dependency fix — it existed in the main repo but was absent from the worktree branch"
  - "Assigned Equipment section added with WorkingStatus badge and Indenter/Operator metadata, surfacing equipment tied to the staff member via IndenterName or OperatorName"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
requirements: [ANALYTICS-03, ANALYTICS-04, SEARCH-03]
---

# Phase 04 Plan 02: Staff Portfolio View Summary

## One-liner

Cross-table staff portfolio wiring `StaffDetail.tsx` to `getStaffPortfolio` — aggregates projects, PhD mentorship, publications, IP assets, and equipment from DataContext arrays via fuzzy name matching.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add staff portfolio aggregation helper | b7a0c70 (prior) + 9b1e014 | SuryaFD/src/utils/analytics.ts (prior), SuryaFD/src/utils/dateUtils.ts (new) |
| 2 | Wire StaffDetail to cross-table portfolio data | 5285017 | SuryaFD/src/pages/StaffDetail.tsx |
| 3 | Confirm the portfolio route | — (no change needed) | SuryaFD/src/App.tsx already correct |

## What Was Built

### Task 1 — `analytics.ts` + `dateUtils.ts`

`analytics.ts` already exported `StaffPortfolio` and `getStaffPortfolio` from prior 04-01 execution (included as a bonus). `dateUtils.ts` was added to the worktree as a Rule 2 fix — it existed in the main repo but was absent from the `worktree-agent-a6fbaf19` branch.

`dateUtils.ts` exports:
- `parseDate` — handles DD/MM/YYYY and ISO formats
- `diffInDays`, `isWithinMonths`, `formatDate` — date arithmetic
- `getRetirementDate`, `getAgeFromDOB`, `getServiceYears`, `getYearsInGrade` — career metrics
- `staffNameMatchesAuthor`, `staffNameMatchesSupervisor` — name comparison utilities

### Task 2 — `StaffDetail.tsx`

Rewired `StaffDetail.tsx` from inline `useMemo` filters to `getStaffPortfolio`:

- Imports `getStaffPortfolio` from `../utils/analytics`
- Destructures `projectStaff`, `equipment` from `useData()` (were missing in old version)
- Calls `getStaffPortfolio({ staffId: id, staff, projects, projectStaff, phDStudents, scientificOutputs, ipIntelligence, equipment })`
- All cross-table fields sourced from portfolio object:
  - `portfolio.linkedProjects` — projects via PI match or projectStaff/PhD assignment
  - `portfolio.supervisedPhDs` — PhD rows where SupervisorName matches
  - `portfolio.coSupervisedPhDs` — PhD rows where CoSupervisorName matches
  - `portfolio.publications` — scientific outputs where any author matches
  - `portfolio.ipAssets` — IP records where any inventor matches
  - `portfolio.assignedEquipment` — equipment where IndenterName or OperatorName matches
- 5-wide stat card row (added Equipment card alongside existing 4)
- New "Assigned Equipment" section with WorkingStatus badge and Indenter/Operator metadata
- Unknown staffId returns "Staff member not found" empty state (satisfies T-04-06)

### Task 3 — `App.tsx`

Route already present in the worktree branch from the initial base commit:
```tsx
import StaffDetail from './pages/StaffDetail';
// ...
<Route path="/staff/:id" element={<StaffDetail />} />
```
No changes required.

## Verification

Build passes:

```
vite v8.0.0 building for production...
✓ 2850 modules transformed.
✓ built in 1.04s
```

All acceptance criteria verified:
- `analytics.ts` exports `StaffPortfolio`, `getStaffPortfolio`, `projectAssignments`, `supervisedPhDs`, `coSupervisedPhDs`, `publications`, `ipAssets`, `assignedEquipment`
- `StaffDetail.tsx` contains `getStaffPortfolio`, all `portfolio.*` field references, "Linked Projects", "PhD Mentorship", "IP Portfolio", "Assigned Equipment"
- `App.tsx` contains `import StaffDetail`, `path="/staff/:id"`, `element={<StaffDetail />`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Dependency] Added dateUtils.ts to worktree**
- **Found during:** Task 2
- **Issue:** `StaffDetail.tsx` imports `getRetirementDate`, `formatDate`, `getAgeFromDOB`, `getServiceYears`, `getYearsInGrade`, `diffInDays` from `../utils/dateUtils`. This file existed in the main repo but was absent from the `worktree-agent-a6fbaf19` branch (git-tracked files only included src/ and SQL files from the base commit).
- **Fix:** Created `SuryaFD/src/utils/dateUtils.ts` in the worktree with all career metric helpers.
- **Files modified:** `SuryaFD/src/utils/dateUtils.ts` (created)
- **Commit:** 9b1e014

**2. [Rule 1 - Refactor] Replaced inline useMemo chains with getStaffPortfolio**
- **Found during:** Task 2
- **Issue:** The worktree's `StaffDetail.tsx` used ad-hoc `useMemo` filters for projects (division-match fallback), publications, and IP — inconsistent with the `personNamesMatch` fuzzy matching used by `getStaffPortfolio`. Equipment assignments were not rendered at all.
- **Fix:** Replaced all inline lookups with `getStaffPortfolio` calls. This ensures consistent name matching across the analytics layer.
- **Files modified:** `SuryaFD/src/pages/StaffDetail.tsx`
- **Commit:** 5285017

## Threat Model Compliance

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-04-05 | StaffDetail reads only from DataContext arrays already scoped by auth/role at the DataProvider level |
| T-04-06 | Unknown staffId (from URL) returns "Staff member not found" empty state — no writes occur |
| T-04-07 | Portfolio aggregation is linear over bounded arrays for a single staff member |

## Known Stubs

None — all portfolio data sourced from live DataContext arrays (Supabase when provisioned, mock fallback otherwise).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| SuryaFD/src/utils/dateUtils.ts exists | FOUND |
| SuryaFD/src/pages/StaffDetail.tsx contains getStaffPortfolio | FOUND |
| SuryaFD/src/pages/StaffDetail.tsx contains Assigned Equipment | FOUND |
| SuryaFD/src/App.tsx contains path="/staff/:id" | FOUND |
| Commit 9b1e014 (dateUtils.ts) | FOUND |
| Commit 5285017 (StaffDetail portfolio) | FOUND |
| npm run build exits 0 | PASSED |
