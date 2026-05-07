---
phase: 01-foundation
plan: 01
subsystem: committees-helpdesk
tags: [types, permissions, committees, helpdesk, foundation]
dependency_graph:
  requires: []
  provides: [types-committees, types-helpdesk, permissions-committees]
  affects: [01-02, 01-03, 01-04]
tech-stack:
  added: []
  patterns:
    - "src/lib/<domain>/permissions.ts (mirrors src/lib/pms/permissions.ts)"
    - "Interface with snake_case fields for new domain tables"
    - "Admin role bypass constant (ADMIN_ROLES) for permission checks"
key-files:
  created:
    - "src/lib/committees/permissions.ts (65 lines, 7 permission functions + 1 helper)"
  modified:
    - "src/types/index.ts (appended 93 lines, 9 interfaces)"
decisions: []
metrics:
  duration_seconds: 507
  completed_date: 2026-05-07
---

# Phase 01 Plan 01: Committee & Helpdesk Type Contracts + Permissions Module Summary

Defined 9 TypeScript interfaces for the committees + helpdesk domain (Committee, CommitteeMember, Meeting, AgendaItem, ActionItem, MeetingDocument, Ticket, TicketResponse, TicketEvent) and created a shared permissions module with 7 authorization functions mirroring the PMS permissions pattern.

---

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Append 9 committee + helpdesk interfaces to src/types/index.ts | `b0adcfa2` | Done |
| 2 | Create committee permissions module at src/lib/committees/permissions.ts | `a1744648` | Done |

### Task 1 Details

Appended 9 interfaces after the `Notification` interface in `src/types/index.ts`, preceded by a `// --- v1.0 Committees & Helpdesk ---` divider comment. All interfaces use snake_case field names matching the database column names, consistent with PMS tables.

- **6 committee interfaces:** Committee, CommitteeMember, Meeting, AgendaItem, ActionItem, MeetingDocument
- **3 helpdesk interfaces:** Ticket, TicketResponse, TicketEvent
- Line count: 311 (exceeds 250 minimum)
- Verification: All 9 interfaces confirmed via grep; no TypeScript errors introduced

### Task 2 Details

Created `src/lib/committees/permissions.ts` following the exact pattern from `src/lib/pms/permissions.ts` (named exports, type-only imports, single-responsibility functions).

- **7 permission functions:** canEditCommittee, canScheduleMeeting, canWriteMinutes, canEditActionItems, canDeleteCommittee, canManageMembers
- **1 helper:** isAdmin
- ADMIN_ROLES constant: ['Director', 'SystemAdmin', 'MasterAdmin']
- HARDCODED comment documents staff ID to user ID mapping needed in Phase 2
- All 7 exports + isAdmin confirmed via grep

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `CommitteeMember` import in permissions.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** Plan specified `import type { UserAccount, Committee, CommitteeMember } from '../../types'` but `CommitteeMember` is never referenced by any function. TypeScript with `noUnusedLocals` enabled raised TS6196.
- **Fix:** Removed `CommitteeMember` from the import statement. The import now reads `import type { UserAccount, Committee } from '../../types'`.
- **Files modified:** `src/lib/committees/permissions.ts`
- **Commit:** `a1744648`
- **Note:** This is a plan/spec conflict — the plan mandates both `noUnusedLocals` and the unused import. The import may be reintroduced in a future plan when a function needs the `CommitteeMember` type.

### Pre-existing Issues (Out of Scope)

**1. Build blocked by missing `DatabaseWizard.tsx`**
- **Found during:** Task 1 (build verification)
- **Issue:** `src/App.tsx` imports `./pages/DatabaseWizard` which does not exist in the base commit `4279e947`.
- **Impact:** `npm run build` (via `tsc -b`) fails with `TS2307`. This is a pre-existing issue not caused by this plan's changes.
- **Verification:** `npx tsc --noEmit` (whole project) produces zero errors from `src/types/index.ts` or `src/lib/committees/permissions.ts`. The only error is the pre-existing `App.tsx` import.
- **Logged to:** `deferred-items.md` in phase directory

---

## Known Stubs

| Stub | File | Line | Description |
|------|------|------|-------------|
| `user.activeRole === user.id` | `src/lib/committees/permissions.ts` | canEditCommittee | Placeholder check — real implementation uses staff ID mapping. Documented with inline comment. |
| staff ID to user ID mapping | `src/lib/committees/permissions.ts` | canEditCommittee, canScheduleMeeting, canWriteMinutes | `chairperson_id`/`secretary_id` use staff."ID" values (e.g., "S001") while `user.id` is a Supabase auth UUID. Phase 2 will reconcile via staff-user linking. |
| HARDCODED comment block | `src/lib/committees/permissions.ts` | Lines 1-4 | Documents the temporary staff ID mapping mismatch. |

---

## Threat Flags

None. This plan introduces only TypeScript interfaces (compile-time only) and client-side permission checks (UX gates, not security). Real enforcement is via Supabase RLS policies in Plan 02 (threat T-01-01 is accepted per the threat model).

---

## Verification Summary

| Check | Result |
|-------|--------|
| 9 interfaces exist in types/index.ts | PASS |
| Union types (committee_type, category) present | PASS |
| 7 permissions + isAdmin exported | PASS |
| `import type` statement correct | PASS |
| No TS errors in plan files | PASS |
| `tsc -b` full project | Pre-existing failure (DatabaseWizard) |

---

## Self-Check: PASSED

All created/modified files verified to exist on disk. All commits verified in git log.
