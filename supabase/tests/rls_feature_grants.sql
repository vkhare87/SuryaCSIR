-- ═══════════════════════════════════════════════════════════════════════
-- rls_feature_grants.sql — feature_grants (20261020000003) policy tests.
--
-- A grant opens an extra page for one user, so writing one is a privilege
-- grant. Only MasterAdmin may write; a user reads only their own rows.
--
--   supabase db reset
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_feature_grants.sql
--
-- Runs in a rolled-back transaction. Do NOT run against production — it
-- creates auth.users rows before rolling them back.
-- Output: "ALL FEATURE GRANT TESTS PASSED" or an exception naming the failure.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'master@test.local', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'sci@test.local',    'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'other@test.local',  'authenticated', 'authenticated');

-- The auth trigger gives everyone DefaultUser; promote the fixtures directly
-- (we are the table owner here, RLS and the column REVOKEs do not apply).
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'MasterAdmin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Scientist'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Scientist');

INSERT INTO public.feature_grants (user_id, feature_key, granted_by)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', '/explore', 'aaaaaaaa-0000-0000-0000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.blocked(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE p_sql;
    RETURN false;
EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN
    RETURN true;
END;
$$;

CREATE OR REPLACE PROCEDURE pg_temp.become(p_user uuid, p_email text)
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL request.jwt.claims = %L',
        json_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text);
END;
$$;

-- ── G1 — a non-master cannot grant themselves a feature ────────────────
DO $$
DECLARE n int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002', 'sci@test.local');
    PERFORM pg_temp.blocked(
        'INSERT INTO public.feature_grants (user_id, feature_key, granted_by)
         VALUES (''aaaaaaaa-0000-0000-0000-000000000002'', ''/intelligence'',
                 ''aaaaaaaa-0000-0000-0000-000000000002'')');
    RESET ROLE;
    SELECT count(*) INTO n FROM public.feature_grants
     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000002';
    IF n <> 0 THEN RAISE EXCEPTION 'G1 FAILED: scientist self-granted % feature(s)', n; END IF;
END $$;

-- ── G2 — a user cannot see someone else's grants ───────────────────────
DO $$
DECLARE n int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002', 'sci@test.local');
    SELECT count(*) INTO n FROM public.feature_grants;
    RESET ROLE;
    IF n <> 0 THEN RAISE EXCEPTION 'G2 FAILED: scientist read % foreign grant(s)', n; END IF;
END $$;

-- ── G3 — a user cannot revoke a grant (theirs or anyone's) ─────────────
DO $$
DECLARE n int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'other@test.local');
    PERFORM pg_temp.blocked('DELETE FROM public.feature_grants');
    RESET ROLE;
    SELECT count(*) INTO n FROM public.feature_grants;
    IF n <> 1 THEN RAISE EXCEPTION 'G3 FAILED: non-master deleted a grant'; END IF;
END $$;

-- ── G4 — the grantee reads their own grant ─────────────────────────────
DO $$
DECLARE n int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003', 'other@test.local');
    SELECT count(*) INTO n FROM public.feature_grants;
    RESET ROLE;
    IF n <> 1 THEN RAISE EXCEPTION 'G4 FAILED: grantee sees % own grant(s), expected 1', n; END IF;
END $$;

-- ── G5 — MasterAdmin grants, but cannot forge granted_by ───────────────
DO $$
DECLARE n int;
BEGIN
    CALL pg_temp.become('aaaaaaaa-0000-0000-0000-000000000001', 'master@test.local');
    IF pg_temp.blocked(
        'INSERT INTO public.feature_grants (user_id, feature_key, granted_by)
         VALUES (''aaaaaaaa-0000-0000-0000-000000000002'', ''/intelligence'',
                 ''aaaaaaaa-0000-0000-0000-000000000001'')') THEN
        RAISE EXCEPTION 'G5 FAILED: MasterAdmin could not grant';
    END IF;
    PERFORM pg_temp.blocked(
        'INSERT INTO public.feature_grants (user_id, feature_key, granted_by)
         VALUES (''aaaaaaaa-0000-0000-0000-000000000002'', ''/explore'',
                 ''aaaaaaaa-0000-0000-0000-000000000003'')');
    RESET ROLE;
    SELECT count(*) INTO n FROM public.feature_grants
     WHERE granted_by = 'aaaaaaaa-0000-0000-0000-000000000003';
    IF n <> 0 THEN RAISE EXCEPTION 'G5 FAILED: granted_by forged'; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL FEATURE GRANT TESTS PASSED'; END $$;

ROLLBACK;
