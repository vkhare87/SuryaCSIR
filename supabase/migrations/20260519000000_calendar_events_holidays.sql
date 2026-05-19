-- Migration: calendar_events + holidays + meetings.teams_url/pamphlet_url
-- Date: 2026-05-19

-- ══════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════════

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

-- Extend meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS teams_url    text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS pamphlet_url text;

-- Extend audit_log.entity_type CHECK to allow new entity kinds
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
DO $$
BEGIN
    ALTER TABLE public.audit_log
        ADD CONSTRAINT audit_log_entity_type_check
        CHECK (entity_type IN (
            'committee','meeting','action_item','ticket','ticket_response',
            'calendar_event','holiday'
        ));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS calendar_events_date_idx ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS calendar_events_visibility_idx ON public.calendar_events(visibility);
CREATE INDEX IF NOT EXISTS calendar_events_created_by_idx ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS holidays_year_idx ON public.holidays(year);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays(holiday_date);

-- ══════════════════════════════════════════════════════════════════
-- 3. RLS
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays        ENABLE ROW LEVEL SECURITY;

-- Drop all policies before (re-)creating them (idempotent)
DROP POLICY IF EXISTS "calendar_events_select" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;
DROP POLICY IF EXISTS "holidays_select"         ON public.holidays;
DROP POLICY IF EXISTS "holidays_insert"         ON public.holidays;
DROP POLICY IF EXISTS "holidays_update"         ON public.holidays;
DROP POLICY IF EXISTS "holidays_delete"         ON public.holidays;

-- calendar_events SELECT
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

-- calendar_events INSERT: role-gated
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

-- calendar_events UPDATE: creator OR SystemAdmin/MasterAdmin
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

-- calendar_events DELETE: creator OR SystemAdmin/MasterAdmin
CREATE POLICY "calendar_events_delete" ON public.calendar_events FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR public.user_has_role('SystemAdmin')
    OR public.user_has_role('MasterAdmin')
);

-- holidays SELECT: all authenticated
CREATE POLICY "holidays_select" ON public.holidays FOR SELECT
TO authenticated USING (true);

-- holidays INSERT/UPDATE/DELETE: SystemAdmin or MasterAdmin only
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

-- ══════════════════════════════════════════════════════════════════
-- 4. updated_at trigger for calendar_events
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.calendar_events_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_updated_at_trg ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at_trg
    BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.calendar_events_set_updated_at();
