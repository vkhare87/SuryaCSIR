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

-- ═══════════════════════════════════════════════════════════════════════
-- 17_test_auth_users — LOCAL DEV ONLY. NEVER APPLY TO PROD.
-- Password-login QA accounts for every role tier the UX drive needs.
-- All passwords: Test@1234
-- Runs after schema + trigger (auto-creates DefaultUser rows we replace).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    t record;
    v_id uuid;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('director@test.local',  'Director',           NULL),
        ('hod@test.local',       'HOD',                'ARC'),
        ('scientist@test.local', 'Scientist',          'ARC'),
        ('hradmin@test.local',   'HRAdmin',            NULL),
        ('master@test.local',    'MasterAdmin',        NULL),
        ('committee@test.local', 'EmpoweredCommittee', NULL)
    ) AS x(email, app_role, div)
    LOOP
        SELECT id INTO v_id FROM auth.users WHERE email = t.email;
        IF v_id IS NULL THEN
            v_id := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, confirmation_token, recovery_token,
                email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_id,
                'authenticated', 'authenticated', t.email,
                crypt('Test@1234', gen_salt('bf')),
                now(), '{"provider":"email","providers":["email"]}', '{}',
                now(), now(), '', '', '', ''
            );
            INSERT INTO auth.identities (
                id, user_id, provider_id, identity_data, provider,
                created_at, updated_at, last_sign_in_at
            ) VALUES (
                gen_random_uuid(), v_id, v_id::text,
                jsonb_build_object('sub', v_id::text, 'email', t.email),
                'email', now(), now(), now()
            );
        END IF;

        -- Replace the trigger-created DefaultUser role with the real one.
        DELETE FROM public.user_roles WHERE user_id = v_id;
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_id, t.app_role, t.div, false)
        ON CONFLICT (user_id, role) DO UPDATE
            SET division_code = EXCLUDED.division_code,
                must_change_password = false;

        INSERT INTO public.user_profiles (user_id, email, active_role, must_change_password)
        VALUES (v_id, t.email, t.app_role, false)
        ON CONFLICT (user_id) DO UPDATE
            SET active_role = EXCLUDED.active_role,
                email = EXCLUDED.email,
                must_change_password = false;
    END LOOP;
END $$;
