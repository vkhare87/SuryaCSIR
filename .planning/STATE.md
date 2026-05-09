---
milestone: v1.0
milestone_name: Committees & Helpdesk
status: executing
progress:
  phases_total: 4
  phases_completed: 1
  plans_total: 4
  plans_completed: 4
  tasks_total: 8
  tasks_completed: 8
---

## Current Position

Phase: 1 — Foundation
Plan: 01-04 — DataContext extensions complete
Status: Phase 1 COMPLETE — 4 of 4 plans done. Foundation data layer ready for Phase 2 (Committees) and Phase 3 (Helpdesk)
Last activity: 2026-05-09 — Completed 01-04: 7 new DataContext arrays wired (committees, meetings, actionItems, meetingDocs, tickets, ticketResponses, ticketEvents)

## Accumulated Context

### Decisions
- Approach B (SURYA-native) — design from scratch, no AHEAD code copied
- Separate modules — committees and helpdesk are independent
- Snake_case for new tables
- Auto-routing via DB function with config table fallback chain
- Ticket state machine via RPCs (mirrors PMS pattern)
- 8 ticket categories: Infrastructure, EquipmentIT, Administrative, HRGrievance, Finance, LabResearch, Library, Transport
- Committees and helpdesk mappers use snake_case-only keys (no CamelCase fallback) for greenfield tables
- Mock ticket tokens use AMPRI-YYMMDD-XXX format matching production pattern
- Import split across tasks (Committee types in Task 1, Ticket types in Task 2) to satisfy noUnusedLocals
- committee_members and agenda_items loaded from Supabase but not stored in top-level state — reserved for Phase 2 committee detail pages
- No client-side role scoping for committees/tickets in Phase 1 — full division-based scoping deferred to Phases 2 and 3 when staff-user linking is built
- Combined Task 1+2 into single commit — tasks cannot compile independently due to noUnusedLocals
- Removed 4 plan-specified imports to satisfy noUnusedLocals (CommitteeMember, AgendaItem, 2 mappers, 2 mock arrays)

### Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Commit(s) |
|-------|------|----------|-------|-------|-----------|
| 01-foundation | 01-01 | ~00:15:00 | 2 | 3 | ffb8ef3d, d72c1a6e |
| 01-foundation | 01-02 | ~00:20:00 | 2 | 3 | d6eb44f6, f236e76a |
| 01-foundation | 01-03 | ~00:12:00 | 2 | 2 | 74ba978f, 8e590017 |
| 01-foundation | 01-04 | ~00:08:00 | 2 | 1 | 196f0e21 |

### Blockers/Concerns
- None

### Active TODOs
- None

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
