---
phase: 02-committee-management
plan: 02
subsystem: ui
tags: [react, typescript, committees, governance, navlink]

# Dependency graph
requires:
  - phase: 02-01
    provides: "DataContext extensions (committees, meetings, actionItems, committeeMembers arrays), permissions module (10 functions), Committee/Meeting/ActionItem/CommitteeMember types"
provides:
  - "Committee list page with card grid, search bar, type/status filter pills, and KPI cards"
  - "Committee detail page with 3-tab navigation: Overview (mini-dashboard), Meetings list, Action Tracker (placeholder)"
  - "Route registration and sidebar nav for /committees"
affects: [02-04 (form modals), 02-05 (meeting detail), 02-06 (action tracker kanban)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Facilities.tsx list pattern: useData + useAuth + useMemo for KPI/derived state + useState for filters"
    - "InstrumentDetail.tsx detail pattern: useParams + useLocation for tab detection + NavLink tab bar"
    - "InfoRow local helper component for detail card key-value rows"
    - "Permission-gated UI: buttons conditionally rendered via permissions module checks"

key-files:
  created:
    - src/pages/committees/CommitteeList.tsx
    - src/pages/committees/CommitteeDetail.tsx
  modified:
    - src/App.tsx
    - src/components/layout/Layout.tsx

key-decisions:
  - "Card grid layout (1/2/3 col responsive) for committee list per D-03 — more scannable than table for <20 committees"
  - "NavLink tabs with useLocation() fallback for tab detection — avoids nested router complexity while keeping URL-addressable tabs"
  - "Mini meeting timeline shows last 3 meetings on Overview tab — balances information density with scannability"
  - "Action items scoped to committee by matching meeting_id OR source === 'manual' — simple heuristic, no dedicated committee_id FK on action_items table"

patterns-established:
  - "Committee list page: KpiCard row (total/active/inactive/meetings/pending) + search + type filter + status filter + card grid"
  - "Committee detail page: useParams(:id) + useLocation() tab detection + NavLink tab bar + 3 sub-render functions"
  - "Permission-gated buttons via permissions module: showCreate/showEdit/showScheduleMeeting/showCreateAction/showManageMembers"

requirements-completed:
  - CMT-01
  - CMT-03

# Metrics
duration: 30min
completed: 2026-05-10
---

# Phase 2 Plan 2: Committee Pages Summary

**Committee list page with card grid, KPI cards, and type/status filters, plus committee detail page with 3-tab navigation (Overview, Meetings, Action Tracker)**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2
- **Files created:** 3 (CommitteeList.tsx, CommitteeDetail.tsx, DatabaseWizard.tsx stub)
- **Files modified:** 2 (App.tsx, Layout.tsx)

## Accomplishments
- CommitteeList at /committees: card grid with search, type/status filters, 5 KPI cards, loading skeleton (6 cards), empty state with CTA
- CommitteeDetail at /committees/:id: Overview mini-dashboard (identity card, details, leadership, members, mini timeline, action counts)
- CommitteeDetail Meetings tab at /committees/:id/meetings: chronological meeting list with status badges and empty state
- CommitteeDetail Action Tracker tab at /committees/:id/actions: action items list with placeholder for kanban board (Plan 02-06)
- Permission-gated UI: Create Committee, Edit, Schedule Meeting, Create Action, Manage Members buttons conditionally shown
- Route registration in App.tsx and sidebar nav item in Layout.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CommitteeList page** - `e1390676` (feat)
2. **Task 2: Create CommitteeDetail page** - `1562b099` (feat)

## Files Created/Modified
- `src/pages/committees/CommitteeList.tsx` - Committee list page: KPI cards, search/filter bar, responsive card grid, loading/empty states
- `src/pages/committees/CommitteeDetail.tsx` - Committee detail page: 3-tab navigation (Overview/Meetings/Action Tracker), not-found state, permission-gated actions
- `src/pages/DatabaseWizard.tsx` - Minimal stub to unblock build (pre-existing missing file, Rule 3)
- `src/App.tsx` - Added route registrations for /committees, /committees/:id, /committees/:id/meetings, /committees/:id/actions
- `src/components/layout/Layout.tsx` - Added "Committees" nav item to sidebar

## Decisions Made
- Card grid layout chosen over table for committee list (per D-03 research decision — more scannable for small datasets)
- NavLink tabs with useLocation() fallback for tab detection — keeps URL-addressable tabs without nested routers
- Action items scoped to committee by matching `meeting_id` in committeeMeetings IDs OR `source === 'manual'` — pragmatic heuristic since action_items lacks a direct committee_id FK
- Committees nav item visible to: Director, DivisionHead, HOD, Scientist, SystemAdmin, MasterAdmin, EmpoweredCommittee

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Route registration and navigation**
- **Found during:** Task 1 (CommitteeList)
- **Issue:** Plan files_modified only listed the two page files. CLAUDE.md convention requires new pages to be registered in App.tsx and Layout.tsx NAV_ITEMS. Without these, pages are not accessible.
- **Fix:** Added `/committees` route in App.tsx, `Committees` nav item in Layout.tsx sidebar with appropriate role gating. CommitteeDetail routes (/committees/:id, /meetings, /actions) added in Task 2.
- **Files modified:** src/App.tsx, src/components/layout/Layout.tsx
- **Verification:** Build passes, routes resolve correctly
- **Committed in:** e1390676 (Task 1) and 1562b099 (Task 2)

**2. [Rule 3 - Blocking] Missing DatabaseWizard.tsx blocking build**
- **Found during:** Task 1 (CommitteeList build verification)
- **Issue:** App.tsx imports `src/pages/DatabaseWizard.tsx` which was an untracked file in the main repo not pulled into the agent worktree. `tsc -b` failed with "Cannot find module" before reaching our code.
- **Fix:** Created minimal stub component returning placeholder UI. This is a pre-existing issue — the file existed as uncommitted work on main.
- **Files modified:** src/pages/DatabaseWizard.tsx (new)
- **Verification:** Build passes (tsc -b && vite build exits 0)
- **Committed in:** e1390676 (Task 1)

**3. [Rule 1 - Bug] TypeScript strict errors in CommitteeDetail.tsx**
- **Found during:** Task 2 (build verification)
- **Issue:** Three categories of TS errors: (a) unused `useState` import, (b) `Committee` type imported without `import type` under verbatimModuleSyntax then unused import line after removal, (c) `committee` possibly undefined in closure-captured render functions, (d) `statusBadgeVariant` missing `'info'` from return type union
- **Fix:** Removed unused useState import, re-added `import type { Committee }` line, parameterized `renderOverview(c: Committee)` to narrow the type, added `'info'` to variant union
- **Files modified:** src/pages/committees/CommitteeDetail.tsx
- **Verification:** Build passes (3 fix iterations)
- **Committed in:** 1562b099 (Task 2)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for correctness and build. No scope creep. Stub creation is minimal; full DatabaseWizard implementation is separate work.

## Known Stubs

| Stub | File | Line(s) | Reason |
|------|------|---------|--------|
| Edit button | CommitteeDetail.tsx | 503 | `onClick={() => {}}` — form modal wired in Plan 02-04 |
| Schedule Meeting button | CommitteeDetail.tsx | 361, 373 | `onClick={() => {}}` — meeting form wired in Plan 02-04 |
| Create Action Item button | CommitteeDetail.tsx | 424, 438 | `onClick={() => {}}` — action form wired in Plan 02-06 |
| Add Member button | CommitteeDetail.tsx | 263 | `onClick={() => {}}` — member management wired in Plan 02-04 |
| Action Tracker kanban placeholder | CommitteeDetail.tsx | ~415 | Placeholder text about kanban board in Plan 02-06; shows flat list for now |
| Create Committee button | CommitteeList.tsx | ~60 | Navigates to `/committees/new` which has no route yet — form modal wired in Plan 02-04 |
| DatabaseWizard.tsx stub | DatabaseWizard.tsx | all | Minimal stub — pre-existing untracked file, full implementation is separate work |

## Issues Encountered
- Parallel worktree did not carry over `src/pages/DatabaseWizard.tsx` (untracked on main branch). Created minimal stub — root cause fix in separate plan.
- `verbatimModuleSyntax` requires `import type` for type-only imports — caught during build, standard SURYA pattern.

## Next Plan Readiness
- Both committee pages ready for form modals in Plan 02-04 (create/edit committee, schedule meeting, manage members)
- Meeting detail page in Plan 02-05 can follow same route pattern (/committees/:id/meetings/:meetingId)
- Action Tracker kanban in Plan 02-06 has placeholder list ready for replacement

---
*Phase: 02-committee-management*
*Completed: 2026-05-10*
