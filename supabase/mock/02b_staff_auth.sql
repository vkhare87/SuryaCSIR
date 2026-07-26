-- ═══════════════════════════════════════════════════════════════════════
-- 02b_staff_auth — LOCAL DEV ONLY. NEVER APPLY TO PROD.
--
-- Gives every mock staff row a real auth account and links it via
-- staff.user_id. Runs straight after 02_staff.sql (lexicographic order puts
-- "02_" before "02b" before "03_"), because everything downstream now keys
-- actors to auth.users rather than to staff."ID".
--
-- Why this file exists
-- --------------------
-- Before 20260725000002/000004 the mock data could reference staff."ID"
-- strings directly — tickets.submitted_by was `text` with no constraint. It
-- is now `uuid REFERENCES auth.users(id)`, so a fixture that writes 'S001'
-- is simply rejected. That was the right change (an unconstrained actor
-- column is how a handler got locked out of their own ticket queue), but it
-- means mock staff need logins to be usable as actors.
--
-- It also makes the fixture more useful than it was: you can now sign in AS
-- any of the 18 staff and see their own scoped view, which is the only way
-- to exercise the RLS added in 20260718000001 and 20260725000005 by hand.
--
-- All passwords: Test@1234 (same convention as 17_test_auth_users.sql).
-- Roles are derived from the staff band encoded in the ID:
--   S### → Scientist   T### → Technician   H### → HRAdmin
-- Division comes from the staff row, so division-scoped reads work.
--
-- Idempotent: existing accounts are reused, never duplicated.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    s      record;
    v_id   uuid;
    v_role text;
BEGIN
    FOR s IN
        SELECT "ID", "Email", "Division", "Name"
          FROM public.staff
         WHERE "Email" IS NOT NULL AND length(trim("Email")) > 0
         ORDER BY "ID"
    LOOP
        v_role := CASE left(s."ID", 1)
                      WHEN 'S' THEN 'Scientist'
                      WHEN 'T' THEN 'Technician'
                      WHEN 'H' THEN 'HRAdmin'
                      ELSE 'DefaultUser'
                  END;

        SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(s."Email");

        IF v_id IS NULL THEN
            v_id := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at, confirmation_token, recovery_token,
                email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_id,
                'authenticated', 'authenticated', lower(s."Email"),
                crypt('Test@1234', gen_salt('bf')),
                now(), '{"provider":"email","providers":["email"]}',
                jsonb_build_object('full_name', s."Name"),
                now(), now(), '', '', '', ''
            );
            INSERT INTO auth.identities (
                id, user_id, provider_id, identity_data, provider,
                created_at, updated_at, last_sign_in_at
            ) VALUES (
                gen_random_uuid(), v_id, v_id::text,
                jsonb_build_object('sub', v_id::text, 'email', lower(s."Email")),
                'email', now(), now(), now()
            );
        END IF;

        -- Replace the trigger-created DefaultUser row with the real band role.
        DELETE FROM public.user_roles WHERE user_id = v_id;
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_id, v_role, s."Division", false)
        ON CONFLICT (user_id, role) DO UPDATE
            SET division_code = EXCLUDED.division_code,
                must_change_password = false;

        INSERT INTO public.user_profiles (user_id, email, active_role, must_change_password)
        VALUES (v_id, lower(s."Email"), v_role, false)
        ON CONFLICT (user_id) DO UPDATE
            SET active_role = EXCLUDED.active_role,
                email = EXCLUDED.email,
                must_change_password = false;

        -- The link 20260725000002 backfills for real deployments. Set it
        -- explicitly here so the fixture does not depend on that migration
        -- having already run against this data.
        UPDATE public.staff SET user_id = v_id WHERE "ID" = s."ID";
    END LOOP;
END $$;

-- Fail loudly rather than leaving later fixtures to break with an FK error.
DO $$
DECLARE v_unlinked int;
BEGIN
    SELECT count(*) INTO v_unlinked
      FROM public.staff
     WHERE user_id IS NULL
       AND "Email" IS NOT NULL AND length(trim("Email")) > 0;

    IF v_unlinked > 0 THEN
        RAISE EXCEPTION '% staff row(s) still have no auth link — 10_helpdesk_tickets.sql will fail on the actor FKs', v_unlinked;
    END IF;
    RAISE NOTICE 'staff auth links ready: % account(s)',
        (SELECT count(*) FROM public.staff WHERE user_id IS NOT NULL);
END $$;
