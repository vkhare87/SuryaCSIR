-- ═══════════════════════════════════════════════════════════════════════
-- rls_positive.sql — assert the policies did not get tightened past the
-- point of usefulness.
--
-- rls_negative.sql proves an attacker is blocked. On its own that is a
-- dangerous test suite: the cheapest way to pass every one of its
-- assertions is to deny everything. This file is the counterweight — each
-- test asserts a legitimate user CAN still do their job.
--
-- Run alongside the negative file:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_positive.sql
--
-- Transaction-wrapped and rolled back. Creates auth.users rows — scratch or
-- staging databases only, never production.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────
-- submitter, handler, hradmin. The auth trigger grants each 'DefaultUser';
-- we add the real roles as postgres (superuser bypasses RLS).

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'handler@test.local',   'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'hradmin@test.local',   'authenticated', 'authenticated');

INSERT INTO public.user_roles (user_id, role, division_code, must_change_password) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Scientist', 'CMPD', false),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Technician', 'CMPD', false),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'HRAdmin',   NULL,   false)
ON CONFLICT DO NOTHING;

UPDATE public.user_profiles SET active_role = 'Scientist'
 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.user_profiles SET active_role = 'Technician'
 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
UPDATE public.user_profiles SET active_role = 'HRAdmin'
 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- A staff row linked to the submitter, so the staff self-scope has something
-- to match on.
INSERT INTO public.divisions ("divCode", "divName")
VALUES ('CMPD', 'Test Division') ON CONFLICT DO NOTHING;

INSERT INTO public.staff ("ID", "Name", "Email", "Division", user_id)
VALUES ('TSTAFF1', 'Test Submitter', 'submitter@test.local', 'CMPD',
        'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT ("ID") DO UPDATE SET user_id = EXCLUDED.user_id;

INSERT INTO public.tickets (token, subject, category, urgency, description,
                            submitted_by, assigned_to, status)
VALUES ('AMPRI-POS-001', 'Bench lamp flickering', 'Infrastructure', 'Low', 'body',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002', 'Open');

CREATE OR REPLACE PROCEDURE pg_temp.become(p_user uuid, p_email text)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL request.jwt.claims = %L',
        json_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text);
END;
$$;

-- ── P1 — the submitter can read their own ticket ───────────────────────
DO $$
DECLARE v_count int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    SELECT count(*) INTO v_count FROM public.tickets WHERE token = 'AMPRI-POS-001';
    RESET ROLE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P1 FAILED: submitter cannot see their own ticket';
    END IF;
END $$;

-- ── P2 — the assigned handler can read it ──────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002', 'handler@test.local');
    SELECT count(*) INTO v_count FROM public.tickets WHERE token = 'AMPRI-POS-001';
    RESET ROLE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P2 FAILED: assigned handler cannot see their own queue';
    END IF;
END $$;

-- ── P3 — the handler can progress Open -> InProgress ───────────────────
-- This is the regression guard for B1: before the identity fix, assigned_to
-- held a staff."ID" while auth.uid() is a uuid, so the handler was locked
-- out of the ticket routed to them.
DO $$
DECLARE v_ticket uuid; v_status text;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-POS-001';

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002', 'handler@test.local');
    PERFORM public.helpdesk_update_status(
        v_ticket, 'InProgress', 'aaaaaaaa-0000-0000-0000-000000000002');
    RESET ROLE;

    SELECT status INTO v_status FROM public.tickets WHERE id = v_ticket;
    IF v_status <> 'InProgress' THEN
        RAISE EXCEPTION 'P3 FAILED: handler could not progress their ticket (status=%)', v_status;
    END IF;
END $$;

-- ── P4 — the submitter can close their own resolved ticket ─────────────
DO $$
DECLARE v_ticket uuid; v_status text;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-POS-001';

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002', 'handler@test.local');
    PERFORM public.helpdesk_update_status(
        v_ticket, 'Resolved', 'aaaaaaaa-0000-0000-0000-000000000002');
    RESET ROLE;

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    PERFORM public.helpdesk_update_status(
        v_ticket, 'Closed', 'aaaaaaaa-0000-0000-0000-000000000001');
    RESET ROLE;

    SELECT status INTO v_status FROM public.tickets WHERE id = v_ticket;
    IF v_status <> 'Closed' THEN
        RAISE EXCEPTION 'P4 FAILED: submitter could not close their resolved ticket (status=%)', v_status;
    END IF;
END $$;

-- ── P5 — the submitter can add a response to their own ticket ──────────
DO $$
DECLARE v_ticket uuid; v_count int;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-POS-001';

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    PERFORM public.helpdesk_add_response(
        v_ticket, 'aaaaaaaa-0000-0000-0000-000000000001', 'still flickering');
    SELECT count(*) INTO v_count FROM public.ticket_responses WHERE ticket_id = v_ticket;
    RESET ROLE;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P5 FAILED: submitter could not read back their own response';
    END IF;
END $$;

-- ── P6 — an HRAdmin still sees every ticket ────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'hradmin@test.local');
    SELECT count(*) INTO v_count FROM public.tickets WHERE token = 'AMPRI-POS-001';
    RESET ROLE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P6 FAILED: HRAdmin lost visibility of the helpdesk';
    END IF;
END $$;

