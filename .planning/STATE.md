---
milestone: v1.0
milestone_name: Committees & Helpdesk
status: planning
progress:
  phases_total: 4
  phases_completed: 0
  tasks_total: 0
  tasks_completed: 0
---

## Current Position

Phase: 1 — Foundation
Plan: .planning/phases/01-foundation/01-CONTEXT.md — Context captured
Status: Context gathered, ready to plan
Last activity: 2026-05-07 — Phase 1 context gathered (RLS depth, routing config, mock data decisions)

## Accumulated Context

### Decisions
- Approach B (SURYA-native) — design from scratch, no AHEAD code copied
- Separate modules — committees and helpdesk are independent
- Snake_case for new tables
- Auto-routing via DB function with config table fallback chain
- Ticket state machine via RPCs (mirrors PMS pattern)
- 8 ticket categories: Infrastructure, EquipmentIT, Administrative, HRGrievance, Finance, LabResearch, Library, Transport

### Blockers/Concerns
- None

### Active TODOs
- None

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
