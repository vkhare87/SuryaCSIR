-- ═══════════════════════════════════════════════════════════════════════
-- rls_negative.sql — assert that a low-privilege account CANNOT do the
-- things the 2026-07-25 security audit found it could.
--
-- These are negative-path tests: every one of them PASSED (i.e. the attack
-- worked) before 20260725000001/2. The existing vitest suite is 588 green
-- tests over pure functions and would not have caught a single one of them,
-- because none of these bugs live in TypeScript.
--
-- Run against a database with all migrations + seed applied:
--
--   supabase db reset
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_negative.sql
--
-- Everything happens inside a transaction that is rolled back, so it is safe
-- to run against a scratch/staging database. Do NOT run against production —
-- it creates auth.users rows before rolling them back.
--
-- Output: "ALL RLS NEGATIVE TESTS PASSED" or an exception naming the failure.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────
-- Two accounts. The auth trigger (handle_new_auth_user) gives each a
-- DefaultUser role + a user_profiles row automatically.

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local',  'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'victim@test.local',   'authenticated', 'authenticated');

-- A ticket belonging to the victim that lowpriv has nothing to do with.
INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, status)
VALUES ('AMPRI-TEST-001', 'Salary discrepancy', 'HRGrievance', 'High',
        'Confidential grievance body', '22222222-2222-2222-2222-222222222222', 'Open');

