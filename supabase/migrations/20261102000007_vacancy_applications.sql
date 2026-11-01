-- ============================================================
-- 20261102000007_vacancy_applications
-- BUG-09: the Recruitment UI treated vacancy_posts (post definitions) as
-- candidate applications, so every funnel number was 0. Applications get
-- their own table (product decision 2026-11-01), with the
-- Received|Shortlisted|Interviewed|Selected|Rejected funnel the UI counts.
-- Applicant personal data: HR / System / Master admins only.
-- Tests: scripts/db/recruitment.db.test.ts.
-- ============================================================
BEGIN;

-- The FK columns copy the referenced id types: the repo baseline declares
-- them text, but the live project has uuid (drift from before the baseline).
DO $$
DECLARE
    v_adv_type  text;
    v_post_type text;
BEGIN
    SELECT format_type(atttypid, atttypmod) INTO v_adv_type
      FROM pg_attribute WHERE attrelid = 'public.vacancy_advertisements'::regclass AND attname = 'id';
    SELECT format_type(atttypid, atttypmod) INTO v_post_type
      FROM pg_attribute WHERE attrelid = 'public.vacancy_posts'::regclass AND attname = 'id';

    EXECUTE format($sql$
        CREATE TABLE IF NOT EXISTS public.vacancy_applications (
            id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            advertisement_id %s NOT NULL REFERENCES public.vacancy_advertisements(id) ON DELETE CASCADE,
            post_id          %s REFERENCES public.vacancy_posts(id) ON DELETE SET NULL,
            candidate_name   text NOT NULL,
            email            text,
            phone            text,
            qualifications   text,
            experience       text,
            applied_on       date NOT NULL DEFAULT current_date,
            status           text NOT NULL DEFAULT 'Received'
                             CHECK (status IN ('Received','Shortlisted','Interviewed','Selected','Rejected')),
            notes            text,
            created_at       timestamptz NOT NULL DEFAULT now()
        )$sql$, v_adv_type, v_post_type);
END $$;

CREATE INDEX IF NOT EXISTS vacancy_applications_advertisement_idx ON public.vacancy_applications (advertisement_id);
CREATE INDEX IF NOT EXISTS vacancy_applications_post_idx          ON public.vacancy_applications (post_id);

ALTER TABLE public.vacancy_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacancy_applications_admin" ON public.vacancy_applications
    FOR ALL TO authenticated
    USING (public.caller_is_admin())
    WITH CHECK (public.caller_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vacancy_applications TO authenticated;
GRANT ALL ON public.vacancy_applications TO service_role;

COMMIT;
