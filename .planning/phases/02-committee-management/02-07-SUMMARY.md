---
phase: 02-committee-management
plan: 07
subsystem: committees
tags: [routes, navigation, integration]
requires: [02-01, 02-02, 02-03, 02-04, 02-05, 02-06]
provides: [committee-routes, sidebar-nav-item]
affects: [App.tsx, Layout.tsx]
key-files:
  modified:
    - src/App.tsx
    - src/components/layout/Layout.tsx
decisions:
  - "Route ordering per Pitfall 6: /committees/:id/meetings/:meetId before /committees/:id before /committees"
  - "Committees nav visible to ALL_ROLES (all authenticated users)"
  - "Building2 icon for committees nav item"
metrics:
  duration: ~5m
  completed_date: 2026-05-10
---

# Phase 02 Plan 07: Integration — Routes & Navigation Summary

## What was built

Route registration and sidebar navigation for the committee module.

### Task 1: Route ordering fix (App.tsx)
- Moved `/committees/:id/meetings/:meetId` (MeetingDetail) BEFORE `/committees/:id` (CommitteeDetail) per Pitfall 6
- Removed duplicate MeetingDetail route that was appended at end of route list
- Final route order: MeetingDetail → /committees/:id/meetings → /committees/:id/actions → /committees/:id → /committees

### Task 2: Nav item fix (Layout.tsx)
- Changed icon from `Users` to `Building2` (matches plan spec, reuse existing import)
- Changed `allowedRoles` from restricted role list to `ALL_ROLES` (all authenticated users can view committees)

## Verification
- `npm run build` exits 0
- Committee routes in correct specificity order (Pitfall 6 satisfied)
- Nav item visible to all authenticated roles
