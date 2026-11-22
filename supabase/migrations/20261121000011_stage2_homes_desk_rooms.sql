-- ============================================================
-- Stage 11 / Stage 2 — Role Homes, Common Desk Phase A & CM1 Scheduling/Rooms
-- Contains : caller_division_codes(), division_rollup() (HH1 / DH1)
--            my_report_timers() (SH2)
--            project_staff_persons.user_id + my_engagement() (PJ1)
--            equipment_in_charge (TS1)
--            calendar_events.starts_at/ends_at, calendar_tokens, request_norms,
--            request_catalog, tickets.request_key/is_confidential/against_user_id,
--            my_day(), my_requests() (CD1–CD3)
--            rooms (with kind: room/vehicle/guest house), module_desks,
--            room_bookings (with advisory lock clash guard), hospitality_requests,
--            meeting_schedule(), meeting_postpone(), room_book() (CM1)
-- Depends  : Stages 01–10 (20261121000001–20261121000010)
-- ============================================================

-- ── 1. HH1 / DH1: Division helpers ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caller_division_codes()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT coalesce(array_agg(DISTINCT code ORDER BY code), ARRAY[]::text[])
      FROM (
          SELECT ur.division_code AS code
            FROM public.user_roles ur
           WHERE ur.user_id = (SELECT auth.uid())
             AND ur.role IN ('HOD', 'DivisionHead')
             AND ur.division_code IS NOT NULL
          UNION
          SELECT aa.division_code AS code
            FROM public.acting_assignments aa
           WHERE aa.acting_user_id = (SELECT auth.uid())
             AND aa.role IN ('HOD', 'DivisionHead')
             AND aa.division_code IS NOT NULL
             AND public.ist_today() BETWEEN aa.from_on AND aa.to_on
      ) d;
$$;

