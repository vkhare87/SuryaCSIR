-- Migration: vacancy_advertisements + vacancy_posts
-- Two tables for recruitment vacancy management.

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vacancy_advertisements (
    id              text PRIMARY KEY,
    title           text NOT NULL,
    position        text NOT NULL,
    group_level     text,
    division_code   text REFERENCES public.divisions("divCode"),
    status          text NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Published','Closed','Cancelled')),
    description     text,
    requirements    text,
    applicant_count integer DEFAULT 0,
    published_at    timestamptz,
    closing_date    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vacancy_posts (
    id               text PRIMARY KEY,
    vacancy_id       text NOT NULL REFERENCES public.vacancy_advertisements(id) ON DELETE CASCADE,
    post_name        text NOT NULL,
    reservations     jsonb DEFAULT '{}',
    sanctioned_count integer DEFAULT 1,
    filled_count     integer DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vacancy_advertisements_status_idx
    ON public.vacancy_advertisements(status);

CREATE INDEX IF NOT EXISTS vacancy_posts_vacancy_id_idx
    ON public.vacancy_posts(vacancy_id);

-- ──────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_vacancy_advertisements_updated_at
    BEFORE UPDATE ON public.vacancy_advertisements
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.vacancy_advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_posts          ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read
CREATE POLICY "vacancy_advertisements_select"
    ON public.vacancy_advertisements FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "vacancy_posts_select"
    ON public.vacancy_posts FOR SELECT TO authenticated
    USING (true);

-- WRITE: HRAdmin, SystemAdmin, MasterAdmin
CREATE POLICY "vacancy_advertisements_write"
    ON public.vacancy_advertisements FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "vacancy_posts_write"
    ON public.vacancy_posts FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
