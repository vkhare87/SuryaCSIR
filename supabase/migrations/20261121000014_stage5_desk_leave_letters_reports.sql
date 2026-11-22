-- ============================================================
-- Stage 5 — Self-Service Bookings, Leave, Letters, Dak,
-- Safety, Division Upward Reports, Director Watch & CM6
-- Covers Roadmap items 5.1 (TS2), 5.2 (PJ2 + PJ3),
-- 5.3 (CD8, CD9, CD16), 5.4 (HH4), 5.5 (DH13 + DH9),
-- 5.6 (CM6), 5.7 (DH5)
-- ============================================================

-- ── 5.1 (TS2) Instrument Bookings ──

CREATE TABLE IF NOT EXISTS public.instrument_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    equipment_id text NOT NULL,
    requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id text,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')),
    decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS instrument_bookings_equip_idx ON public.instrument_bookings (equipment_id, starts_at);

ALTER TABLE public.instrument_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instrument_bookings_read_all ON public.instrument_bookings;
CREATE POLICY instrument_bookings_read_all ON public.instrument_bookings
    FOR SELECT TO authenticated
    USING (true);

CREATE OR REPLACE FUNCTION public.instrument_book(
    p_equipment_id text,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_purpose text,
    p_project_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'Booking end time must be after start time';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('equip:' || p_equipment_id));

    IF EXISTS (
        SELECT 1 FROM public.instrument_bookings ib
         WHERE ib.equipment_id = p_equipment_id
           AND ib.status IN ('PENDING', 'APPROVED')
           AND ib.starts_at < p_ends_at
           AND ib.ends_at > p_starts_at
    ) THEN
        RAISE EXCEPTION 'Instrument already has a booking overlapping this slot';
    END IF;

    INSERT INTO public.instrument_bookings (equipment_id, requested_by, project_id, starts_at, ends_at, purpose)
    VALUES (p_equipment_id, v_caller, p_project_id, p_starts_at, p_ends_at, btrim(p_purpose))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.instrument_booking_decide(
    p_booking_id uuid,
    p_status text,
    p_notes text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_equip text;
    v_caller_staff text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT equipment_id INTO v_equip FROM public.instrument_bookings WHERE id = p_booking_id;
    IF v_equip IS NULL THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    v_caller_staff := public.caller_staff_id();
    IF NOT (
        public.has_any_role(ARRAY['Technician', 'HOD', 'HoD', 'DivisionHead', 'Director', 'MasterAdmin', 'SystemAdmin', 'Admin'])
        OR (v_caller_staff IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.equipment_in_charge eic
             WHERE eic.equipment_id = v_equip AND eic.staff_id = v_caller_staff
        ))
    ) THEN
        RAISE EXCEPTION 'Not authorized to decide instrument booking';
    END IF;

    UPDATE public.instrument_bookings
       SET status = p_status,
           notes = COALESCE(NULLIF(btrim(p_notes), ''), notes),
           decided_by = v_caller,
           decided_at = now()
     WHERE id = p_booking_id;
END;
$$;

-- ── 5.2 (PJ2 + PJ3) Project Staff Leave & Official Letters/Certificates ──

CREATE TABLE IF NOT EXISTS public.project_leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    person_id uuid REFERENCES public.project_staff_persons(id) ON DELETE SET NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leave_type text NOT NULL CHECK (leave_type IN ('CL', 'EL', 'MEDICAL', 'DUTY', 'OTHER')),
    from_on date NOT NULL,
    to_on date NOT NULL,
    days_count integer NOT NULL DEFAULT 1 CHECK (days_count >= 1),
    reason text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (to_on >= from_on)
);

ALTER TABLE public.project_leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_leave_requests_read ON public.project_leave_requests;
CREATE POLICY project_leave_requests_read ON public.project_leave_requests
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['HOD', 'HoD', 'DivisionHead', 'Director', 'HRAdmin', 'PME', 'MasterAdmin', 'SystemAdmin', 'Scientist'])
    );