CREATE OR REPLACE FUNCTION public.division_rollup()
 RETURNS TABLE(
     div_code text,
     div_name text,
     staff_count bigint,
     active_projects bigint,
     late_projects bigint,
     vacant_posts bigint
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT d."divCode",
           d."divName",
           (SELECT count(*) FROM public.staff s WHERE s."Division" = d."divCode") AS staff_count,
           (SELECT count(*) FROM public.projects p WHERE p."DivisionCode" = d."divCode" AND p."ProjectStatus" = 'Active') AS active_projects,
           (SELECT count(*) FROM public.projects p
             WHERE p."DivisionCode" = d."divCode"
               AND p."ProjectStatus" = 'Active'
               AND p.end_date IS NOT NULL
               AND p.end_date < public.ist_today()) AS late_projects,
           (SELECT count(*) FROM public.sanctioned_posts sp
             WHERE sp.division_code = d."divCode"
               AND sp.state IN ('VACANT', 'ADVERTISED')) AS vacant_posts
      FROM public.divisions d
     ORDER BY d."divCode";
$$;

-- ── 2. SH2: Scientist / role report timers ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_report_timers()
 RETURNS TABLE(
     kind text,
     subject text,
     due_date date,
     state text,
     draft_ready boolean,
     lines_left integer,
     link text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH me AS (
        SELECT (SELECT auth.uid()) AS uid,
               public.caller_staff_id() AS sid,
               public.ist_today() AS today
    )
    SELECT 'PROGRESS_REPORT'::text AS kind,
           coalesce(p."ProjectNo", p."ProjectID") || ' · ' || coalesce(s.period_label, to_char(s.period_end, 'YYYY-MM-DD')) AS subject,
           s.due_date,
           s.status AS state,
           (s.report_id IS NOT NULL) AS draft_ready,
           CASE WHEN s.report_id IS NULL THEN 3 ELSE 1 END AS lines_left,
           '/reports/new?project=' || p."ProjectID" AS link
      FROM me
      JOIN public.project_review_slots s ON s.kind = 'PROGRESS_REPORT' AND s.status = 'PENDING'
      JOIN public.projects p ON p."ProjectID" = s.project_id
     WHERE s.due_date IS NOT NULL
       AND (
           (me.sid IS NOT NULL AND p.pi_staff_id = me.sid)
           OR EXISTS (
               SELECT 1 FROM public.project_staff ps
                WHERE ps."ProjectNo" = p."ProjectNo" AND me.sid IS NOT NULL AND ps.staff_id = me.sid
           )
       )
    UNION ALL
    SELECT 'PMS_APPRAISAL'::text AS kind,
           'Self-appraisal ' || ac.name AS subject,
           ac.end_date AS due_date,
           coalesce(r.status, 'NOT_STARTED') AS state,
           (r.id IS NOT NULL) AS draft_ready,
           CASE WHEN r.id IS NULL THEN 5 WHEN r.status = 'DRAFT' THEN 2 ELSE 0 END AS lines_left,
           CASE WHEN r.id IS NULL THEN '/pms/reports/new' ELSE '/pms/reports/' || r.id || '/edit' END AS link
      FROM me
      JOIN public.appraisal_cycles ac ON ac.status = 'OPEN'
      LEFT JOIN public.pms_reports r ON r.cycle_id = ac.id AND r.scientist_id = me.uid
     WHERE r.id IS NULL OR r.status IN ('DRAFT', 'RETURNED')
    UNION ALL
    SELECT 'AWP'::text AS kind,
           'Annual Work Plan ' || a.reporting_year AS subject,
           (split_part(a.reporting_year, '-', 1)::int || '-05-15')::date AS due_date,
           a.status AS state,
           true AS draft_ready,
           CASE WHEN a.status = 'DRAFT' THEN 2 ELSE 0 END AS lines_left,
           '/pms/awp' AS link
      FROM me
      JOIN public.pms_awps a ON (a.scientist_user_id = me.uid OR (me.sid IS NOT NULL AND a.staff_id = me.sid))
     WHERE a.status IN ('DRAFT', 'RETURNED')
    UNION ALL
    SELECT 'COMPLETION_REPORT'::text AS kind,
           coalesce(p."ProjectNo", p."ProjectID") || ' · Completion report' AS subject,
           coalesce(p.end_date, me.today + 30) AS due_date,
           cr.status AS state,
           true AS draft_ready,
           CASE WHEN cr.status = 'DRAFT' THEN 2 ELSE 1 END AS lines_left,
           '/projects/' || p."ProjectID" || '?tab=closure' AS link
      FROM me
      JOIN public.project_completion_reports cr ON cr.status IN ('DRAFT', 'RETURNED')
      JOIN public.projects p ON p."ProjectID" = cr.project_id
     WHERE me.sid IS NOT NULL AND p.pi_staff_id = me.sid
    ORDER BY due_date ASC NULLS LAST;
$$;

-- ── 3. PJ1 & TS1: Project Staff engagement + Equipment in charge ─────────────

ALTER TABLE public.project_staff_persons
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_staff_persons_user_idx
    ON public.project_staff_persons (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_staff_person_is_self(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.project_staff_persons p
         WHERE p.id = p_person_id AND p.user_id = (SELECT auth.uid())
    );
$$;

DROP POLICY IF EXISTS "project_staff_persons_select_own" ON public.project_staff_persons;
CREATE POLICY "project_staff_persons_select_own" ON public.project_staff_persons
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "project_engagements_select_own" ON public.project_engagements;
CREATE POLICY "project_engagements_select_own" ON public.project_engagements
    FOR SELECT TO authenticated
    USING (public.project_staff_person_is_self(person_id));

CREATE OR REPLACE FUNCTION public.my_engagement()
 RETURNS TABLE(
     engagement_id uuid,
     person_id uuid,
     person_name text,
     project_id text,
     project_no text,
     position_code text,
     from_on date,
     to_on date,
     days_left integer,
     emoluments numeric,
     tenure_days_used integer,
     tenure_cap_days integer
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH me AS (
        SELECT (SELECT auth.uid()) AS uid,
               public.caller_staff_id() AS sid,
               public.ist_today() AS today
    ),
    cap AS (
        SELECT coalesce(
            (SELECT (r.value #>> '{}')::integer * 365
               FROM public.csir_rules r
              WHERE r.rule_key = 'project_staff.tenure_cap_years'
                AND r.effective_to IS NULL
              ORDER BY r.effective_from DESC
              LIMIT 1),
            1825
        ) AS cap_days
    )
    SELECT e.id AS engagement_id,
           p.id AS person_id,
           p.name AS person_name,
           e.project_id,
           coalesce(pr."ProjectNo", e.project_id) AS project_no,
           e.position_code,
           e.from_on,
           e.to_on,
           (e.to_on - me.today)::integer AS days_left,
           e.emoluments,
           public.project_staff_tenure_days(p.id, me.today) AS tenure_days_used,
           cap.cap_days AS tenure_cap_days
      FROM me
      CROSS JOIN cap
      JOIN public.project_engagements e ON true
      JOIN public.project_staff_persons p ON p.id = e.person_id
      LEFT JOIN public.projects pr ON pr."ProjectID" = e.project_id
      LEFT JOIN public.project_staff ps ON ps.id = e.legacy_project_staff_id
     WHERE (p.user_id = me.uid)
        OR (me.sid IS NOT NULL AND ps.staff_id = me.sid)
     ORDER BY e.to_on DESC;
$$;

CREATE TABLE IF NOT EXISTS public.equipment_in_charge (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    equipment_id text NOT NULL REFERENCES public.equipment("UInsID") ON DELETE CASCADE,
    staff_id text NOT NULL,
    from_on date NOT NULL DEFAULT CURRENT_DATE,
    to_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT equipment_in_charge_dates_check CHECK (to_on IS NULL OR to_on >= from_on)
);

CREATE INDEX IF NOT EXISTS equipment_in_charge_equip_idx ON public.equipment_in_charge (equipment_id);
CREATE INDEX IF NOT EXISTS equipment_in_charge_staff_idx ON public.equipment_in_charge (staff_id);

ALTER TABLE public.equipment_in_charge ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.equipment_in_charge TO authenticated;

DROP POLICY IF EXISTS "equipment_in_charge_select" ON public.equipment_in_charge;
CREATE POLICY "equipment_in_charge_select" ON public.equipment_in_charge
    FOR SELECT TO authenticated USING (public.caller_is_verified());

DROP POLICY IF EXISTS "equipment_in_charge_write" ON public.equipment_in_charge;
CREATE POLICY "equipment_in_charge_write" ON public.equipment_in_charge
    FOR ALL TO authenticated
    USING (public.caller_is_admin() OR public.caller_has_role('Director') OR public.caller_has_role('DivisionHead') OR public.caller_has_role('HOD'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director') OR public.caller_has_role('DivisionHead') OR public.caller_has_role('HOD'));

-- ── 4. CD1–CD3: Common Desk Phase A ──────────────────────────────────────────

ALTER TABLE public.calendar_events
    ADD COLUMN IF NOT EXISTS starts_at timestamptz,
    ADD COLUMN IF NOT EXISTS ends_at timestamptz;

CREATE TABLE IF NOT EXISTS public.request_norms (
    kind text NOT NULL PRIMARY KEY,
    label text NOT NULL,
    norm_days integer NOT NULL CHECK (norm_days > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.request_norms ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.request_norms TO authenticated;

DROP POLICY IF EXISTS "request_norms_select" ON public.request_norms;
CREATE POLICY "request_norms_select" ON public.request_norms
    FOR SELECT TO authenticated USING (public.caller_is_verified());

DROP POLICY IF EXISTS "request_norms_write" ON public.request_norms;
CREATE POLICY "request_norms_write" ON public.request_norms
    FOR ALL TO authenticated
    USING (public.caller_is_admin() OR public.caller_has_role('Director'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));

INSERT INTO public.request_norms (kind, label, norm_days) VALUES
    ('ticket', 'Helpdesk ticket', 3),
    ('proposal', 'Project proposal', 14),
    ('progress_report', 'Progress report', 7),
    ('contribution', 'Data update request', 5)
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.request_catalog (
    key text NOT NULL PRIMARY KEY,
    label text NOT NULL,
    label_hi text NOT NULL DEFAULT '',
    group_name text NOT NULL DEFAULT 'General',
    desk text NOT NULL DEFAULT 'Administration',
    category text NOT NULL CHECK (category IN (
        'Infrastructure', 'EquipmentIT', 'Administrative', 'HRGrievance',
        'Finance', 'LabResearch', 'Library', 'Transport'
    )),
    norm_days integer NOT NULL DEFAULT 3 CHECK (norm_days > 0),
    handler text NOT NULL DEFAULT 'ticket' CHECK (handler IN ('ticket', 'leave', 'letter', 'booking', 'hiring')),
    sort_order integer NOT NULL DEFAULT 100,
    active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.request_catalog ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.request_catalog TO authenticated;

DROP POLICY IF EXISTS "request_catalog_select" ON public.request_catalog;
CREATE POLICY "request_catalog_select" ON public.request_catalog
    FOR SELECT TO authenticated USING (public.caller_is_verified());

DROP POLICY IF EXISTS "request_catalog_write" ON public.request_catalog;
CREATE POLICY "request_catalog_write" ON public.request_catalog
    FOR ALL TO authenticated
    USING (public.caller_is_admin() OR public.caller_has_role('Director'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));

INSERT INTO public.request_catalog (key, label, group_name, desk, category, norm_days, handler, sort_order) VALUES
    ('leave', 'Leave / tour query', 'HR & People', 'HR Section', 'HRGrievance', 2, 'ticket', 10),
    ('letter', 'Certificate or official letter', 'HR & People', 'Administration', 'Administrative', 3, 'ticket', 20),
    ('repair', 'Lab / facility repair', 'Facilities', 'Engineering', 'Infrastructure', 3, 'ticket', 30),
    ('it', 'IT, network or portal help', 'IT & Systems', 'IT Cell', 'EquipmentIT', 2, 'ticket', 40),
    ('room', 'Meeting room, vehicle or guest house', 'Facilities', 'Room Desk', 'Administrative', 1, 'ticket', 50),
    ('complaint', 'Confidential grievance / complaint', 'Welfare', 'Grievance Cell', 'HRGrievance', 5, 'ticket', 60),
    ('safety', 'Safety hazard or incident', 'Safety', 'Safety Officer', 'LabResearch', 1, 'ticket', 70),
    ('other', 'Something else', 'General', 'Helpdesk', 'Administrative', 3, 'ticket', 99)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS request_key text REFERENCES public.request_catalog(key) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS against_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.calendar_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.calendar_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.calendar_tokens TO authenticated;
GRANT ALL ON TABLE public.calendar_tokens TO service_role;

DROP POLICY IF EXISTS "calendar_tokens_select_own" ON public.calendar_tokens;
CREATE POLICY "calendar_tokens_select_own" ON public.calendar_tokens
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.calendar_token_rotate()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_tok text;
BEGIN
    IF v_uid IS NULL OR NOT coalesce(public.caller_is_verified(), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    v_tok := encode(extensions.gen_random_bytes(24), 'hex');
    INSERT INTO public.calendar_tokens (user_id, token, revoked_at)
    VALUES (v_uid, v_tok, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET token = EXCLUDED.token,
          revoked_at = NULL;
    RETURN v_tok;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_day(p_from date DEFAULT public.ist_today(), p_to date DEFAULT (public.ist_today() + 7))
 RETURNS TABLE(
     at date,
     until date,
     kind text,
     title text,
     place text,
     link text,
     subject_type text,
     subject_id text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT ce.event_date AS at,
           ce.event_date AS until,
           'EVENT'::text AS kind,
           ce.title,
           coalesce(nullif(ce.location, ''), ce.visibility) AS place,
           '/calendar'::text AS link,
           'calendar_event'::text AS subject_type,
           ce.id::text AS subject_id
      FROM public.calendar_events ce
     WHERE ce.event_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT h.holiday_date AS at,
           h.holiday_date AS until,
           'HOLIDAY'::text AS kind,
           h.name AS title,
           h.holiday_type AS place,
           '/calendar'::text AS link,
           'holiday'::text AS subject_type,
           h.id::text AS subject_id
      FROM public.holidays h
     WHERE h.holiday_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT m.meeting_date AS at,
           m.meeting_date AS until,
           'MEETING'::text AS kind,
           m.title,
           coalesce(nullif(m.venue, ''), m.mode) AS place,
           '/committees/' || m.committee_id || '/meetings/' || m.id AS link,
           'meeting'::text AS subject_type,
           m.id::text AS subject_id
      FROM public.meetings m
     WHERE m.meeting_date BETWEEN p_from AND p_to
       AND m.stage NOT IN ('CANCELLED')
       AND public.committee_seat(m.committee_id) IS NOT NULL
    UNION ALL
    SELECT rt.due_date AS at,
           rt.due_date AS until,
           'REPORT_DUE'::text AS kind,
           rt.subject AS title,
           rt.state AS place,
           rt.link,
           rt.kind AS subject_type,
           rt.subject AS subject_id
      FROM public.my_report_timers() rt
     WHERE rt.due_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT eng.to_on AS at,
           eng.to_on AS until,
           'CONTRACT_END'::text AS kind,
           'Contract ends (' || eng.project_no || ')' AS title,
           eng.position_code AS place,
           '/'::text AS link,
           'engagement'::text AS subject_type,
           eng.engagement_id::text AS subject_id
      FROM public.my_engagement() eng
     WHERE eng.to_on BETWEEN p_from AND p_to
    ORDER BY at ASC, title ASC;
$$;

CREATE OR REPLACE FUNCTION public.my_requests()
 RETURNS TABLE(
     kind text,
     title text,
     asked_at timestamptz,
     holder_label text,
     holder_since timestamptz,
     norm_days integer,
     state text,
     link text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    WITH me AS (
        SELECT (SELECT auth.uid()) AS uid
    )
    SELECT coalesce(t.request_key, 'ticket') AS kind,
           t.subject AS title,
           t.created_at AS asked_at,
           CASE WHEN t.assigned_to IS NOT NULL THEN 'Assigned officer' ELSE t.category || ' desk' END AS holder_label,
           t.updated_at AS holder_since,
           coalesce((SELECT rc.norm_days FROM public.request_catalog rc WHERE rc.key = t.request_key),
                    (SELECT rn.norm_days FROM public.request_norms rn WHERE rn.kind = 'ticket'), 3) AS norm_days,
           t.status AS state,
           '/helpdesk/' || t.id AS link
      FROM me
      JOIN public.tickets t ON t.submitted_by = me.uid
     WHERE t.status <> 'Closed'
    UNION ALL
    SELECT 'proposal'::text AS kind,
           p.title,
           p.created_at AS asked_at,
           p.status AS holder_label,
           p.updated_at AS holder_since,
           coalesce((SELECT rn.norm_days FROM public.request_norms rn WHERE rn.kind = 'proposal'), 14) AS norm_days,
           p.status AS state,
           '/proposals/' || p.id AS link
      FROM me
      JOIN public.proposals p ON p.pi_user_id = me.uid
     WHERE p.status NOT IN ('DRAFT', 'SANCTIONED', 'REJECTED', 'WITHDRAWN')
    UNION ALL
    SELECT 'contribution'::text AS kind,
           cr.title,
           cr.created_at AS asked_at,
           coalesce(cr.domain, 'Steward') AS holder_label,
           cr.updated_at AS holder_since,
           coalesce((SELECT rn.norm_days FROM public.request_norms rn WHERE rn.kind = 'contribution'), 5) AS norm_days,
           cr.status AS state,
           '/work?r=' || cr.id AS link
      FROM me
      JOIN public.contribution_requests cr ON cr.requested_by = me.uid
     WHERE cr.status NOT IN ('done', 'declined')
    ORDER BY asked_at DESC;
$$;

-- ── 5. CM1: Rooms, bookings, hospitality & scheduling ────────────────────────

CREATE TABLE IF NOT EXISTS public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    kind text NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'vehicle', 'guest house')),
    building text NOT NULL DEFAULT '',
    capacity integer CHECK (capacity IS NULL OR capacity > 0),
    facilities text[] NOT NULL DEFAULT '{}'::text[],
    custodian_staff_id text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated;

DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
CREATE POLICY "rooms_select" ON public.rooms
    FOR SELECT TO authenticated USING (public.caller_is_verified());

DROP POLICY IF EXISTS "rooms_write" ON public.rooms;
CREATE POLICY "rooms_write" ON public.rooms
    FOR ALL TO authenticated
    USING (public.caller_is_admin() OR public.caller_has_role('Director'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));

CREATE TABLE IF NOT EXISTS public.module_desks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    desk text NOT NULL CHECK (desk IN ('rooms', 'hospitality')),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT module_desks_unique UNIQUE (desk, user_id)
);

ALTER TABLE public.module_desks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.module_desks TO authenticated;

DROP POLICY IF EXISTS "module_desks_select" ON public.module_desks;
CREATE POLICY "module_desks_select" ON public.module_desks
    FOR SELECT TO authenticated USING (public.caller_is_verified());

DROP POLICY IF EXISTS "module_desks_write" ON public.module_desks;
CREATE POLICY "module_desks_write" ON public.module_desks
    FOR ALL TO authenticated
    USING (public.caller_is_admin() OR public.caller_has_role('Director'))
    WITH CHECK (public.caller_is_admin() OR public.caller_has_role('Director'));

CREATE TABLE IF NOT EXISTS public.room_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    booked_by uuid NOT NULL DEFAULT auth.uid(),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    purpose text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'CONFIRMED', 'CANCELLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_bookings_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS room_bookings_room_window_idx
    ON public.room_bookings (room_id, starts_at, ends_at) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS room_bookings_meeting_idx
    ON public.room_bookings (meeting_id) WHERE meeting_id IS NOT NULL;

ALTER TABLE public.room_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_bookings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.room_bookings TO authenticated;
GRANT ALL ON TABLE public.room_bookings TO service_role;

DROP POLICY IF EXISTS "room_bookings_select" ON public.room_bookings;
CREATE POLICY "room_bookings_select" ON public.room_bookings
    FOR SELECT TO authenticated USING (public.caller_is_verified());

CREATE TABLE IF NOT EXISTS public.hospitality_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL DEFAULT auth.uid(),
    headcount integer NOT NULL DEFAULT 0 CHECK (headcount >= 0),
    items text NOT NULL DEFAULT '',
    serve_at timestamptz,
    budget_head text NOT NULL DEFAULT '',
    estimated_cost numeric(12,2),
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'SERVED', 'CANCELLED')),
    decided_by uuid,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hospitality_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hospitality_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.hospitality_requests TO authenticated;
GRANT ALL ON TABLE public.hospitality_requests TO service_role;

DROP POLICY IF EXISTS "hospitality_requests_select" ON public.hospitality_requests;
CREATE POLICY "hospitality_requests_select" ON public.hospitality_requests
    FOR SELECT TO authenticated
    USING (
        requested_by = (SELECT auth.uid())
        OR public.caller_is_committee_authority()
        OR EXISTS (SELECT 1 FROM public.module_desks md WHERE md.desk = 'hospitality' AND md.user_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = hospitality_requests.meeting_id AND public.committee_can_read(m.committee_id))
    );

CREATE OR REPLACE FUNCTION public.room_book(
    p_room_id uuid,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_purpose text DEFAULT '',
    p_meeting_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id  uuid;
BEGIN
    IF v_uid IS NULL OR NOT coalesce(public.caller_is_verified(), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'ends_at must be after starts_at';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

    IF EXISTS (
        SELECT 1 FROM public.room_bookings rb
         WHERE rb.room_id = p_room_id
           AND rb.status <> 'CANCELLED'
           AND rb.starts_at < p_ends_at
           AND rb.ends_at > p_starts_at
    ) THEN
        RAISE EXCEPTION 'Room is already booked for that time';
    END IF;

    INSERT INTO public.room_bookings (room_id, meeting_id, booked_by, starts_at, ends_at, purpose, status)
    VALUES (p_room_id, p_meeting_id, v_uid, p_starts_at, p_ends_at, coalesce(p_purpose, ''), 'CONFIRMED')
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.room_booking_decide(p_booking_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.room_bookings%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    IF p_status NOT IN ('CONFIRMED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Invalid booking status %', p_status;
    END IF;

    SELECT * INTO v_row FROM public.room_bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

    IF NOT (
        public.caller_is_committee_authority()
        OR EXISTS (SELECT 1 FROM public.module_desks md WHERE md.desk = 'rooms' AND md.user_id = v_uid)
        OR (p_status = 'CANCELLED' AND v_row.booked_by = v_uid)
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.room_bookings SET status = p_status WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_schedule(
    p_committee_id uuid,
    p_title text,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_venue text DEFAULT '',
    p_mode text DEFAULT 'IN_PERSON',
    p_room_id uuid DEFAULT NULL,
    p_notice_days integer DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid       uuid := auth.uid();
    v_term_id   uuid;
    v_mtg_id    uuid;
    v_room_name text;
BEGIN
    IF v_uid IS NULL OR NOT public.committee_can_run(p_committee_id) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'ends_at must be after starts_at';
    END IF;

    SELECT id INTO v_term_id
      FROM public.committee_terms
     WHERE committee_id = p_committee_id AND status = 'ACTIVE'
     ORDER BY term_no DESC LIMIT 1;
    IF v_term_id IS NULL THEN
        RAISE EXCEPTION 'Committee has no active term';
    END IF;

    IF p_room_id IS NOT NULL THEN
        SELECT name INTO v_room_name FROM public.rooms WHERE id = p_room_id AND active;
        IF NOT FOUND THEN RAISE EXCEPTION 'Room not found or inactive'; END IF;
    END IF;

    INSERT INTO public.meetings (
        committee_id, term_id, meeting_date, starts_at, ends_at,
        venue, title, mode, stage, notice_days
    )
    VALUES (
        p_committee_id, v_term_id, (p_starts_at AT TIME ZONE 'Asia/Kolkata')::date,
        p_starts_at, p_ends_at,
        coalesce(nullif(btrim(p_venue), ''), v_room_name, ''),
        p_title, coalesce(p_mode, 'IN_PERSON'), 'PLANNED', p_notice_days
    )
    RETURNING id INTO v_mtg_id;

    IF p_room_id IS NOT NULL THEN
        PERFORM public.room_book(p_room_id, p_starts_at, p_ends_at, p_title, v_mtg_id);
    END IF;

    INSERT INTO public.committee_events (committee_id, meeting_id, term_id, actor_id, event_type, summary)
    VALUES (p_committee_id, v_mtg_id, v_term_id, v_uid, 'MEETING_SCHEDULED', p_title);

    RETURN v_mtg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_postpone(
    p_meeting_id uuid,
    p_starts_at timestamptz,
    p_ends_at timestamptz
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_mtg public.meetings%ROWTYPE;
    v_bk  record;
BEGIN
    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'ends_at must be after starts_at';
    END IF;
    SELECT * INTO v_mtg FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;

    IF v_uid IS NULL OR NOT public.committee_can_run(v_mtg.committee_id) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.meetings
       SET stage = 'POSTPONED',
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           meeting_date = (p_starts_at AT TIME ZONE 'Asia/Kolkata')::date
     WHERE id = p_meeting_id;

    FOR v_bk IN
        SELECT id, room_id FROM public.room_bookings
         WHERE meeting_id = p_meeting_id AND status <> 'CANCELLED'
         FOR UPDATE
    LOOP
        PERFORM pg_advisory_xact_lock(hashtext(v_bk.room_id::text));
        IF EXISTS (
            SELECT 1 FROM public.room_bookings rb
             WHERE rb.room_id = v_bk.room_id
               AND rb.id <> v_bk.id
               AND rb.status <> 'CANCELLED'
               AND rb.starts_at < p_ends_at
               AND rb.ends_at > p_starts_at
        ) THEN
            RAISE EXCEPTION 'Room is already booked for the postponed time';
        END IF;
        UPDATE public.room_bookings
           SET starts_at = p_starts_at, ends_at = p_ends_at
         WHERE id = v_bk.id;
    END LOOP;

    INSERT INTO public.committee_events (committee_id, meeting_id, term_id, actor_id, event_type, summary)
    VALUES (v_mtg.committee_id, p_meeting_id, v_mtg.term_id, v_uid, 'MEETING_POSTPONED', v_mtg.title);
END;
$$;

CREATE OR REPLACE FUNCTION public.hospitality_request_create(
    p_meeting_id uuid,
    p_headcount integer,
    p_items text,
    p_serve_at timestamptz DEFAULT NULL,
    p_budget_head text DEFAULT ''
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_cmt uuid;
    v_id  uuid;
BEGIN
    SELECT committee_id INTO v_cmt FROM public.meetings WHERE id = p_meeting_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
    IF v_uid IS NULL OR NOT public.committee_can_run(v_cmt) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    INSERT INTO public.hospitality_requests (meeting_id, requested_by, headcount, items, serve_at, budget_head)
    VALUES (p_meeting_id, v_uid, coalesce(p_headcount, 0), coalesce(p_items, ''), p_serve_at, coalesce(p_budget_head, ''))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hospitality_request_decide(p_request_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF p_status NOT IN ('APPROVED', 'SERVED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Invalid status %', p_status;
    END IF;
    IF v_uid IS NULL OR NOT (
        public.caller_is_committee_authority()
        OR EXISTS (SELECT 1 FROM public.module_desks md WHERE md.desk = 'hospitality' AND md.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.hospitality_requests
       SET status = p_status, decided_by = v_uid, decided_at = now()
     WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Hospitality request not found'; END IF;
END;
$$;
