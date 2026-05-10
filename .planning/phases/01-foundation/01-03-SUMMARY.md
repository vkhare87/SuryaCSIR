---
phase: 01-foundation
plan: 03
subsystem: Committees & Helpdesk
tags:
  - mock-data
  - data-mapper
  - committees
  - helpdesk
  - seed-data
requires: []
provides:
  - mockCommittees
  - mockCommitteeMembers
  - mockMeetings
  - mockAgendaItems
  - mockActionItems
  - mockMeetingDocuments
  - mockTickets
  - mockTicketResponses
  - mockTicketEvents
  - mockHelpdeskRouting
  - mapCommitteeRow
  - mapCommitteeMemberRow
  - mapMeetingRow
  - mapAgendaItemRow
  - mapActionItemRow
  - mapMeetingDocumentRow
  - mapTicketRow
  - mapTicketResponseRow
  - mapTicketEventRow
affects:
  - src/utils/mockData.ts
  - src/utils/dataMapper.ts
tech-stack:
  added: []
  patterns:
    - "Dual-key mapper passthrough (snake_case only for greenfield tables)"
    - "Descriptive ID prefixes for seed data (cmt-, mmb-, mtg-, agi-, act-, doc-, tkt-, trs-, tev-, rte-)"
key-files:
  created: []
  modified:
    - src/utils/mockData.ts
    - src/utils/dataMapper.ts
decisions:
  - "Committees and helpdesk mappers use snake_case-only keys (no CamelCase fallback) since these are greenfield tables"
  - "Mock ticket tokens use AMPRI-YYMMDD-XXX format matching production token generation pattern"
  - "MockHelpdeskRouting inline type (no dedicated interface) — routing config is a simple array of category-to-target mappings"
  - "Imports split across Task 1 and Task 2 to satisfy noUnusedLocals — Committee types imported in Task 1, Ticket types in Task 2"
metrics:
  duration: 00:12:00
  completed_date: 2026-05-07
---

# Phase 1 Plan 3: Mock Data + DataMapper Functions Summary

Created 10 mock data arrays and 9 DataMapper functions for the committees and helpdesk domains, enabling UI development in Phases 2-3 without requiring a live Supabase database.

## Completed Tasks

### Task 1: Committees Domain Mock Data (6 arrays)

**Commit:** 74ba978f

Created 6 mock data arrays for the committees governance domain:

| Array | Count | Details |
|-------|-------|---------|
| `mockCommittees` | 5 | 4 types: 2 Standing, 1 AdHoc, 1 Review, 1 Advisory |
| `mockCommitteeMembers` | 22 | Members + invitees across all 5 committees |
| `mockMeetings` | 15 | 3 meetings per committee, mix of Completed/Scheduled |
| `mockAgendaItems` | 12 | Across 4 completed meetings with varied statuses |
| `mockActionItems` | 15 | 5 Pending, 5 InProgress, 5 Completed |
| `mockMeetingDocuments` | 5 | PDF documents linked to completed meetings |

All staff ID references (S001-S045, T001-T004, H001-H002, S003, S013) are real IDs from the existing `mockStaff` array, satisfying D-10.

### Task 2: Helpdesk Domain Mock Data (4 arrays) + 9 DataMapper Functions

**Commit:** 8e590017

Created 4 helpdesk mock data arrays and 9 DataMapper functions:

| Array | Count | Details |
|-------|-------|---------|
| `mockTickets` | 20 | Across 8 categories with varied statuses/urgencies |
| `mockTicketResponses` | 10 | Response threads across 6 active tickets |
| `mockTicketEvents` | 13 | Full event trails including lifecycles |
| `mockHelpdeskRouting` | 8 | One routing rule per ticket category (D-08) |

**DataMapper functions added:**
1. `mapCommitteeRow` — Committee mapper
2. `mapCommitteeMemberRow` — CommitteeMember mapper
3. `mapMeetingRow` — Meeting mapper
4. `mapAgendaItemRow` — AgendaItem mapper
5. `mapActionItemRow` — ActionItem mapper
6. `mapMeetingDocumentRow` — MeetingDocument mapper
7. `mapTicketRow` — Ticket mapper
8. `mapTicketResponseRow` — TicketResponse mapper
9. `mapTicketEventRow` — TicketEvent mapper

All mappers follow the established dual-key passthrough pattern. Since these are greenfield tables, only snake_case keys are used (no CamelCase fallback).

## Verification Results

| Criterion | Status |
|-----------|--------|
| 10 mock data arrays exist | PASS |
| 9 DataMapper functions exist | PASS |
| 22 total mapper exports (13 existing + 9 new) | PASS |
| `npm run build` — no new type errors | PASS |
| D-09: 5 committees, 15 meetings, 15 action items, 20 tickets | PASS |
| D-10: All staff references are real mockStaff IDs | PASS |
| D-08: 8 routing rules, one per category | PASS |

Pre-existing build errors in `Facilities.tsx` (CalendarClock not found) and `IrinsSync.tsx` (Type 'unknown') are out of scope and not caused by this plan's changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import split across tasks to satisfy noUnusedLocals**
- **Found during:** Task 1 verification
- **Issue:** Plan instructed adding all 9 types (including Ticket, TicketResponse, TicketEvent) to the import in Task 1, but the ticket data arrays are only added in Task 2. This caused `TS6196: 'Ticket' is declared but never used` errors.
- **Fix:** Imported only committee types in Task 1; added ticket types to import in Task 2 when they became used.
- **Files modified:** `src/utils/mockData.ts`
- **Commit:** 74ba978f (Task 1 with corrected imports)

## Threat Flags

None — mock data and mapper functions are compile-time/data-passing artifacts with no runtime security boundary.

## Self-Check

- [x] `src/utils/mockData.ts` — all 10 mock data exports verified via grep
- [x] `src/utils/dataMapper.ts` — all 9 mapper exports verified via grep
- [x] Commit 74ba978f — Task 1 verified in git log
- [x] Commit 8e590017 — Task 2 verified in git log
- [x] `npm run build` — no new type errors
