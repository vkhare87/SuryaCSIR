-- ═══════════════════════════════════════════════════════════════════════
-- rls_awp.sql — Annual Work Plan (pms_awps) access rules and workflow RPCs.
-- Migration under test: 20261021000002_pms_awp.sql
--
--   supabase db reset
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_awp.sql
--
-- One transaction, rolled back. Creates auth.users rows — scratch/staging
-- databases only, never production.
-- Output: "ALL RLS AWP TESTS PASSED" or an exception naming the failure.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fixtures ───────────────────────────────────────────────────────────
-- a1 scientist A · b1 scientist B · r1 Reporting Officer of B · d1 Director
-- h1 HR admin · e1 evaluator on B's report · x1 stranger
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local', 'authenticated', 'authenticated'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'b1@test.local', 'authenticated', 'authenticated'),
  ('c1c1c1c1-0000-0000-0000-000000000001', 'r1@test.local', 'authenticated', 'authenticated'),
  ('d1d1d1d1-0000-0000-0000-000000000001', 'd1@test.local', 'authenticated', 'authenticated'),
  ('e1e1e1e1-0000-0000-0000-000000000001', 'h1@test.local', 'authenticated', 'authenticated'),
  ('f1f1f1f1-0000-0000-0000-000000000001', 'e1@test.local', 'authenticated', 'authenticated'),
  ('f2f2f2f2-0000-0000-0000-000000000001', 'x1@test.local', 'authenticated', 'authenticated');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'Director'),
  ('e1e1e1e1-0000-0000-0000-000000000001', 'HRAdmin');

INSERT INTO public.staff ("ID", "Name", "Designation", "Division", "ReportingID", "Email", user_id) VALUES
  ('T-D1', 'Test Director',  'Director',          'DIR', NULL,   'd1@test.local', 'd1d1d1d1-0000-0000-0000-000000000001'),
  ('T-R1', 'Test RO',        'Chief Scientist',   'IMD', 'T-D1', 'r1@test.local', 'c1c1c1c1-0000-0000-0000-000000000001'),
  ('T-A1', 'Test Sci A',     'Senior Scientist',  'IMD', 'T-R1', 'a1@test.local', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('T-B1', 'Test Sci B',     'Senior Scientist',  'IMD', 'T-R1', 'b1@test.local', 'b1b1b1b1-0000-0000-0000-000000000001'),
  ('T-C1', 'Test Sci C',     'Principal Scientist','DIR','T-D1', NULL,            NULL);

-- B has a report under evaluation by e1 (for T8).
INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
VALUES ('99999999-0000-0000-0000-000000000001', 'Test 2026-27', '2026-04-01', '2027-03-31', 'OPEN');
INSERT INTO public.pms_reports (id, cycle_id, scientist_id, status)
VALUES ('99999999-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001',
        'b1b1b1b1-0000-0000-0000-000000000001', 'UNDER_EVALUATION_COMMITTEE_REVIEW');
INSERT INTO public.pms_evaluations (report_id, evaluator_id)
VALUES ('99999999-0000-0000-0000-000000000002', 'f1f1f1f1-0000-0000-0000-000000000001');

CREATE OR REPLACE PROCEDURE pg_temp.become(p_user uuid, p_email text)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL request.jwt.claims = %L',
        json_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text);
END;
$$;

-- Part V payload with the activity split summing to p_total.
CREATE OR REPLACE FUNCTION pg_temp.payload(p_total int) RETURNS jsonb LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'partA', '{}'::jsonb,
        'activitySplit', jsonb_build_array(
            jsonb_build_object('label', 'R&D — Fundamental Research', 'role', 'x', 'timePct', p_total - 10),
            jsonb_build_object('label', 'Any other', 'role', 'y', 'timePct', 10)),
        'projects', '[]'::jsonb, 'objectives', '{}'::jsonb, 'development', '{}'::jsonb,
        'institutionalWork', '', 'other', '');
$$;

-- Drafts for A and B, created by their owners.
DO $$ BEGIN
    CALL pg_temp.become('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local');
    PERFORM public.pms_awp_save_draft('T-A1', '2026-27', pg_temp.payload(100));
    RESET ROLE;
    CALL pg_temp.become('b1b1b1b1-0000-0000-0000-000000000001', 'b1@test.local');
    PERFORM public.pms_awp_save_draft('T-B1', '2026-27', pg_temp.payload(100));
    RESET ROLE;
END $$;

-- ── T1 — scientist A cannot read B's AWP ───────────────────────────────
DO $$ DECLARE n int; BEGIN
    CALL pg_temp.become('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local');
    SELECT count(*) INTO n FROM public.pms_awps WHERE staff_id = 'T-B1';
    RESET ROLE;
    IF n <> 0 THEN RAISE EXCEPTION 'T1 FAILED: scientist read another scientist''s AWP'; END IF;
END $$;

-- ── T2 — owner cannot patch status directly ────────────────────────────
DO $$ DECLARE v text; BEGIN
    CALL pg_temp.become('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local');
    BEGIN
        UPDATE public.pms_awps SET status = 'APPROVED' WHERE staff_id = 'T-A1';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    SELECT status INTO v FROM public.pms_awps WHERE staff_id = 'T-A1';
    IF v <> 'DRAFT' THEN RAISE EXCEPTION 'T2 FAILED: owner set status to %', v; END IF;
