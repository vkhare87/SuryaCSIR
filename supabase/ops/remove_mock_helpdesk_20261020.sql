-- ═══════════════════════════════════════════════════════════════════════
-- remove_mock_helpdesk_20261020.sql
--
-- Second clean-up of the demo helpdesk fixture (supabase/mock/10_helpdesk_tickets.sql)
-- found in the live project on 2026-10-20: 15 of 16 tickets were demo rows, and
-- the first notifications sweep (20261020000001) announced 7 of them to real users.
--
-- remove_mock_helpdesk.sql (2026-07-26) no longer fits: it expects exactly 20 rows
-- with staff-ID actors, but 20260725000004 made the actor columns uuid, so those
-- predicates no longer match. This script keys on what only the fixture has:
--
--   1. id in the fixture's reserved range  aaaa1111-aaaa-aaaa-aaaa-…  AND
--   2. token one of the fixture's 20 tokens.
--
-- Both must hold. It aborts unless exactly the expected number of tickets match,
-- so a changed database is inspected before anything is deleted.
--
-- Removes: the matched tickets (ticket_responses / ticket_events cascade) and the
-- notifications that point at them. The audit_log trigger records each deleted
-- ticket and response with actor 'system', so the removal itself is on record.
--
-- Run (data-only, no DDL):
--   1. preview:  npx supabase db query --linked -f supabase/ops/remove_mock_helpdesk_20261020.preview.sql
--   2. delete:   npx supabase db query --linked -f supabase/ops/remove_mock_helpdesk_20261020.sql
-- Rerun: a second run finds 0 rows and does nothing.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    c_expected CONSTANT int := 15;
    v_tickets  int;
    v_notes    int;
    v_left     int;
BEGIN
    CREATE TEMP TABLE _mock_tickets ON COMMIT DROP AS
    SELECT id
      FROM public.tickets
     WHERE id::text LIKE 'aaaa1111-aaaa-aaaa-aaaa-%'
       AND token IN (
            'AMPRI-260330-001','AMPRI-260408-001','AMPRI-260410-001','AMPRI-260415-001',
            'AMPRI-260418-001','AMPRI-260420-001','AMPRI-260425-001','AMPRI-260430-001',
            'AMPRI-260501-001','AMPRI-260501-002','AMPRI-260502-001','AMPRI-260502-002',
            'AMPRI-260503-001','AMPRI-260503-002','AMPRI-260504-001','AMPRI-260504-002',
            'AMPRI-260505-001','AMPRI-260506-001','AMPRI-260506-002','AMPRI-260507-001');

    SELECT count(*) INTO v_tickets FROM _mock_tickets;
    IF v_tickets = 0 THEN
        RAISE NOTICE 'nothing to do — already cleaned up';
        RETURN;
    END IF;
    IF v_tickets <> c_expected THEN
        RAISE EXCEPTION 'expected % demo tickets, found % — inspect before deleting', c_expected, v_tickets;
    END IF;

    -- The two predicates must agree: a reserved-range id with a non-fixture token
    -- (or the reverse) means something unexpected is in the table.
    IF EXISTS (SELECT 1 FROM public.tickets
                WHERE id::text LIKE 'aaaa1111-aaaa-aaaa-aaaa-%'
                  AND id NOT IN (SELECT id FROM _mock_tickets)) THEN
        RAISE EXCEPTION 'a reserved-range ticket has a non-fixture token — inspect before deleting';
    END IF;

    DELETE FROM public.notifications n
     USING _mock_tickets m
     WHERE n.kind = 'ticket'
       AND (n.dedupe_key = 'ticket:' || m.id OR n.link = '/helpdesk/' || m.id);
    GET DIAGNOSTICS v_notes = ROW_COUNT;

    DELETE FROM public.tickets WHERE id IN (SELECT id FROM _mock_tickets);

    SELECT count(*) INTO v_left FROM public.tickets WHERE id::text LIKE 'aaaa1111-aaaa-aaaa-aaaa-%';
    IF v_left <> 0 THEN
        RAISE EXCEPTION '% demo ticket(s) still present after delete', v_left;
    END IF;

    RAISE NOTICE 'removed % demo ticket(s) and % notification(s)', v_tickets, v_notes;
END $$;
