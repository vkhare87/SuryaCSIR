---
phase: 02-committee-management
plan: 01
subsystem: committees
tags: [data-context, permissions, rls, migration, tdd]
requires: []
provides: [committeeMembers-array, agendaItems-array, 10-permission-functions, minutes-lock-rls, unlock-rpc]
affects: [DataContext.tsx, permissions.ts, meetings-rls]
tech-stack:
  added: []
  patterns: [tdd-with-vitest, rls-policy-split, security-definer-rpc]
key-files:
  created:
    - src/lib/committees/permissions.test.ts
    - supabase/migrations/20260510000000_committee_minutes_lock.sql
  modified:
    - src/contexts/DataContext.tsx
    - src/lib/committees/permissions.ts
decisions:
  - "Policy split into 4 separate policies (SELECT/INSERT/UPDATE/DELETE) — SELECT has no lock guard so locked minutes remain readable"
  - "Lock window is 7 days from meeting_date when status = 'Completed'"
  - "MasterAdmin can always bypass the lock (both in RLS and unlock RPC)"
  - "Admin roles for RLS: Director, SystemAdmin, MasterAdmin"
metrics:
  duration: ~20m
  completed_date: 2026-05-10
---

# Phase 02 Plan 01: Committee Management Prerequisites Summary

## One-Liner

Extended DataContext with committeeMembers and agendaItems arrays, created a 10-function role-based permissions module with full TDD test coverage, and deployed a minutes-lock RLS policy migration that splits the old all-in-one meetings_write policy into four granular policies with a 7-day auto-lock guard and admin unlock RPC.

## Tasks Completed

| Task | Name | Type | Commit | Files |
|------|------|------|--------|-------|
| 1 | Add committeeMembers and agendaItems to DataContext state | auto | `298c4c9b` | `src/contexts/DataContext.tsx` |
| 2 | Create committee permissions module | auto (tdd) | `90ae9289` (RED), `6c84361b` (GREEN) | `src/lib/committees/permissions.ts`, `src/lib/committees/permissions.test.ts` |
| 3 | Create migration for minutes lock RLS policy + unlock RPC | auto | `034351cd` | `supabase/migrations/20260510000000_committee_minutes_lock.sql` |

## Verification Results

### Task 1 — DataContext extensions
- `CommitteeMember`: 8 appearances across import, interface, state, Supabase branch, mock fallback, error catch
- `AgendaItem`: 8 appearances (same pattern)
- `mapCommitteeMemberRow` / `mapAgendaItemRow`: Imported and used in Supabase loading branch
- `mockCommitteeMembers` / `mockAgendaItems`: 3 appearances each (import + mock fallback + error catch)
- `void cmmRes` / `void agiRes`: Fully removed — replaced with setState calls
- No DataContext-specific TypeScript errors (`npx tsc --noEmit` clean for DataContext)

### Task 2 — Permissions module (TDD)
- 40 tests, all passing (vitest)
- 10 `export function` declarations verified
- Single `import type` with `UserAccount` and `Committee`
- No permissions-specific TypeScript errors
- TDD gate sequence: RED (`90ae9289`) -> GREEN (`6c84361b`)

### Task 3 — Migration
- `DROP POLICY IF EXISTS "meetings_write"`: 1 occurrence
- `CREATE POLICY`: 4 occurrences (meetings_select, meetings_insert, meetings_update, meetings_delete)
- `unlock_meeting_minutes`: 1 occurrence (function definition) — note: plan expected 2 counting RAISE message, but RAISE uses spaces not underscores
- `SECURITY DEFINER`: 2 occurrences (function definition + header comment)
- `CURRENT_DATE - INTERVAL '7 days'`: 4 occurrences (3 in policy guards + 1 in comment)
- All 4 policy names present
- Node.js syntax verification passed

## Deviations from Plan

### Minor Plan Acceptance Criteria Mismatches

**1. [Plan Off-by-One] mapCommitteeMemberRow grep count is 2 not 1**
- **Found during:** Task 1 verification
- **Issue:** The plan expected `grep -c "mapCommitteeMemberRow"` to return exactly 1, but both the import line and the usage line match, producing 2 matches.
- **Fix:** No fix needed — 2 matches is the correct behavior (import + usage). Plan criteria slightly undercounted.

**2. [Plan Off-by-One] mapAgendaItemRow grep count is 2 not 1**
- **Found during:** Task 1 verification
- **Issue:** Same as above — import line and usage line both match.
- **Fix:** No fix needed — correct behavior.

**3. [Plan Off-by-One] unlock_meeting_minutes grep count is 1 not 2**
- **Found during:** Task 3 verification
- **Issue:** Plan expected 2 matches (function definition + RAISE message), but RAISE message uses "unlock meeting minutes" (spaces) not "unlock_meeting_minutes" (underscores).
- **Fix:** No fix needed — implementation matches the plan's exact SQL. Grep criteria was approximate.

**4. [Plan Off-by-One] CURRENT_DATE - INTERVAL grep count is 4 not 3**
- **Found during:** Task 3 verification
- **Issue:** Plan expected 3 matches (update USING, update WITH CHECK, delete USING), but a comment line also contains the phrase.
- **Fix:** No fix needed — implementation matches the plan's exact SQL.

### Pre-existing Issues (Out of Scope)

- `src/pages/Facilities.tsx`: `CalendarClock` not found (2 occurrences)
- `src/pages/IrinsSync.tsx`: Type mismatch on `ReactNode`
- These pre-existed before Plan 02-01 execution. Logged in `deferred-items.md`.

## Threat Flags

None. All security-relevant surfaces are covered by the plan's `<threat_model>`:
- T-02-01 (Tampering): Mitigated by 4-policy split with lock guard
- T-02-02 (Elevation): Accepted — client-side permissions are UI convenience only
- T-02-03 (Elevation): Mitigated by SECURITY DEFINER role check in unlock RPC

## Known Stubs

None. All implementations are complete — no hardcoded empty values, placeholder text, or un-wired data sources.

## TDD Gate Compliance

Plan-level TDD for Task 2:
- [x] RED commit: `90ae9289` — `test(02-committee-management): add failing test for committee permissions module` (13/40 tests failed)
- [x] GREEN commit: `6c84361b` — `feat(02-committee-management): implement committee permissions module (10 functions)` (40/40 tests passed)
- [x] REFACTOR: Not needed — implementation matches plan spec exactly

## Self-Check: PASSED

- [x] `src/contexts/DataContext.tsx` exists and contains committeeMembers + agendaItems
- [x] `src/lib/committees/permissions.ts` exists with 10 exported functions
- [x] `src/lib/committees/permissions.test.ts` exists with 40 passing tests
- [x] `supabase/migrations/20260510000000_committee_minutes_lock.sql` exists with 4 policies + unlock RPC
- [x] All commits verified: `298c4c9b`, `90ae9289`, `6c84361b`, `034351cd`
- [x] `npx tsc --noEmit` shows zero errors from DataContext or permissions module