END $$;

-- ── T4 — submit needs a 100% activity total ────────────────────────────
DO $$ DECLARE v_id uuid; BEGIN
    CALL pg_temp.become('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local');
    v_id := public.pms_awp_save_draft('T-A1', '2026-27', pg_temp.payload(90));
    BEGIN
        PERFORM public.pms_awp_submit(v_id);
        RAISE EXCEPTION 'T4 FAILED: submit accepted a 90%% total';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'Time committed must total 100%%' THEN RAISE; END IF;
    END;
    RESET ROLE;
END $$;

-- ── T3 — only B's RO can review B's AWP ────────────────────────────────
DO $$ DECLARE v_id uuid; v text; BEGIN
    SELECT id INTO v_id FROM public.pms_awps WHERE staff_id = 'T-B1';
    CALL pg_temp.become('b1b1b1b1-0000-0000-0000-000000000001', 'b1@test.local');
    PERFORM public.pms_awp_submit(v_id);
    RESET ROLE;

    CALL pg_temp.become('f2f2f2f2-0000-0000-0000-000000000001', 'x1@test.local');
    BEGIN
        PERFORM public.pms_awp_ro_review(v_id, 'REASONABLE', NULL);
        RAISE EXCEPTION 'T3 FAILED: stranger reviewed as RO';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Not the Reporting Officer' THEN RAISE; END IF;
    END;
    RESET ROLE;

    CALL pg_temp.become('c1c1c1c1-0000-0000-0000-000000000001', 'r1@test.local');
    PERFORM public.pms_awp_ro_review(v_id, 'REASONABLE', NULL);
    RESET ROLE;
    SELECT status INTO v FROM public.pms_awps WHERE id = v_id;
    -- Reviewing Officer defaults to the Director → straight to WITH_DIRECTOR (R6)
    IF v <> 'WITH_DIRECTOR' THEN RAISE EXCEPTION 'T3 FAILED: status after RO review is %', v; END IF;
END $$;

-- ── T5 — RO is the Director → submit lands in WITH_DIRECTOR ────────────
DO $$ DECLARE v_id uuid; v text; BEGIN
    CALL pg_temp.become('e1e1e1e1-0000-0000-0000-000000000001', 'h1@test.local');
    v_id := public.pms_awp_import('T-C1', '2026-27', pg_temp.payload(100), 'WITH_RO', NULL, NULL, NULL, NULL);
    RESET ROLE;
    SELECT status INTO v FROM public.pms_awps WHERE id = v_id;
    IF v <> 'WITH_DIRECTOR' THEN RAISE EXCEPTION 'T5 FAILED: RO=Director AWP is %', v; END IF;
END $$;

-- ── T6 — duplicate import rejected ─────────────────────────────────────
DO $$ BEGIN
    CALL pg_temp.become('e1e1e1e1-0000-0000-0000-000000000001', 'h1@test.local');
    BEGIN
        PERFORM public.pms_awp_import('T-C1', '2026-27', pg_temp.payload(100), 'APPROVED', NULL, NULL, NULL, NULL);
        RAISE EXCEPTION 'T6 FAILED: duplicate import accepted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'AWP already exists for this scientist and year' THEN RAISE; END IF;
    END;
    RESET ROLE;
END $$;

-- ── T7 — revision window closed ────────────────────────────────────────
DO $$ DECLARE v_id uuid; BEGIN
    CALL pg_temp.become('e1e1e1e1-0000-0000-0000-000000000001', 'h1@test.local');
    v_id := public.pms_awp_import('T-A1', '2020-21', pg_temp.payload(100), 'APPROVED', NULL, NULL, NULL, '2020-06-01');
    RESET ROLE;
    CALL pg_temp.become('a1a1a1a1-0000-0000-0000-000000000001', 'a1@test.local');
    BEGIN
        PERFORM public.pms_awp_request_revision(v_id, 'Project closed early, re-plan the work', pg_temp.payload(100));
        RAISE EXCEPTION 'T7 FAILED: revision accepted after 30 Sep';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'Revision window (first six months) has closed' THEN RAISE; END IF;
    END;
    RESET ROLE;
END $$;

-- ── T8 — evaluator on B's report gets B's AWP through the redacting RPC,
--         and cannot read the raw table ──────────────────────────────────
DO $$ DECLARE n int; m int; BEGIN
    CALL pg_temp.become('f1f1f1f1-0000-0000-0000-000000000001', 'e1@test.local');
    SELECT count(*) INTO n FROM public.pms_awp_for_report('99999999-0000-0000-0000-000000000002');
    SELECT count(*) INTO m FROM public.pms_awps WHERE staff_id = 'T-B1';
    RESET ROLE;
    IF n <> 1 THEN RAISE EXCEPTION 'T8 FAILED: evaluator got % AWP rows for B''s report', n; END IF;
    IF m <> 0 THEN RAISE EXCEPTION 'T8 FAILED: evaluator read % raw AWP rows', m; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL RLS AWP TESTS PASSED'; END $$;

ROLLBACK;
