-- =============================================================
-- Migration: schema fixes + vacancy_* live-schema sync
-- =============================================================
-- Bundles three corrections that surfaced during the 2026-05-16
-- SQL audit. Each is idempotent — safe to re-run.
--
-- 1. route_ticket() aliases the wrong table in its fallback
--    lookups (Step 3 and Step 4). Rebuilds the function with
--    correct aliases. See 20260507000000_committees_helpdesk.sql.
--
-- 2. committee-docs storage policies were created without a
--    pre-emptive DROP, so re-running the committees/helpdesk
--    migration on an existing project errors with "policy
--    already exists". Drop-and-recreate fixes the idempotency.
--
-- 3. vacancy_advertisements + vacancy_posts in the live Supabase
--    project diverged from 20260501000000_vacancy_tables.sql.
--    The live shape (advt_no, issue_date, post_code, designation
--    …) is authoritative — the migration file shipped an
--    earlier draft that was never deployed. This block reshapes
--    the migration-defined columns to match live.
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. route_ticket() — fix undefined alias in fallback lookups
-- ──────────────────────────────────────────────────────────────
-- Original used `SELECT up.user_id ... FROM public.user_roles ur`
-- with no `up` alias in scope. Failed silently when categories
-- had no helpdesk_routing override AND no DivisionHead resolved.
-- Rewrite uses ur.user_id::text consistently.
-- Priority chain unchanged: routing override → DivisionHead
-- of submitter → HRAdmin → SystemAdmin.

CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category     text,
    p_submitter_id text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_target_type text;
    v_target_id   text;
    v_result_id   text;
    v_div_code    text;
BEGIN
    -- Step 1: explicit override from helpdesk_routing
    SELECT target_type, target_id
      INTO v_target_type, v_target_id
      FROM public.helpdesk_routing
     WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            SELECT ur.user_id::text INTO v_result_id
              FROM public.user_roles ur
             WHERE ur.role = v_target_id
             LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            -- Resolve to the division's HoD as recorded on divisions
            SELECT d."divHoDID" INTO v_result_id
              FROM public.divisions d
             WHERE d."divCode" = v_target_id
             LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 2: submitter's DivisionHead via divisions.divHoDID
    SELECT sf."Division" INTO v_div_code
      FROM public.staff sf
     WHERE sf."ID" = p_submitter_id;

    IF v_div_code IS NOT NULL THEN
        SELECT d."divHoDID" INTO v_result_id
          FROM public.divisions d
         WHERE d."divCode" = v_div_code
         LIMIT 1;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 3: any HRAdmin
    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'HRAdmin'
     LIMIT 1;
    IF v_result_id IS NOT NULL THEN
        RETURN v_result_id;
    END IF;

    -- Step 4: last resort — any SystemAdmin
    SELECT ur.user_id::text INTO v_result_id
      FROM public.user_roles ur
     WHERE ur.role = 'SystemAdmin'
     LIMIT 1;
    RETURN v_result_id;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 2. storage.objects — make committee-docs policies idempotent
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "committee_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "committee_docs_insert" ON storage.objects;

CREATE POLICY "committee_docs_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'committee-docs');

CREATE POLICY "committee_docs_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'committee-docs'
        AND (public.user_has_role('Director')
             OR public.user_has_role('SystemAdmin')
             OR public.user_has_role('MasterAdmin'))
    );


-- ──────────────────────────────────────────────────────────────
-- 3. vacancy_advertisements — reshape to live schema
-- ──────────────────────────────────────────────────────────────
-- Live columns (verified via OpenAPI introspection, 2026-05-16):
--   id, advt_no, title, description, division_code,
--   issue_date, closing_date, status, created_by, created_at
-- Drop the columns that only existed on paper; add the live ones.
-- Status check constraint also widens to include 'Open'.

ALTER TABLE public.vacancy_advertisements
    DROP COLUMN IF EXISTS position,
    DROP COLUMN IF EXISTS group_level,
    DROP COLUMN IF EXISTS requirements,
    DROP COLUMN IF EXISTS applicant_count,
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS updated_at,
    ADD COLUMN IF NOT EXISTS advt_no   text,
    ADD COLUMN IF NOT EXISTS issue_date date,
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- closing_date in live is `date`; migration shipped timestamptz.
-- Cast only if column is currently timestamptz to avoid churn.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'vacancy_advertisements'
           AND column_name  = 'closing_date'
           AND data_type    = 'timestamp with time zone'
    ) THEN
        ALTER TABLE public.vacancy_advertisements
            ALTER COLUMN closing_date TYPE date USING closing_date::date;
    END IF;
END$$;

-- Widen status check: live uses 'Open' (not 'Published')
ALTER TABLE public.vacancy_advertisements
    DROP CONSTRAINT IF EXISTS vacancy_advertisements_status_check;
ALTER TABLE public.vacancy_advertisements
    ADD CONSTRAINT vacancy_advertisements_status_check
        CHECK (status IN ('Draft','Open','Published','Closed','Cancelled'));

-- updated_at trigger no longer applies (column dropped)
DROP TRIGGER IF EXISTS trg_vacancy_advertisements_updated_at
    ON public.vacancy_advertisements;


-- ──────────────────────────────────────────────────────────────
-- 4. vacancy_posts — reshape to live schema
-- ──────────────────────────────────────────────────────────────
-- Live columns:
--   id, advertisement_id, post_code, designation, discipline,
--   no_of_positions, pay_level, age_limit, qualifications,
--   status, created_at

-- Rename FK column if old name still present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'vacancy_posts'
           AND column_name  = 'vacancy_id'
    ) THEN
        ALTER TABLE public.vacancy_posts
            RENAME COLUMN vacancy_id TO advertisement_id;
    END IF;
END$$;

ALTER TABLE public.vacancy_posts
    DROP COLUMN IF EXISTS post_name,
    DROP COLUMN IF EXISTS reservations,
    DROP COLUMN IF EXISTS sanctioned_count,
    DROP COLUMN IF EXISTS filled_count,
    ADD COLUMN IF NOT EXISTS post_code       text,
    ADD COLUMN IF NOT EXISTS designation     text,
    ADD COLUMN IF NOT EXISTS discipline      text,
    ADD COLUMN IF NOT EXISTS no_of_positions integer,
    ADD COLUMN IF NOT EXISTS pay_level       text,
    ADD COLUMN IF NOT EXISTS age_limit       text,
    ADD COLUMN IF NOT EXISTS qualifications  text,
    ADD COLUMN IF NOT EXISTS status          text;

-- Status values seen in live: Open, Filled (no fixed check ATM)
ALTER TABLE public.vacancy_posts
    DROP CONSTRAINT IF EXISTS vacancy_posts_status_check;
ALTER TABLE public.vacancy_posts
    ADD CONSTRAINT vacancy_posts_status_check
        CHECK (status IS NULL OR status IN ('Open','Filled','Closed','Cancelled'));


-- ──────────────────────────────────────────────────────────────
-- 5. set_updated_at — neutral alias for pms_set_updated_at()
-- ──────────────────────────────────────────────────────────────
-- The original function is used by non-PMS tables (tickets,
-- vacancy_advertisements). Keep the PMS-named function for
-- back-compat; add a generic alias for new tables to reference.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
