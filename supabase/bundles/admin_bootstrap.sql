-- ════════════════════════════════════════════════════════════════════
-- SURYA — SystemAdmin Bootstrap
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER:
--   1. full_schema.sql has been applied
--   2. You have created an auth user via Supabase Dashboard:
--        Authentication → Users → Add user → email + password
--      Note the auth user UUID shown after creation.
--
-- Replace the placeholders below and run.
-- ════════════════════════════════════════════════════════════════════

-- Replace with the email you used in Auth → Users
\set admin_email '''vivek@surya.local'''

-- Replace with the auth user UUID from Auth → Users → click user → ID
\set admin_uid '''00000000-0000-0000-0000-000000000000'''

-- The auth.users INSERT trigger has already created:
--   - user_roles row with role = 'DefaultUser'
--   - user_profiles row with active_role = NULL
-- We add SystemAdmin + MasterAdmin and set active_role.

INSERT INTO public.user_roles (user_id, role)
VALUES
    (:admin_uid::uuid, 'SystemAdmin'),
    (:admin_uid::uuid, 'MasterAdmin')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.user_profiles
SET active_role = 'SystemAdmin', must_change_password = false
WHERE user_id = :admin_uid::uuid;

-- Verify
SELECT u.email, ur.role, up.active_role
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
JOIN public.user_profiles up ON up.user_id = u.id
WHERE u.id = :admin_uid::uuid;
