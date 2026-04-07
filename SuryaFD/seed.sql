-- seed.sql — First SystemAdmin Bootstrap Script for SURYA
-- ============================================================
-- INSTRUCTIONS FOR DEPLOYER
-- ============================================================
-- 1. Run supabase_schema.sql first to create all tables including user_roles
-- 2. Replace the three placeholder values below with real values
-- 3. Run this script in the Supabase SQL Editor (runs as postgres, bypasses RLS)
--    OR via psql with a direct connection string
-- 4. After running successfully, DELETE or ARCHIVE this file —
--    it contains a plaintext password and must not remain in the repo.
-- ============================================================
-- pgcrypto extension must be enabled (enabled by default on Supabase hosted projects)
-- ============================================================

DO $$
DECLARE
  v_email        TEXT := 'REPLACE_WITH_ADMIN_EMAIL';       -- e.g., 'admin@ampri.res.in'
  v_password     TEXT := 'REPLACE_WITH_INITIAL_PASSWORD';  -- e.g., 'ChangeMe!2026#SURYA'
  v_display_name TEXT := 'REPLACE_WITH_DISPLAY_NAME';      -- e.g., 'System Administrator'
  v_user_id      UUID := gen_random_uuid();
  v_encrypted_pw TEXT;
BEGIN

  -- Guard: prevent accidental execution with template placeholder values
  IF v_email LIKE 'REPLACE_%' OR v_password LIKE 'REPLACE_%' OR v_display_name LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION
      'seed.sql: Replace ALL placeholder values (REPLACE_WITH_*) before running this script.';
  END IF;

  -- Hash the password using bcrypt (required by Supabase Auth)
  v_encrypted_pw := crypt(v_password, gen_salt('bf'));

  -- Step 1: Insert the auth user
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', v_display_name),
    NOW(),
    NOW()
  );

  -- Step 2: Insert the identity row (required — without this the user cannot sign in)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- Step 3: Assign SystemAdmin role in user_roles
  INSERT INTO public.user_roles (user_id, role, division_code)
  VALUES (v_user_id, 'SystemAdmin', NULL);

  RAISE NOTICE 'SystemAdmin created successfully: % (id: %)', v_email, v_user_id;

END $$;
