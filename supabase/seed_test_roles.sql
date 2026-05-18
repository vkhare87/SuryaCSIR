-- ─────────────────────────────────────────────────────────────────────────
-- seed_test_roles.sql — grant every SURYA role to a single test user
-- ─────────────────────────────────────────────────────────────────────────
--
-- Purpose
--   Attach all 14 roles to one auth user so the role switcher in the nav
--   can flip between Director / DivisionHead / HOD / Scientist / Technician /
--   HRAdmin / FinanceAdmin / SystemAdmin / MasterAdmin / Student /
--   ProjectStaff / Guest / DefaultUser / EmpoweredCommittee instantly.
--
-- How to apply
--   1. Edit the v_email below to point at the auth user you want to test
--      with. That user must already exist in auth.users (sign in once via
--      the SURYA login screen first, or invite via Supabase dashboard).
--   2. Edit the four division_code values if your tenant uses different
--      division codes than the AMPRI defaults (ARC, BMS, EEC, NST).
--   3. Paste the whole file into Supabase Dashboard → SQL Editor and run
--      it as the `postgres` role (bypasses RLS).
--
-- Idempotent
--   Re-running is safe; ON CONFLICT DO NOTHING / UPDATE clauses keep the
--   user_roles + user_profiles rows in their seeded state.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_email       text := 'vivek.khare@csir.res.in';   -- ← edit me
    v_user_id     uuid;
    v_div_dh      text := 'ARC';   -- DivisionHead's division
    v_div_hod     text := 'BMS';   -- HOD's division
    v_div_sci     text := 'EEC';   -- Scientist's division
    v_div_tech    text := 'NST';   -- Technician's division
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Auth user % not found. Sign in once via SURYA login first.', v_email;
    END IF;

    -- Grant every role to this user. ON CONFLICT preserves existing rows
    -- (so we don't overwrite a manually-set division_code or must_change_password).
    INSERT INTO public.user_roles (user_id, role, division_code, must_change_password) VALUES
        (v_user_id, 'Director',           NULL,        false),
        (v_user_id, 'DivisionHead',       v_div_dh,    false),
        (v_user_id, 'HOD',                v_div_hod,   false),
        (v_user_id, 'Scientist',          v_div_sci,   false),
        (v_user_id, 'Technician',         v_div_tech,  false),
        (v_user_id, 'HRAdmin',            NULL,        false),
        (v_user_id, 'FinanceAdmin',       NULL,        false),
        (v_user_id, 'SystemAdmin',        NULL,        false),
        (v_user_id, 'MasterAdmin',        NULL,        false),
        (v_user_id, 'Student',            NULL,        false),
        (v_user_id, 'ProjectStaff',       NULL,        false),
        (v_user_id, 'Guest',              NULL,        false),
        (v_user_id, 'DefaultUser',        NULL,        false),
        (v_user_id, 'EmpoweredCommittee', NULL,        false)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Ensure the profile exists and the password flag is cleared.
    INSERT INTO public.user_profiles (user_id, email, must_change_password)
    VALUES (v_user_id, v_email, false)
    ON CONFLICT (user_id) DO UPDATE
        SET must_change_password = false,
            email                = EXCLUDED.email;

    RAISE NOTICE 'Granted 14 roles to %', v_email;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Optional: link the StaffMember rows so role-scoped pages (DivisionHead
-- detail, Scientist self-report, etc.) point at real domain records.
-- These updates set divHoDID on the chosen divisions to a staff ID you can
-- map to the test user via the existing email column, so SURYA's scoping
-- logic (which compares user.id + division_code) lights up correctly.
-- Skip this block if you don't want to mutate the HR data.
-- ─────────────────────────────────────────────────────────────────────────
-- Example — promote the first staff member of each division to its HOD/HoD
-- so the DivisionHead screen has a recognised "you are head of X" record.
-- Uncomment if needed:
--
-- UPDATE public.divisions d
-- SET    "divHoDID" = (
--           SELECT "ID" FROM public.staff s
--           WHERE  s."Division" = d."divCode"
--           ORDER  BY s."ID"
--           LIMIT  1
--        )
-- WHERE  d."divCode" IN ('ARC', 'BMS', 'EEC', 'NST')
--   AND  d."divHoDID" IS NULL;
