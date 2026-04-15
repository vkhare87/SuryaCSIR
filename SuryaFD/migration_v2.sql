-- migration_v2.sql
-- SURYA — Run once in Supabase SQL Editor (postgres role, bypasses RLS)
-- Safe to run twice: uses IF NOT EXISTS / ON CONFLICT / DO UPDATE patterns
-- ============================================================

-- ============================================================
-- STEP 1: Expand user_roles role CHECK to include MasterAdmin
-- ============================================================
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN (
    'Director', 'DivisionHead', 'Scientist', 'Technician',
    'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin'
  ));

-- ============================================================
-- STEP 2: Add must_change_password flag to user_roles
-- ============================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- ============================================================
-- STEP 3: Add DivisionCode to project_staff
-- ============================================================
ALTER TABLE public.project_staff
  ADD COLUMN IF NOT EXISTS "DivisionCode" text;

-- ============================================================
-- STEP 4: Add DivisionCode to phd_students
-- ============================================================
ALTER TABLE public.phd_students
  ADD COLUMN IF NOT EXISTS "DivisionCode" text;

-- ============================================================
-- STEP 5: Create contract_staff table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contract_staff (
    "id"                text PRIMARY KEY,
    "Name"              text,
    "Designation"       text,
    "Division"          text,
    "DateOfJoining"     text,
    "ContractEndDate"   text,
    "LabCode"           text,
    "DateOfBirth"       text,
    "AttachedToStaffID" text
);

ALTER TABLE public.contract_staff ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_staff'
    AND policyname = 'Authenticated users can read contract_staff'
  ) THEN
    CREATE POLICY "Authenticated users can read contract_staff"
      ON public.contract_staff FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_staff'
    AND policyname = 'HRAdmin and MasterAdmin can write contract_staff'
  ) THEN
    CREATE POLICY "HRAdmin and MasterAdmin can write contract_staff"
      ON public.contract_staff FOR ALL TO authenticated
      USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin', 'MasterAdmin')
      )
      WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin', 'MasterAdmin')
      );
  END IF;
END $$;

-- ============================================================
-- STEP 6: Reset all passwords to CSIR-AMPRI + force change
-- ============================================================
UPDATE auth.users
SET encrypted_password = crypt('CSIR-AMPRI', gen_salt('bf')),
    updated_at = NOW();

UPDATE public.user_roles
SET must_change_password = true;

-- ============================================================
-- STEP 7: Fix vivek.khare@csir.res.in → MasterAdmin
-- (safe: no-op if user doesn't exist in auth.users)
-- ============================================================
INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
SELECT id, 'MasterAdmin', NULL, true
FROM auth.users
WHERE email = 'vivek.khare@csir.res.in'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'MasterAdmin',
      must_change_password = true;

RAISE NOTICE 'migration_v2.sql completed successfully';
