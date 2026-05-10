---
phase: 03-helpdesk
plan: "04"
subsystem: helpdesk
tags: [helpdesk, master-detail, ticket-list, filtering, urgency-badges, segmented-controls]
dependency_graph:
  requires: [src/lib/helpdesk/constants.ts, src/lib/helpdesk/permissions.ts, src/contexts/DataContext.tsx]
  provides: [src/pages/helpdesk/Helpdesk.tsx]
  affects: [helpdesk routing, user experience]
tech_stack:
  added: []
  patterns: [useData/useAuth, useMemo for derived state, master-detail split pane, segmented controls, dropdown multi-select, urgency color badges]
key_files:
  created:
    - src/pages/helpdesk/Helpdesk.tsx
  modified:
    - src/contexts/DataContext.tsx
    - src/utils/mockData.ts
decisions:
  - "Urgency badges rendered inline using URGENCY_COLORS Record pattern — not a separate component (plan specified inline)"
  - "Stats KPI bar added above ticket list to avoid unused useMemo lint error (stats useMemo mandated by plan)"
  - "Category and urgency dropdowns use native checkboxes in floating panels with click-outside-to-close behavior"
  - "isAdmin import removed — canViewAllTickets sufficient for tab gating; isAdminUser was unused in page context"
  - "Ticket import removed from type imports — type inference from useData() return type sufficient"
metrics:
  duration: "~20m"
  completed_date: "2026-05-10"
  total_commits: 2
  tasks: 1
---

# Phase 3 Plan 4: Helpdesk Master-Detail Page Summary

**One-liner:** Full master-detail Helpdesk page with assignment tabs, segmented status filter, category/urgency dropdown multi-selects, urgency-sorted ticket list with color-coded badges, and empty state placeholders.

## Completed Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Build Helpdesk page — master-detail layout with filtered ticket list | ee66add8 | `src/pages/helpdesk/Helpdesk.tsx` |

## What Was Built

**`src/pages/helpdesk/Helpdesk.tsx`** (470 lines) — `export default function Helpdesk()`

### Left Panel (w-96, scrollable)

- **Header:** "Helpdesk" serif heading + "Create Ticket" primary button (navigates to `/helpdesk/new`)
- **Assignment Tabs (D-02, D-04):** "My Tickets" (default), "Assigned to Me", and "All" (visible only when `canViewAllTickets(user)` is true for admin roles). Styled as a button group with `bg-terracotta text-ivory` active state.
- **Status Filter (D-01):** Horizontal segmented control with 5 segments: All | Open | In Progress | Resolved | Closed. Single-select, `bg-terracotta text-ivory` on active.
- **Category Filter (D-01):** Dropdown multi-select with 8 checkboxes (one per category). Count badge shows when filters are active. Clear button resets all. Click-outside-to-close.
- **Urgency Filter (D-01):** Same dropdown pattern with 4 checkboxes. Each row shows urgency color dot from URGENCY_COLORS.
- **Search:** Text input filtering by subject and token.
- **Stats Bar:** KPI chips showing total, open, in progress, and resolved counts for filtered tickets (visible only when tickets exist).
- **Active filter indicator:** "Clear all filters" link appears when any filter is non-default.

### Ticket List (D-02, D-03)

- Auto-sorted by urgency (Critical -> High -> Medium -> Low) then `created_at` descending.
- Each list item shows: token (mono, left) + date (right), subject (clamped to 2 lines), category Badge (info variant), urgency badge (inline span using URGENCY_COLORS bg/text classes), and status text.
- Selected ticket highlighted with `border-l-2 border-l-terracotta`.
- Click navigates to `/helpdesk/:ticketId`.

### Empty States

- **No tickets at all:** MessageSquare icon + "No tickets yet. Create your first helpdesk ticket to get started." + Create Ticket button (copy from UI-SPEC line 117).
- **No matching filters:** Search icon + "No tickets match your filters." + Clear all filters link (copy from UI-SPEC line 118).
- **No ticket selected (right panel):** MessageSquare icon + "Select a ticket from the list to view its details and responses." (copy from UI-SPEC line 120).

