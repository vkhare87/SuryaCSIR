-- ═══════════════════════════════════════════════════════════════════════
-- remove_mock_helpdesk.sql
--
-- Deletes the 20 demo tickets from supabase/mock/10_helpdesk_tickets.sql
-- that were loaded into the live project. CLAUDE.md is explicit that
-- supabase/mock/ is "dev only — NEVER in prod"; this undoes that for the
-- helpdesk fixture specifically.
--
-- Why now: 20260725000004 converts the ticket actor columns to
-- uuid REFERENCES auth.users(id) and refuses to run while non-uuid values
-- remain, because nulling them would erase who did what. For these rows
-- there is nothing to erase — the mock file's own header states that
-- submitted_by / assigned_to / author_id / actor_id are text refs to
-- staff."ID" (H001, S001, T001 …), staff who have no login. No real person
-- ever filed these tickets.
--
-- Genuine tickets are unaffected: helpdesk_create_ticket writes auth.uid(),
-- so real rows are already uuid-form and fail both predicates below.
--
-- SAFETY — every delete is gated on BOTH:
--   1. the token being one of the 20 known mock tokens, AND
--   2. submitted_by not being uuid-shaped
-- Condition 2 is the load-bearing one. Tokens are date-derived, so a real
-- ticket could in principle carry a matching token; it could never also
-- carry a staff-ID actor. The script aborts if the two disagree.
--
-- Run (data-only, no DDL — the "never use the Dashboard SQL Editor" rule in
-- CLAUDE.md is about schema drift and does not apply here):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/ops/remove_mock_helpdesk.sql
--   -- or paste into Dashboard → SQL Editor
--
-- Transaction-wrapped: it either removes all 20 and their children, or
-- nothing. Re-running after success is a no-op (0 rows matched).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _mock_tickets ON COMMIT DROP AS
SELECT id, token, submitted_by
  FROM public.tickets
 WHERE token IN (
        'AMPRI-260330-001','AMPRI-260408-001','AMPRI-260410-001','AMPRI-260415-001',
        'AMPRI-260418-001','AMPRI-260420-001','AMPRI-260425-001','AMPRI-260430-001',
        'AMPRI-260501-001','AMPRI-260501-002','AMPRI-260502-001','AMPRI-260502-002',
        'AMPRI-260503-001','AMPRI-260503-002','AMPRI-260504-001','AMPRI-260504-002',
        'AMPRI-260505-001','AMPRI-260506-001','AMPRI-260506-002','AMPRI-260507-001')
   -- Not uuid-shaped ⇒ a staff."ID" actor ⇒ fixture, not a real filing.
   AND submitted_by !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$';

-- Child rows whose own audit_log entries key on the response id, captured
-- before the cascade removes them.
CREATE TEMP TABLE _mock_responses ON COMMIT DROP AS
SELECT id FROM public.ticket_responses
 WHERE ticket_id IN (SELECT id FROM _mock_tickets);

DO $$
DECLARE
    v_tickets   int;
    v_remaining int;
BEGIN
    SELECT count(*) INTO v_tickets FROM _mock_tickets;

    RAISE NOTICE 'matched % mock ticket(s) for deletion', v_tickets;

    IF v_tickets = 0 THEN
        RAISE NOTICE 'nothing to do — already cleaned up';
        RETURN;
    END IF;

    -- Refuse on a partial match. Fewer than 20 means either a prior partial
    -- run or a token carried by something that is not the fixture, and
    -- guessing which is not this script's job.
    IF v_tickets <> 20 THEN
        RAISE EXCEPTION 'expected 20 mock tickets, found % — inspect before deleting', v_tickets;
    END IF;

    -- Nothing outside the fixture may share these tokens.
    SELECT count(*) INTO v_remaining
      FROM public.tickets t
      JOIN _mock_tickets m ON m.token = t.token
     WHERE t.id <> m.id;
    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'token collision with % non-fixture ticket(s) — aborting', v_remaining;
    END IF;
END $$;

-- audit_log has no FK to tickets, so cascades do not reach it.
DELETE FROM public.audit_log
 WHERE (entity_type = 'ticket'          AND entity_id IN (SELECT id FROM _mock_tickets))
    OR (entity_type = 'ticket_response' AND entity_id IN (SELECT id FROM _mock_responses));

-- ticket_responses and ticket_events are ON DELETE CASCADE (stage 05).
DELETE FROM public.tickets WHERE id IN (SELECT id FROM _mock_tickets);

-- Prove the blocker is gone before committing.
--
-- This must mirror what 20260725000004 ACTUALLY does, not just its guard.
-- The migration nulls the 'system' sentinel in step 1, *before* the guard in
-- step 2 — so 'system' never reaches the check and must be excluded here too.
-- An earlier version of this block omitted that and failed on a value the
-- migration handles perfectly well, rolling back a correct cleanup.
DO $$
DECLARE
    v_bad     int;
    v_details text;
BEGIN
    WITH offenders AS (
        SELECT 'tickets.submitted_by' AS col, submitted_by AS val
          FROM public.tickets
         WHERE submitted_by !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
        UNION ALL
        SELECT 'tickets.assigned_to', assigned_to
          FROM public.tickets
         WHERE assigned_to IS NOT NULL
           AND assigned_to !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
        UNION ALL
        SELECT 'ticket_responses.author_id', author_id
          FROM public.ticket_responses
         WHERE author_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
        UNION ALL
        SELECT 'ticket_events.actor_id', actor_id
          FROM public.ticket_events
         WHERE actor_id IS NOT NULL
           -- Excluded: 20260725000004 nulls this before its own guard runs.
           AND actor_id <> 'system'
           AND actor_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    )
    SELECT count(*), string_agg(DISTINCT format('%s = %L', col, val), E'\n  ')
      INTO v_bad, v_details
      FROM offenders;

    IF v_bad > 0 THEN
        -- Name the values. Counting alone made the previous failure a guess.
        RAISE EXCEPTION E'still % non-uuid actor value(s) after cleanup:\n  %\n20260725000004 would abort again. Rolling back so you can inspect.',
            v_bad, v_details;
    END IF;
    RAISE NOTICE 'clean: no blocking actor values remain. 20260725000004 will apply.';
END $$;

COMMIT;