CREATE OR REPLACE FUNCTION public.project_leave_apply(
    p_leave_type text,
    p_from_on date,
    p_to_on date,
    p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_person_id uuid;
    v_days integer;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_to_on < p_from_on THEN
        RAISE EXCEPTION 'End date must be on or after start date';
    END IF;

    SELECT id INTO v_person_id FROM public.project_staff_persons WHERE user_id = v_caller LIMIT 1;
    v_days := (p_to_on - p_from_on) + 1;

    INSERT INTO public.project_leave_requests (person_id, user_id, leave_type, from_on, to_on, days_count, reason)
    VALUES (v_person_id, v_caller, p_leave_type, p_from_on, p_to_on, v_days, COALESCE(btrim(p_reason), ''))
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_leave_decide(
    p_leave_id uuid,
    p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.has_any_role(ARRAY['HOD', 'HoD', 'DivisionHead', 'Director', 'HRAdmin', 'PME', 'MasterAdmin', 'SystemAdmin', 'Scientist']) THEN
        RAISE EXCEPTION 'Not authorized to decide leave requests';
    END IF;

    UPDATE public.project_leave_requests
       SET status = p_status,
           decided_by = v_caller,
           decided_at = now()
     WHERE id = p_leave_id AND status = 'PENDING';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending leave request not found';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.official_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    letter_no text NOT NULL UNIQUE,
    template_kind text NOT NULL CHECK (template_kind IN ('BONAFIDE', 'EXPERIENCE', 'NOC', 'SANCTION', 'CLEARANCE', 'GENERAL')),
    recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_name text NOT NULL DEFAULT '',
    subject text NOT NULL CHECK (length(btrim(subject)) > 0),
    body_markdown text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'DRAFTED', 'ISSUED', 'REJECTED')),
    issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    issued_at timestamptz,
    verification_code text,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.official_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS official_letters_read ON public.official_letters;
CREATE POLICY official_letters_read ON public.official_letters
    FOR SELECT TO authenticated
    USING (
        recipient_user_id = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'HRAdmin', 'Admin', 'MasterAdmin', 'SystemAdmin', 'HOD', 'DivisionHead', 'PME'])
    );

