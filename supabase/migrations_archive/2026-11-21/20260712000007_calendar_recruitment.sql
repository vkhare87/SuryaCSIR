-- ============================================================
-- Stage 07 / 08 — Calendar
-- Contains : calendar_events, holidays.
-- Depends  : 01 extensions_helpers, 02 auth_rbac
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================
-- Named "calendar_recruitment" for historical reasons — recruitment
-- (vacancy_advertisements/vacancy_posts) actually lives in stage 03
-- hr_core; this file only ever grew the calendar tables.

CREATE TABLE IF NOT EXISTS public.calendar_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text NOT NULL,
    event_date      date NOT NULL,
    event_kind      text NOT NULL CHECK (event_kind IN ('Custom','Pamphlet','Announcement')),
    location        text NOT NULL DEFAULT '',
    teams_url       text,
    pamphlet_url    text,
    description     text NOT NULL DEFAULT '',
    visibility      text NOT NULL DEFAULT 'OrgWide'
                    CHECK (visibility IN ('OrgWide','Division','Personal')),
    division_code   text,
    created_by      uuid NOT NULL REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calendar_events_division_required
        CHECK (visibility <> 'Division' OR division_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.holidays (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date    date NOT NULL,
    name            text NOT NULL,
    holiday_type    text NOT NULL DEFAULT 'Gazetted'
                    CHECK (holiday_type IN ('Gazetted','Restricted','Institute')),
    year            integer NOT NULL,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (holiday_date, name)
);

CREATE INDEX IF NOT EXISTS calendar_events_date_idx ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS calendar_events_visibility_idx ON public.calendar_events(visibility);
CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS holidays_year_idx ON public.holidays(year);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays(holiday_date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events_select" ON public.calendar_events FOR SELECT
TO authenticated
USING (
    visibility = 'OrgWide'
    OR (visibility = 'Personal' AND created_by = auth.uid())
    OR (
        visibility = 'Division'
        AND division_code IN (
            SELECT ur.division_code
            FROM public.user_roles ur
            JOIN public.user_profiles up
                ON up.user_id = ur.user_id AND up.active_role = ur.role
            WHERE ur.user_id = auth.uid()
        )
    )
);

CREATE POLICY "calendar_events_insert" ON public.calendar_events FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND (
        public.user_has_role('HRAdmin')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('Director')
        OR public.user_has_role('HOD')
        OR public.user_has_role('DivisionHead')
        OR public.user_has_role('MasterAdmin')
    )
);

CREATE POLICY "calendar_events_update" ON public.calendar_events FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
)
WITH CHECK (
    created_by = auth.uid()
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

CREATE POLICY "calendar_events_delete" ON public.calendar_events FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

CREATE POLICY "holidays_select" ON public.holidays FOR SELECT
TO authenticated USING (true);

CREATE POLICY "holidays_insert" ON public.holidays FOR INSERT
TO authenticated
WITH CHECK (
    public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

CREATE POLICY "holidays_update" ON public.holidays FOR UPDATE
TO authenticated
USING (
    public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
)
WITH CHECK (
    public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

CREATE POLICY "holidays_delete" ON public.holidays FOR DELETE
TO authenticated
USING (
    public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

CREATE OR REPLACE FUNCTION public.calendar_events_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_events_updated_at_trg
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.calendar_events_set_updated_at();