-- Helper: run a statement as `lowpriv` and report whether it was blocked.
CREATE OR REPLACE FUNCTION pg_temp.blocked(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE p_sql;
    RETURN false;   -- statement succeeded → NOT blocked
EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN
    RETURN true;
END;
$$;

CREATE OR REPLACE PROCEDURE pg_temp.become(p_user uuid, p_email text)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('SET LOCAL ROLE authenticated');
    EXECUTE format(
        'SET LOCAL request.jwt.claims = %L',
        json_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text
    );
END;
$$;

-- ── T1 (CRIT-1) — role self-escalation ─────────────────────────────────
DO $$
DECLARE v_role text;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');

    PERFORM pg_temp.blocked(
        'UPDATE public.user_roles SET role = ''MasterAdmin''
          WHERE user_id = ''11111111-1111-1111-1111-111111111111''');

    RESET ROLE;
    SELECT role INTO v_role FROM public.user_roles
     WHERE user_id = '11111111-1111-1111-1111-111111111111';

    IF v_role <> 'DefaultUser' THEN
        RAISE EXCEPTION 'T1 FAILED: user escalated own role to %', v_role;
    END IF;
END $$;

-- ── T2 (CRIT-1) — division self-assignment ─────────────────────────────
DO $$
DECLARE v_div text;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');

    PERFORM pg_temp.blocked(
        'UPDATE public.user_roles SET division_code = ''CMPD''
          WHERE user_id = ''11111111-1111-1111-1111-111111111111''');

    RESET ROLE;
    SELECT division_code INTO v_div FROM public.user_roles
     WHERE user_id = '11111111-1111-1111-1111-111111111111';

    IF v_div IS NOT NULL THEN
        RAISE EXCEPTION 'T2 FAILED: user self-assigned division %', v_div;
    END IF;
END $$;

-- ── T3 (B5) — clearing one's own forced-rotation flag ──────────────────
DO $$
DECLARE v_flag boolean;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');

    PERFORM pg_temp.blocked(
        'UPDATE public.user_profiles SET must_change_password = false
          WHERE user_id = ''11111111-1111-1111-1111-111111111111''');

    RESET ROLE;
    SELECT must_change_password INTO v_flag FROM public.user_profiles
     WHERE user_id = '11111111-1111-1111-1111-111111111111';

    IF v_flag IS NOT TRUE THEN
        RAISE EXCEPTION 'T3 FAILED: user cleared own must_change_password';
    END IF;
END $$;

-- ── T4 (B5) — claiming an active_role one does not hold ────────────────
DO $$
DECLARE v_active text;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');

    PERFORM pg_temp.blocked(
        'UPDATE public.user_profiles SET active_role = ''MasterAdmin''
          WHERE user_id = ''11111111-1111-1111-1111-111111111111''');

    RESET ROLE;
    SELECT active_role INTO v_active FROM public.user_profiles
     WHERE user_id = '11111111-1111-1111-1111-111111111111';

    IF v_active = 'MasterAdmin' THEN
        RAISE EXCEPTION 'T4 FAILED: user claimed an unheld active_role';
    END IF;
END $$;

-- ── T5 (HIGH-3) — reading someone else's helpdesk grievance ────────────
DO $$
DECLARE v_count int;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    SELECT count(*) INTO v_count FROM public.tickets WHERE token = 'AMPRI-TEST-001';
    RESET ROLE;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'T5 FAILED: non-participant read % foreign ticket(s)', v_count;
    END IF;
END $$;

-- ── T6 (HIGH-2) — driving a ticket one has no relationship to ──────────
DO $$
DECLARE v_ticket uuid; v_status text;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-TEST-001';

    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    PERFORM pg_temp.blocked(format(
        'SELECT public.helpdesk_update_status(%L::uuid, ''Closed'',
                ''11111111-1111-1111-1111-111111111111'')', v_ticket));
    RESET ROLE;

    SELECT status INTO v_status FROM public.tickets WHERE id = v_ticket;
    IF v_status <> 'Open' THEN
        RAISE EXCEPTION 'T6 FAILED: outsider moved ticket to %', v_status;
    END IF;
END $$;

-- ── T7 (HIGH-2) — forging the actor id in the audit trail ──────────────
DO $$
DECLARE v_ticket uuid; v_forged int;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets WHERE token = 'AMPRI-TEST-001';

    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    PERFORM pg_temp.blocked(format(
        'SELECT public.helpdesk_assign_ticket(%L::uuid,
                ''11111111-1111-1111-1111-111111111111'',
                ''22222222-2222-2222-2222-222222222222'')', v_ticket));
    RESET ROLE;

    SELECT count(*) INTO v_forged FROM public.ticket_events
     WHERE ticket_id = v_ticket AND actor_id = '22222222-2222-2222-2222-222222222222';

    IF v_forged <> 0 THEN
        RAISE EXCEPTION 'T7 FAILED: % event(s) written under a forged actor', v_forged;
    END IF;
END $$;

-- ── T8 (HIGH-2) — filing a ticket as somebody else ─────────────────────
DO $$
DECLARE v_impersonated int;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    PERFORM pg_temp.blocked(
        'SELECT public.helpdesk_create_ticket(''spoof'', ''Finance'', ''Low'', ''x'',
                ''22222222-2222-2222-2222-222222222222'')');
    RESET ROLE;

    SELECT count(*) INTO v_impersonated FROM public.tickets
     WHERE subject = 'spoof' AND submitted_by = '22222222-2222-2222-2222-222222222222';

    IF v_impersonated <> 0 THEN
        RAISE EXCEPTION 'T8 FAILED: ticket filed under another user''s identity';
    END IF;
END $$;

-- ── T9 (HIGH-4) — self-publishing into the institute RAG corpus ────────
DO $$
DECLARE v_published int;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    PERFORM pg_temp.blocked(
        'INSERT INTO public.documents
           (entity_type, entity_id, doc_type, title, storage_bucket, storage_path,
            file_name, owner_id, access_tier)
         VALUES (''harvested'', ''t9'', ''harvested_file'', ''poison'', ''documents'',
                 ''t9/poison.pdf'', ''poison.pdf'',
                 ''11111111-1111-1111-1111-111111111111'', ''institute'')');
    RESET ROLE;

    SELECT count(*) INTO v_published FROM public.documents
     WHERE storage_path = 't9/poison.pdf' AND access_tier = 'institute';

    IF v_published <> 0 THEN
        RAISE EXCEPTION 'T9 FAILED: non-admin published an institute-tier document';
    END IF;
END $$;

-- ── T10 (MED-7) — enumerating every account in the institute ───────────
DO $$
DECLARE v_rows int;
BEGIN
    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    SELECT count(*) INTO v_rows FROM public.user_directory();
    RESET ROLE;

    -- A DefaultUser with no committee membership sees only themselves.
    IF v_rows > 1 THEN
        RAISE EXCEPTION 'T10 FAILED: directory returned % rows to a DefaultUser', v_rows;
    END IF;
END $$;

-- ── T11 (MED-10) — reading who uploaded what ───────────────────────────
DO $$
DECLARE v_rows int;
BEGIN
    INSERT INTO public.import_events (file_type, row_count, uploaded_by, uploaded_by_email)
    VALUES ('staff', 10, '22222222-2222-2222-2222-222222222222', 'victim@test.local');

    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    SELECT count(*) INTO v_rows FROM public.import_events;
    RESET ROLE;

    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'T11 FAILED: non-admin read % import_events row(s)', v_rows;
    END IF;
END $$;

-- ── T12 (HIGH-3) — reading the admin audit log ─────────────────────────
DO $$
DECLARE v_rows int;
BEGIN
    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id)
    VALUES ('ticket', gen_random_uuid(), 'created', '22222222-2222-2222-2222-222222222222');

    CALL pg_temp.become('11111111-1111-1111-1111-111111111111', 'lowpriv@test.local');
    SELECT count(*) INTO v_rows FROM public.audit_log;
    RESET ROLE;

    IF v_rows <> 0 THEN
        RAISE EXCEPTION 'T12 FAILED: non-admin read % audit_log row(s)', v_rows;
    END IF;
END $$;

-- ── T13 (MED-9 / A3b) — the duplicate-display-name cross-leak ──────────
-- Two staff share a display name. One is the PI of a project. The other
-- must not see it. Before 20260725000005 the policy compared
-- "PrincipalInvestigator" against caller_staff_name(), so both matched.
DO $$
DECLARE v_count int;
BEGIN
    INSERT INTO auth.users (id, email, aud, role)
    VALUES ('33333333-3333-3333-3333-333333333333', 'kumar.b@test.local',
            'authenticated', 'authenticated');

    INSERT INTO public.divisions ("divCode", "divName")
    VALUES ('TSTD', 'Test Division') ON CONFLICT DO NOTHING;

    -- Same "Name", different people, different logins.
    INSERT INTO public.staff ("ID", "Name", "Email", "Division", user_id) VALUES
      ('DUPA', 'R. Kumar', 'kumar.a@test.local', 'TSTD',
       '11111111-1111-1111-1111-111111111111'),
      ('DUPB', 'R. Kumar', 'kumar.b@test.local', 'TSTD',
       '33333333-3333-3333-3333-333333333333');

    -- Keyed to DUPA specifically. The sync_staff_key trigger leaves
    -- pi_staff_id NULL here (the name is ambiguous), so set it explicitly —
    -- that is exactly the state HR reconciliation produces.
    INSERT INTO public.projects ("ProjectNo", "ProjectName", "PrincipalInvestigator",
                                 "DivisionCode", pi_staff_id)
    VALUES ('T13-PRJ', 'Confidential budget', 'R. Kumar', 'TSTD', 'DUPA');

    CALL pg_temp.become('33333333-3333-3333-3333-333333333333', 'kumar.b@test.local');
    SELECT count(*) INTO v_count FROM public.projects WHERE "ProjectNo" = 'T13-PRJ';
    RESET ROLE;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'T13 FAILED: a name-twin read another staff member''s project';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL RLS NEGATIVE TESTS PASSED'; END $$;

ROLLBACK;
