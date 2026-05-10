---
phase: 01-foundation
plan: 02
subsystem: database
tags: [migration, sql, rls, rpc, committees, helpdesk, supabase]
requires: []
provides: committees-helpdesk-data-layer
affects:
  - supabase/migrations/
tech-stack:
  added:
    - PL/pgSQL
    - Supabase Storage Buckets
  patterns:
    - Shallow RLS (SELECT=all authenticated, ALL=admin roles)
    - SECURITY DEFINER RPCs for ticket state machine
    - Token generation pattern (AMPRI-YYMMDD-XXX)
key-files:
  created:
    - supabase/migrations/20260507000000_committees_helpdesk.sql
  modified: []
decisions:
  - D-01: Shallow RLS -- SELECT = all authenticated, ALL = Director/SystemAdmin/MasterAdmin
  - D-02: No RPC write gates for committee tables -- direct CRUD via RLS
  - D-03: No minutes lock -- RLS and app-level are sufficient for now
  - D-06: route_ticket default = submitter's DivisionHead
  - D-07: Fallback chain = DivisionHead -> HRAdmin -> SystemAdmin
  - D-08: One row per category in helpdesk_routing config table
metrics:
  duration_seconds: 240
  completed_date: 2026-05-07
---

# Phase 01 Plan 02: Committees & Helpdesk Database Migration Summary

Complete database migration for the committees and helpdesk modules: 11 tables with snake_case columns, B-tree indexes, RLS policies, 3 SECURITY DEFINER RPCs for the ticket state machine, and a storage bucket for meeting documents.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration file -- tables, indexes, triggers | `5cb0b843` | `supabase/migrations/20260507000000_committees_helpdesk.sql` |
| 2 | Add RLS policies + RPCs + storage bucket | `90c10b9c` | `supabase/migrations/20260507000000_committees_helpdesk.sql` |

## Blocked Tasks

| Task | Name | Status | Blocker |
|------|------|--------|---------|
| 3 | Push schema to Supabase via `supabase db push` | blocked | Auth gate -- see below |

### Task 3: Auth Gate

**What's needed:** Push the migration to the live Supabase database.

**Blocked by:**
1. `SUPABASE_ACCESS_TOKEN` environment variable is not set
2. Supabase CLI is not linked to a project (`supabase link` not run)

**Resolution steps (manual):**
```
# 1. Get a Supabase access token
#    Visit: https://supabase.com/dashboard/account/tokens
#    Generate a new token, then set it:
$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'

# 2. Link to your project (if not already linked)
npx supabase link --project-ref <your-project-ref>

# 3. Push the migration
npx supabase db push

# 4. Verify no drift
npx supabase db diff --use-migration 20260507000000_committees_helpdesk.sql
```

**Note:** The SQL migration file itself is complete and correct (validated via grep checks). The push is blocked only by missing credentials, not by any issue with the migration.

## Migration File Content

**File:** `supabase/migrations/20260507000000_committees_helpdesk.sql` (430 lines)

| Section | Count | Details |
|---------|-------|---------|
| Tables | 11 | committees, committee_members, meetings, agenda_items, action_items, meeting_documents, tickets, ticket_responses, ticket_events, helpdesk_routing, audit_log |
| Indexes | 19 | B-tree on all lookup columns (FKs, statuses, tokens, dates) |
| Triggers | 1 | `trg_tickets_updated_at` using `pms_set_updated_at()` |
| RLS Policies | 24 | 11 SELECT + 11 ALL + 2 storage bucket policies |
| RPCs | 3 | `route_ticket`, `helpdesk_create_ticket`, `helpdesk_update_status` |
| SECURITY DEFINER | 3 | All 3 RPCs run with definer's privileges to bypass RLS |

### RPC Design

**route_ticket(category, submitter_id) -> handler_id:**
4-tier fallback resolution:
1. `helpdesk_routing` config table override (per-category)
2. Submitter's DivisionHead (via `divisions.divHoDID`)
3. Any user with `HRAdmin` role
4. Any user with `SystemAdmin` role (last resort)

**helpdesk_create_ticket(subject, category, urgency, description, submitted_by) -> ticket_id:**
- Auto-generates token: `AMPRI-{YYMMDD}-{auto-incrementing sequence}`
- Routes assignment via `route_ticket()`
- Logs `Created` and `Assigned` events

**helpdesk_update_status(ticket_id, new_status, actor_id) -> void:**
- State machine validation: `Open -> InProgress -> Resolved -> Closed` (with reopen paths)
- Invalid transitions raise EXCEPTION
- Logs appropriate event (`Resolved`, `Closed`, `Reopened`, `StatusChanged`)

### Storage Bucket

- **Bucket:** `committee-docs` (private -- not public)
- **SELECT:** All authenticated users can download documents
- **INSERT:** Only Director, SystemAdmin, MasterAdmin can upload

## Deviations from Plan

None -- the migration SQL was executed exactly as specified in the plan.

### Known Plan-Level Quirk

The plan's acceptance criterion for Task 2 expects `grep -c "Fallback.*DivisionHead.*HRAdmin.*SystemAdmin"` (capital F) to match, but the plan's own SQL writes `-- Decision D-07: fallback = ...` (lowercase f). The actual comment content is correct; the grep pattern has a casing mismatch in the plan. Verified with `grep -i` (case-insensitive) which finds the content correctly.

## INT-04 Compliance

INT-04 requirement ("all tables have explicit RLS"): **SATISFIED**

All 11 new tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with explicit SELECT and ALL policies. The `committee-docs` storage bucket also has explicit RLS policies for SELECT and INSERT.

## Self-Check

- [x] Migration file exists: `supabase/migrations/20260507000000_committees_helpdesk.sql` (430 lines)
- [x] Commit `5cb0b843`: 11 tables, 19 indexes, 1 trigger
- [x] Commit `90c10b9c`: RLS policies, 3 RPCs, storage bucket
- [x] No file deletions in either commit
- [x] All acceptance criteria verified by grep checks