CREATE OR REPLACE FUNCTION public.letter_request(
    p_template_kind text,
    p_subject text,
    p_body_markdown text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_name text;
    v_no text;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT COALESCE(s."Name", psp.name, u.email, 'Member')
      INTO v_name
      FROM auth.users u
      LEFT JOIN public.staff s ON s.user_id = u.id
      LEFT JOIN public.project_staff_persons psp ON psp.user_id = u.id
     WHERE u.id = v_caller
     LIMIT 1;

    v_id := gen_random_uuid();
    v_no := 'LTR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(v_id::text, '-', ''), 1, 6));

    INSERT INTO public.official_letters (
        id, letter_no, template_kind, recipient_user_id, recipient_name, subject, body_markdown, status, created_by
    ) VALUES (
        v_id, v_no, p_template_kind, v_caller, v_name, btrim(p_subject), COALESCE(p_body_markdown, ''), 'REQUESTED', v_caller
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.letter_issue(
    p_letter_id uuid,
    p_body_markdown text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_code text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.has_any_role(ARRAY['Director', 'HRAdmin', 'Admin', 'MasterAdmin', 'SystemAdmin', 'HOD', 'DivisionHead']) THEN
        RAISE EXCEPTION 'Not authorized to issue official letters';
    END IF;

    v_code := public.signature_attest('official_letter', p_letter_id::text, md5(p_letter_id::text || now()::text), 'ATTEST');

    UPDATE public.official_letters
       SET status = 'ISSUED',
           body_markdown = COALESCE(NULLIF(btrim(p_body_markdown), ''), body_markdown),
           issued_by = v_caller,
           issued_at = now(),
           verification_code = v_code
     WHERE id = p_letter_id;

    RETURN v_code;
END;
$$;

-- ── 5.3 (CD8, CD9, CD16) & 5.7 (DH5) Dak Register, Forms Shelf & Safety ──

CREATE TABLE IF NOT EXISTS public.dak_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    dak_no text NOT NULL UNIQUE,
    direction text NOT NULL CHECK (direction IN ('INWARD', 'OUTWARD')),
    from_or_to text NOT NULL CHECK (length(btrim(from_or_to)) > 0),
    subject text NOT NULL CHECK (length(btrim(subject)) > 0),
    received_or_sent_on date NOT NULL DEFAULT public.ist_today(),
    is_hq boolean NOT NULL DEFAULT false,
    division_code text,
    assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_ACTION', 'CLOSED')),
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dak_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dak_letters_read ON public.dak_letters;
CREATE POLICY dak_letters_read ON public.dak_letters
    FOR SELECT TO authenticated
    USING (
        assigned_to = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HRAdmin', 'PME', 'HOD', 'DivisionHead'])
    );

CREATE OR REPLACE FUNCTION public.dak_letter_log(
    p_dak_no text,
    p_direction text,
    p_from_or_to text,
    p_subject text,
    p_is_hq boolean DEFAULT false,
    p_division_code text DEFAULT NULL,
    p_assigned_to uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HRAdmin', 'PME', 'HOD', 'DivisionHead']) THEN
        RAISE EXCEPTION 'Not authorized to log Dak entries';
    END IF;

    INSERT INTO public.dak_letters (dak_no, direction, from_or_to, subject, is_hq, division_code, assigned_to, created_by)
    VALUES (btrim(p_dak_no), p_direction, btrim(p_from_or_to), btrim(p_subject), COALESCE(p_is_hq, false), p_division_code, p_assigned_to, v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dak_letter_update_status(
    p_id uuid,
    p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.dak_letters
       SET status = p_status
     WHERE id = p_id
       AND (
           assigned_to = v_caller
           OR created_by = v_caller
           OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'PME'])
       );
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dak entry not found or not editable';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.forms_shelf (
    key text PRIMARY KEY,
    title text NOT NULL,
    category text NOT NULL,
    description text NOT NULL DEFAULT '',
    link text NOT NULL DEFAULT '/helpdesk/new',
    active boolean NOT NULL DEFAULT true
);

INSERT INTO public.forms_shelf (key, title, category, description, link) VALUES
    ('LEAVE_APP', 'Project Staff Leave Application', 'HR & Leave', 'Apply for CL/EL/Duty leave with supervisor approval', '/desk'),
    ('LETTER_REQ', 'Bonafide / Experience / NOC Request', 'Certificates', 'Request signed official letter or certificate', '/desk'),
    ('EQUIP_BOOK', 'Instrument Slot Request', 'Facilities', 'Book division lab equipment with clash guard', '/desk'),
    ('ROOM_BOOK', 'Conference Room / Vehicle / Guest House', 'Administration', 'Reserve rooms, vehicles, or guest house suites', '/rooms'),
    ('SAFETY_INC', 'Lab Safety Incident / Near-Miss Report', 'Safety', 'Log safety incident or hazard inspection', '/desk')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.forms_shelf ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forms_shelf_read_all ON public.forms_shelf;
CREATE POLICY forms_shelf_read_all ON public.forms_shelf FOR SELECT TO authenticated USING (active = true);

CREATE TABLE IF NOT EXISTS public.safety_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    division_code text,
    location text NOT NULL CHECK (length(btrim(location)) > 0),
    severity text NOT NULL CHECK (severity IN ('NEAR_MISS', 'MINOR', 'MAJOR')),
    description text NOT NULL CHECK (length(btrim(description)) > 0),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'MITIGATED', 'CLOSED')),
    reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_incidents_read ON public.safety_incidents;
CREATE POLICY safety_incidents_read ON public.safety_incidents
    FOR SELECT TO authenticated
    USING (
        reported_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HOD', 'DivisionHead', 'Technician'])
    );

CREATE OR REPLACE FUNCTION public.safety_incident_report(
    p_location text,
    p_severity text,
    p_description text,
    p_division_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.safety_incidents (division_code, location, severity, description, reported_by)
    VALUES (p_division_code, btrim(p_location), p_severity, btrim(p_description), v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ── 5.4 (HH4) Division Upward Reports ──

CREATE TABLE IF NOT EXISTS public.division_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    division_code text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('MONTHLY', 'QUARTERLY', 'RC_DECK')),
    period_from date NOT NULL,
    period_to date NOT NULL,
    due_on date,
    body_markdown text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT')),
    sent_at timestamptz,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.division_report_inputs (
    report_id uuid NOT NULL REFERENCES public.division_reports(id) ON DELETE CASCADE,
    staff_id text NOT NULL,
    asked_at timestamptz NOT NULL DEFAULT now(),
    received_at timestamptz,
    PRIMARY KEY (report_id, staff_id)
);

ALTER TABLE public.division_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.division_report_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS division_reports_read ON public.division_reports;
CREATE POLICY division_reports_read ON public.division_reports
    FOR SELECT TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR division_code = ANY(public.caller_division_codes())
        OR public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin', 'SystemAdmin'])
    );

DROP POLICY IF EXISTS division_report_inputs_read ON public.division_report_inputs;
CREATE POLICY division_report_inputs_read ON public.division_report_inputs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.division_reports dr
         WHERE dr.id = division_report_inputs.report_id
           AND (dr.created_by = (SELECT auth.uid()) OR dr.division_code = ANY(public.caller_division_codes()) OR public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin']))
    ));

