-- ════════════════════════════════════════════════════════════════════
-- SURYA — SystemAdmin Bootstrap
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER:
--   1. full_schema.sql has been applied
--   2. You created an auth user via Supabase Dashboard:
--        Authentication → Users → Add user → email + password
--      Note the auth user UUID shown after creation.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │ EDIT THESE TWO VALUES BEFORE RUNNING                            │
-- ├─────────────────────────────────────────────────────────────────┤
-- │ admin_uid   = the UUID from Auth → Users → click user → ID      │
-- │ admin_email = the email you used at signup                      │
-- └─────────────────────────────────────────────────────────────────┘
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    admin_uid   uuid := '00000000-0000-0000-0000-000000000000';  -- ← REPLACE
    admin_email text := 'vivek.khare@csir.res.in';               -- ← REPLACE
BEGIN
    -- The on_auth_user_created trigger already inserted a DefaultUser
    -- role row and a user_profiles row when the auth user was created.
    -- Grant SystemAdmin + MasterAdmin and flip the active role.

    INSERT INTO public.user_roles (user_id, role)
    VALUES
        (admin_uid, 'SystemAdmin'),
        (admin_uid, 'MasterAdmin')
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.user_profiles
    SET active_role = 'SystemAdmin',
        must_change_password = false
    WHERE user_id = admin_uid;

    RAISE NOTICE 'Bootstrapped % (% ) as SystemAdmin + MasterAdmin', admin_email, admin_uid;
END
$$;

-- Verify
SELECT u.email, ur.role, up.active_role
FROM auth.users u
JOIN public.user_roles ur     ON ur.user_id = u.id
JOIN public.user_profiles up  ON up.user_id = u.id
WHERE u.id = (
    -- Replace this uuid with the same admin_uid you used above
    '00000000-0000-0000-0000-000000000000'::uuid
);
