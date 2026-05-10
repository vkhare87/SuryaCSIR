---
phase: 03-helpdesk
plan: 02
subsystem: helpdesk
tags: [migration, rpc, supabase, security-definer, helpdesk]
requires: []
provides: [helpdesk_assign_ticket RPC, helpdesk_add_response RPC]
affects: [supabase/migrations]
tech-stack:
  added: []
  patterns: [SECURITY DEFINER RPC, auth.uid() spoofing check, jsonb_build_object event logging]
key-files:
  created:
    - supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql
  modified: []
decisions:
  - SECURITY DEFINER pattern mirrors existing helpdesk RPCs in 20260507000000_committees_helpdesk.sql
  - helpdesk_add_response enforces p_author_id = auth.uid() to mitigate STRIDE T-03-05 (spoofing)
  - helpdesk_assign_ticket logs Assigned event with old→new handler in jsonb_build_object details
  - No ticket_event logged by add_response — ticket_responses rows serve as their own audit trail
metrics:
  duration: ~00:10:00
  completed_date: "2026-05-10"
---

# Phase 3 Plan 2: Helpdesk Phase 3 RPCs Summary

Migration adding two SECURITY DEFINER RPCs required for Phase 3 helpdesk operations: atomic ticket reassignment with event logging and response insertion bypassing RLS for non-admin users.

## Tasks Completed

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | [BLOCKING] Create migration file with helpdesk_assign_ticket and helpdesk_add_response RPCs | Complete | c0b63b46 |
| 2 | Push migration to Supabase | Awaiting human action | — |

## What Was Built

**File:** `supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql` (78 lines)

**Two SECURITY DEFINER RPCs:**

1. **`helpdesk_assign_ticket(p_ticket_id, p_new_handler_id, p_actor_id)`**
   - Atomically updates `assigned_to` and `updated_at` on the tickets table
   - Logs an `Assigned` event in ticket_events with old→new handler in jsonb details
   - Raises EXCEPTION if ticket not found

2. **`helpdesk_add_response(p_ticket_id, p_author_id, p_message)`**
   - Inserts a row into ticket_responses and returns the new row's uuid
   - Enforces `p_author_id = auth.uid()` to prevent response spoofing (STRIDE T-03-05)
   - Uses SECURITY DEFINER to bypass RLS (current policy restricts INSERT to admin roles only)
   - Raises EXCEPTION if ticket not found or author_id mismatch

## Deviations from Plan

None — plan executed exactly as written. The SQL content matches the plan's specification with only minor comment-style adjustments to align with the existing migration's formatting conventions (section dividers, header comments).

## Checkpoint Status

**Task 2 is a `checkpoint:human-action`** — the migration file exists locally but must be pushed to Supabase. This requires a manual CLI command that cannot be automated in the current environment.

**User action needed:**
```bash
cd C:\Users\HP\Desktop\Claude\Surya && npx supabase db push
```

If the Supabase CLI is not authenticated, run `npx supabase login` first, then retry.

**Verification:** After successful push, confirm RPCs exist by running in Supabase SQL Editor:
```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'helpdesk_%' ORDER BY proname;
```
Expected: `helpdesk_add_response`, `helpdesk_assign_ticket`, `helpdesk_create_ticket`, `helpdesk_update_status`, `route_ticket`

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: T-03-05 mitigate | 20260510000000_helpdesk_phase3_rpcs.sql | helpdesk_add_response enforces p_author_id = auth.uid() — prevents user A posting as user B |
| threat_flag: T-03-06 mitigate | 20260510000000_helpdesk_phase3_rpcs.sql | helpdesk_assign_ticket is SECURITY DEFINER — atomic UPDATE + INSERT maintains audit trail |

## Known Stubs

None.

## Self-Check

All created files exist:
- supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql — EXISTS (committed at c0b63b46)