CREATE OR REPLACE FUNCTION public.division_report_assemble(
    p_division_code text,
    p_kind text,
    p_period_from date,
    p_period_to date,
    p_due_on date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_proj_count integer;
    v_pub_count integer;
    v_body text;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT (
        p_division_code = ANY(public.caller_division_codes())
        OR public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin', 'SystemAdmin'])
    ) THEN
        RAISE EXCEPTION 'Not authorized to assemble report for division %', p_division_code;
    END IF;

    SELECT count(*)::integer INTO v_proj_count
      FROM public.projects p
     WHERE p."DivisionCode" = p_division_code AND p."ProjectStatus" = 'Active';

    SELECT count(*)::integer INTO v_pub_count
      FROM public.scientific_outputs so
     WHERE so.division_code = p_division_code;

    v_body := '## Division ' || p_division_code || ' — ' || p_kind || ' Report (' || p_period_from::text || ' to ' || p_period_to::text || ')' || E'\n\n'
        || '- **Active projects:** ' || v_proj_count::text || ' _(Source: public.projects)_' || E'\n'
        || '- **Scientific outputs on record:** ' || v_pub_count::text || ' _(Source: public.scientific_outputs)_' || E'\n';

    INSERT INTO public.division_reports (division_code, kind, period_from, period_to, due_on, body_markdown, created_by)
    VALUES (p_division_code, p_kind, p_period_from, p_period_to, p_due_on, v_body, v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.division_report_send(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_div text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT division_code INTO v_div FROM public.division_reports WHERE id = p_report_id;
    IF v_div IS NULL OR NOT (v_div = ANY(public.caller_division_codes()) OR public.has_any_role(ARRAY['Director', 'MasterAdmin'])) THEN
        RAISE EXCEPTION 'Not authorized to send this division report';
    END IF;

    UPDATE public.division_reports SET status = 'SENT', sent_at = now() WHERE id = p_report_id AND status = 'DRAFT';
END;
$$;

-- ── 5.5 (DH13 + DH9) Director Watch List ──

CREATE TABLE IF NOT EXISTS public.director_watch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tag text NOT NULL CHECK (tag IN ('PEOPLE', 'PROJECT', 'COMMITTEE', 'UPWARD', 'DECISION')),
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    note text NOT NULL DEFAULT '',
    pinned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.director_watch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_watch_read ON public.director_watch_items;
CREATE POLICY director_watch_read ON public.director_watch_items
    FOR SELECT TO authenticated
    USING (public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'PME']));

CREATE OR REPLACE FUNCTION public.director_watch_pin(
    p_tag text,
    p_subject_type text,
    p_subject_id text,
    p_title text,
    p_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL OR NOT (public.caller_has_role('Director') OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only Director or MasterAdmin may pin watch items';
    END IF;

    INSERT INTO public.director_watch_items (tag, subject_type, subject_id, title, note, pinned_by)
    VALUES (p_tag, p_subject_type, p_subject_id, btrim(p_title), COALESCE(p_note, ''), v_caller)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ── 5.6 (CM6) Committee Action Item Verification ──

ALTER TABLE public.action_items
    ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.action_item_verify(p_action_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT (public.caller_is_committee_authority() OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'HOD', 'HoD', 'DivisionHead'])) THEN
        RAISE EXCEPTION 'Not authorized to verify action item closure';
    END IF;

    UPDATE public.action_items
       SET status = 'Completed',
           completed_at = COALESCE(completed_at, now()),
           verified_by = v_caller,
           verified_at = now()
     WHERE id = p_action_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
    public.instrument_book(text, timestamptz, timestamptz, text, text),
    public.instrument_booking_decide(uuid, text, text),
    public.project_leave_apply(text, date, date, text),
    public.project_leave_decide(uuid, text),
    public.letter_request(text, text, text),
    public.letter_issue(uuid, text),
    public.dak_letter_log(text, text, text, text, boolean, text, uuid),
    public.dak_letter_update_status(uuid, text),
    public.safety_incident_report(text, text, text, text),
    public.division_report_assemble(text, text, date, date, date),
    public.division_report_send(uuid),
    public.director_watch_pin(text, text, text, text, text),
    public.action_item_verify(uuid)
TO authenticated;
