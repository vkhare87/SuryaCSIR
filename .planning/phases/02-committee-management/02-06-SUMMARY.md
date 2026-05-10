---
phase: 02-committee-management
plan: 06
type: execute
subsystem: committee-management
tags:
  - kanban
  - action-tracker
  - framer-motion
  - overdue
requirements:
  - CMT-08
depends_on:
  provides:
    - action-tracker-kanban
  requires:
    - 02-01 (committee types, migrations, DataContext)
    - 02-02 (CommitteeDetail page)
  affects:
    - src/pages/committees/CommitteeDetail.tsx
tech-stack:
  added:
    - framer-motion Reorder (already in deps)
  patterns:
    - Reorder.Group per kanban column (Pitfall 2: cross-column via click, not drag)
    - useState(() => Date.now()) for pure "now" reference in overdue calc
    - Lifted filter state pattern (status/comittee/assignee in KanbanBoard)
key-files:
  created:
    - src/components/committees/KanbanCard.tsx
    - src/components/committees/KanbanBoard.tsx
    - src/components/committees/ActionTrackerFilters.tsx
  modified:
    - src/pages/committees/CommitteeDetail.tsx
key-decisions:
  - "Cross-column movement via status badge click (not drag) per Pitfall 2 in RESEARCH.md"
  - "Manual-source action items included in committee-scoped kanban view"
  - "Overdue filter is computed filter (deadline < now, status != Completed) — no DB column"
completed_date: 2026-05-10
duration_minutes: 31
---

# Phase 2 Plan 6: Action Tracker Kanban Components Summary

Action Tracker kanban board with 3-column framer-motion Reorder layout, overdue card styling, status cycling, and filter bar — wired into CommitteeDetail.

## One-Liner

3-column kanban (Pending/InProgress/Completed) with framer-motion Reorder per column, overdue highlighting (red accent + counter), filter bar (status/comittee/assignee), and Supabase-backed status cycling — replacing CommitteeDetail placeholder.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create KanbanCard component | `f35b37a3` | `src/components/committees/KanbanCard.tsx` |
| 2 | Create KanbanBoard + ActionTrackerFilters | `c8221b1d` | `src/components/committees/KanbanBoard.tsx`, `src/components/committees/ActionTrackerFilters.tsx` |
| 3 | Wire KanbanBoard into CommitteeDetail | `d80de106` | `src/pages/committees/CommitteeDetail.tsx` |

## Verification Summary

| Criteria | Status |
|----------|--------|
| `npm run build` exits 0 | PASS |
| `npm run lint` exits 0 (0 errors) | PASS |
| KanbanCard overdue styling (red left-border, +Nd counter, Overdue badge) | PASS |
| Status badge click cycles Pending->InProgress->Completed->Pending | PASS |
| KanbanBoard 3-column grid with Reorder.Group per column | PASS |
| ActionTrackerFilters: status chips + committee dropdown + assignee search | PASS |
| Overdue filter is computed (not DB column) | PASS |
| Empty columns show "No items" placeholder | PASS |
| CommitteeDetail Action Tracker tab renders KanbanBoard (no placeholder) | PASS |
| Placeholder text removed from CommitteeDetail | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed impure Date.now() in render violating react-hooks/purity**

- **Found during:** Post-Task 3 lint check
- **Issue:** `Date.now()` called directly during render in KanbanCard for both `isOverdue` comparison and `daysOverdue` calculation. This violates React's component purity rule (react-hooks/purity).
- **Fix:** Added `useState` import; captured stable `now` timestamp via `useState(() => Date.now())` lazy initializer (pure during render, runs once per mount). Both `isOverdue` and `daysOverdue` now reference the stable `now` value instead of impure `Date.now()` / `new Date()`.
- **Files modified:** `src/components/committees/KanbanCard.tsx`
- **Commit:** `8418a4cd`

## Threat Flags

No new threat surface beyond what the threat model anticipated. T-02-17 (Tampering of status cycle) is mitigated:
- UI guard: `canEdit` check before making badge clickable (`canEditActionItems(user)` restricts to DivisionHead, HOD, Director, SystemAdmin, MasterAdmin)
- DB guard: RLS `action_items_write` policy restricts UPDATE to admin roles at Supabase level

## Known Stubs

None. All components are wired to real data via `useData()` and `useAuth()`. The "New Action Item" button in the old placeholder was intentionally removed (action item creation is future work, not in this plan's scope).

## Self-Check

- [x] `src/components/committees/KanbanCard.tsx` exists
- [x] `src/components/committees/KanbanBoard.tsx` exists
- [x] `src/components/committees/ActionTrackerFilters.tsx` exists
- [x] `src/pages/committees/CommitteeDetail.tsx` imports and renders KanbanBoard
- [x] Commit `f35b37a3` exists (KanbanCard)
- [x] Commit `c8221b1d` exists (KanbanBoard + Filters)
- [x] Commit `d80de106` exists (CommitteeDetail wiring)
- [x] Commit `8418a4cd` exists (purity fix)
