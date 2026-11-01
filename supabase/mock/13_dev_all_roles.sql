\set ON_ERROR_STOP on
-- DEV ONLY (SEC-18). Refuses to run unless the session opts in, and the line
-- above stops psql at that refusal instead of running the rest of the file:
--   PGOPTIONS='-c surya.allow_mock=on' psql "<LOCAL db url>" -f <this file>
DO $$
BEGIN
    IF current_setting('surya.allow_mock', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'supabase/mock is dev-only: set surya.allow_mock=on, for a LOCAL database only';
    END IF;
END $$;

-- 20260521120000_dev_all_roles.sql
-- ⚠ DEV ONLY — grants every role to one user for role-switcher testing. Do NOT apply in production.
-- Grants all application roles to vivek.khare@csir.res.in for development
-- role-switching. Idempotent: safe to re-run. Resolves auth UUID by email.

DO $$
DECLARE
  v_user_id uuid;
  v_role    text;
  v_roles   text[] := ARRAY[
    'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
    'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin', 'Student',
    'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee'
  ];
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'vivek.khare@csir.res.in';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User vivek.khare@csir.res.in not found in auth.users — skipping role grant.';
    RETURN;
  END IF;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role, division_code)
    VALUES (v_user_id, v_role, NULL)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  UPDATE public.user_profiles
  SET active_role = 'SystemAdmin'
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'user_profiles row not found for %; active_role not set.', v_user_id;
  END IF;

  RAISE NOTICE 'Granted % roles to vivek.khare@csir.res.in', array_length(v_roles, 1);
END $$;