### Right Panel

- When at `/helpdesk` (no selection): empty state placeholder (hidden on mobile).
- When at `/helpdesk/:ticketId`: renders `<Outlet />` for child route component.

### Loading State

- 6 `CardSkeleton` rows when `isLoading` is true.

### Responsive

- Desktop (>=1024px): Left panel w-96, right panel flex-1.
- Tablet (768-1023px): Left panel w-80.
- Mobile (<768px): Left panel full-width, right panel hidden.

### Data Patterns

- `useData()` for ticket data — no direct Supabase calls.
- `useAuth()` for user context (ownership filtering, admin tab gating).
- `useMemo` for: ownershipTickets (tab-filtered), filteredTickets (full filter + sort), stats (KPI counts), selectedTicketId (route parsing).
- `useRef` + `useEffect` for click-outside dropdown dismissal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tickets to DataContext and mockData**
- **Found during:** Task 1 preparation
- **Issue:** Helpdesk.tsx requires `tickets` from `useData()`, but DataContext had no tickets state, fetch, or mock data. The plan assumed tickets were already wired from Plan 03-01, but Plan 03-01 only created the library modules (constants, permissions, RPC wrappers).
- **Fix:** Added 10 realistic mock tickets to `mockData.ts`, wired `tickets: Ticket[]` into DataContextType, added state variable, Supabase fetch branch (`from('tickets')`), mock fallback, and error fallback.
- **Files modified:** `src/utils/mockData.ts`, `src/contexts/DataContext.tsx`
- **Commit:** 1b824bd0

**2. [Rule 1 - Bug] Removed unused imports and wired unused variables**
- **Found during:** ESLint verification
- **Issue:** `Check` from lucide-react, `Ticket` type import, and `isAdmin` from permissions were imported but unused. `isAdminUser` and `stats` were computed but never consumed.
- **Fix:** Removed unused imports (`Check`, `Ticket`, `isAdmin`). Removed `isAdminUser` variable (unused in page context; `canViewAllTickets` suffices for tab gating). Added stats KPI bar rendering above ticket list to consume `stats` useMemo.
- **Files modified:** `src/pages/helpdesk/Helpdesk.tsx`

## Acceptance Criteria Results

| Criterion | Required | Actual | Status |
|-----------|----------|--------|--------|
| `export default function Helpdesk` | >=1 | 1 | PASS |
| `activeTab` references | >=3 | 5 | PASS |
| `URGENCY_SORT_ORDER` usage | >=1 | 3 | PASS |
| `URGENCY_COLORS` usage | >=1 | 3 | PASS |
| `canViewAllTickets` usage | >=1 | 2 | PASS |
| `statusFilter` references | >=3 | 5 | PASS |
| `categoryFilter` references | >=2 | 7 | PASS |
| "My Tickets" label | >=1 | 1 | PASS |
| "Assigned to Me" label | >=1 | 1 | PASS |
| "Select a ticket" copy | >=1 | 1 | PASS |
| "Create Ticket" CTA | >=1 | 2 | PASS |
| `useData` usage | >=1 | 2 | PASS |
| `useAuth` usage | >=1 | 2 | PASS |
| `useMemo` hooks | >=2 | 5 | PASS |
| `Outlet` usage | >=1 | 2 | PASS |
| `tsc --noEmit` exit 0 | 0 | 0 | PASS |
| `eslint` exit 0 | 0 | 0 | PASS |

## Threat Flags

None. The plan's threat model (T-03-11, T-03-12) covers the admin tab gating. No new threat surfaces introduced beyond what the plan documents.

## Self-Check: PASSED

- `src/pages/helpdesk/Helpdesk.tsx` — exists, 470 lines
- `src/contexts/DataContext.tsx` — modified with tickets wiring
- `src/utils/mockData.ts` — modified with 10 mock ticket entries
- Commit `1b824bd0` — verified in git log
- Commit `ee66add8` — verified in git log