-- ── P7 — an HRAdmin can reassign ───────────────────────────────────────
DO $$
DECLARE v_ticket uuid; v_assignee text;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-POS-001';

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'hradmin@test.local');
    PERFORM public.helpdesk_assign_ticket(
        v_ticket, 'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000003');
    RESET ROLE;

    SELECT assigned_to INTO v_assignee FROM public.tickets WHERE id = v_ticket;
    IF v_assignee <> 'aaaaaaaa-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'P7 FAILED: HRAdmin could not reassign (assignee=%)', v_assignee;
    END IF;
END $$;

-- ── P8 — a user can read their own linked staff row ────────────────────
DO $$
DECLARE v_count int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    SELECT count(*) INTO v_count FROM public.staff WHERE "ID" = 'TSTAFF1';
    RESET ROLE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P8 FAILED: user cannot read their own staff row';
    END IF;
END $$;

-- ── P9 — a user can switch to a role they actually hold ────────────────
-- The B5 trigger must reject unheld roles without blocking the role switcher.
DO $$
DECLARE v_active text;
BEGIN
    INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'HOD', 'CMPD', false)
    ON CONFLICT DO NOTHING;

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    UPDATE public.user_profiles SET active_role = 'HOD'
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    RESET ROLE;

    SELECT active_role INTO v_active FROM public.user_profiles
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    IF v_active <> 'HOD' THEN
        RAISE EXCEPTION 'P9 FAILED: role switcher blocked for a held role (active=%)', v_active;
    END IF;
END $$;

-- ── P10 — a user can still stamp their own last_seen_at ────────────────
DO $$
DECLARE v_seen timestamptz;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    UPDATE public.user_profiles SET last_seen_at = now()
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    RESET ROLE;

    SELECT last_seen_at INTO v_seen FROM public.user_profiles
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    IF v_seen IS NULL THEN
        RAISE EXCEPTION 'P10 FAILED: login could not stamp last_seen_at';
    END IF;
END $$;

-- ── P11 — a user can still save dashboard preferences ──────────────────
-- merge_user_preferences lost its RLS route when `preferences` left the
-- column grant; it became SECURITY DEFINER and must still work.
DO $$
DECLARE v_pref jsonb;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    PERFORM public.merge_user_preferences('{"directorThresholds":{"lowBurnPct":40}}'::jsonb);
    RESET ROLE;

    SELECT preferences INTO v_pref FROM public.user_profiles
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    IF v_pref -> 'directorThresholds' ->> 'lowBurnPct' <> '40' THEN
        RAISE EXCEPTION 'P11 FAILED: preferences did not persist (%)', v_pref;
    END IF;
END $$;

-- ── P12 — an admin can promote a document tier ─────────────────────────
DO $$
DECLARE v_doc uuid; v_tier text;
BEGIN
    INSERT INTO public.documents
        (entity_type, entity_id, doc_type, title, storage_bucket, storage_path,
         file_name, owner_id, access_tier)
    VALUES ('harvested', 'p12', 'harvested_file', 'reviewed', 'documents',
            'p12/reviewed.pdf', 'reviewed.pdf',
            'aaaaaaaa-0000-0000-0000-000000000003', 'confidential')
    RETURNING id INTO v_doc;

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'hradmin@test.local');
    PERFORM public.documents_set_access_tier(v_doc, 'institute');
    RESET ROLE;

    SELECT access_tier INTO v_tier FROM public.documents WHERE id = v_doc;
    IF v_tier <> 'institute' THEN
        RAISE EXCEPTION 'P12 FAILED: admin could not promote a reviewed document (tier=%)', v_tier;
    END IF;
END $$;

-- ── P13 — an admin still sees the whole user directory ─────────────────
DO $$
DECLARE v_rows int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'hradmin@test.local');
    SELECT count(*) INTO v_rows FROM public.user_directory();
    RESET ROLE;
    IF v_rows < 3 THEN
        RAISE EXCEPTION 'P13 FAILED: admin directory returned only % row(s)', v_rows;
    END IF;
END $$;

-- ── P14 (A3b) — the real PI still sees their own project ───────────────
-- The counterweight to T13: keying visibility to staff."ID" must not cost
-- the actual owner their access.
DO $$
DECLARE v_count int;
BEGIN
    INSERT INTO public.projects ("ProjectNo", "ProjectName", "PrincipalInvestigator",
                                 "DivisionCode")
    VALUES ('P14-PRJ', 'My own project', 'Test Submitter', 'CMPD');

    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'submitter@test.local');
    SELECT count(*) INTO v_count FROM public.projects WHERE "ProjectNo" = 'P14-PRJ';
    RESET ROLE;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P14 FAILED: PI lost sight of their own project';
    END IF;
END $$;

-- ── P15 (A3b) — the sync trigger keys unambiguous names automatically ──
-- The import pipeline writes names, not keys. If the trigger did not
-- resolve them, every upload would silently reopen the gap.
DO $$
DECLARE v_key text;
BEGIN
    SELECT pi_staff_id INTO v_key FROM public.projects WHERE "ProjectNo" = 'P14-PRJ';
    IF v_key IS DISTINCT FROM 'TSTAFF1' THEN
        RAISE EXCEPTION 'P15 FAILED: sync_staff_key did not resolve an unambiguous PI (got %)', v_key;
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL RLS POSITIVE TESTS PASSED'; END $$;

ROLLBACK;
