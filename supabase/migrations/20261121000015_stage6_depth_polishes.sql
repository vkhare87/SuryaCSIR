-- ============================================================
-- Stage 6 — Role Depth, Quick-Win Polishes & Record Spine
-- Covers 6.1 (HH5+HH6), 6.2 (ST2-ST4, PJ4), 6.3 (TS3-TS5),
-- 6.4 (CM7-CM8), 6.5 (CD12, CD15, CD17), 6.8 (D2, C3)
-- ============================================================

-- ── 6.1 (HH5 + HH6) Technologies & Outside Threads ──

CREATE TABLE IF NOT EXISTS public.technologies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    division_code text NOT NULL,
    lead_staff_id text,
    thrust_area text NOT NULL DEFAULT '',
    trl smallint NOT NULL DEFAULT 1 CHECK (trl BETWEEN 1 AND 9),
    trl_on date NOT NULL DEFAULT public.ist_today(),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRANSFERRED', 'PAUSED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.technology_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    technology_id uuid NOT NULL REFERENCES public.technologies(id) ON DELETE CASCADE,
    at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL CHECK (kind IN ('TRL_STEP', 'IP_FILED', 'IP_GRANTED', 'DEMO', 'LICENSEE_CONTACT', 'TRANSFER')),
    note text NOT NULL DEFAULT '',
    evidence_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    actor uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.outside_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    partner_name text NOT NULL CHECK (length(btrim(partner_name)) > 0),
    partner_type text NOT NULL DEFAULT 'Industry',
    division_code text NOT NULL,
    owner_staff_id text,
    purpose text NOT NULL DEFAULT '',
    stage text NOT NULL DEFAULT 'LEAD' CHECK (stage IN ('LEAD', 'TALKS', 'DRAFT_AGREEMENT', 'WITH_LEGAL', 'SIGNED', 'ACTIVE', 'CLOSED')),
    next_step text NOT NULL DEFAULT '',
    next_step_by text NOT NULL DEFAULT 'US' CHECK (next_step_by IN ('US', 'THEM')),
    next_step_due date,
    last_contact_on date NOT NULL DEFAULT public.ist_today(),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outside_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    thread_id uuid NOT NULL REFERENCES public.outside_threads(id) ON DELETE CASCADE,
    on_date date NOT NULL DEFAULT public.ist_today(),
    kind text NOT NULL CHECK (kind IN ('MEETING', 'CALL', 'EMAIL', 'VISIT_IN', 'VISIT_OUT', 'LETTER')),
    summary text NOT NULL CHECK (length(btrim(summary)) > 0),
    by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technology_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outside_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outside_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technologies_read ON public.technologies;
CREATE POLICY technologies_read ON public.technologies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS technology_events_read ON public.technology_events;
CREATE POLICY technology_events_read ON public.technology_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS outside_threads_read ON public.outside_threads;
CREATE POLICY outside_threads_read ON public.outside_threads FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS outside_contacts_read ON public.outside_contacts;
CREATE POLICY outside_contacts_read ON public.outside_contacts FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.technology_log_step(
    p_technology_id uuid,
    p_kind text,
    p_note text,
    p_new_trl integer DEFAULT NULL,
    p_evidence_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_div text;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT division_code INTO v_div FROM public.technologies WHERE id = p_technology_id;
    IF v_div IS NULL THEN
        RAISE EXCEPTION 'Technology not found';
    END IF;
    IF NOT (
        v_div = ANY(public.caller_division_codes())
        OR public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin', 'SystemAdmin', 'Scientist'])
    ) THEN
        RAISE EXCEPTION 'Not authorized to update this technology';
    END IF;
    IF p_kind = 'TRL_STEP' AND p_evidence_document_id IS NULL THEN
        RAISE EXCEPTION 'A TRL step requires an evidence document';
    END IF;

    INSERT INTO public.technology_events (technology_id, kind, note, evidence_document_id, actor)
    VALUES (p_technology_id, p_kind, COALESCE(btrim(p_note), ''), p_evidence_document_id, v_caller)
    RETURNING id INTO v_id;

    IF p_new_trl IS NOT NULL THEN
        UPDATE public.technologies SET trl = p_new_trl::smallint, trl_on = public.ist_today() WHERE id = p_technology_id;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.outside_contact_log(
    p_thread_id uuid,
    p_kind text,
    p_summary text,
    p_on_date date DEFAULT public.ist_today()
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
    IF NOT public.has_any_role(ARRAY['Director', 'HOD', 'HoD', 'DivisionHead', 'PME', 'Scientist', 'MasterAdmin', 'SystemAdmin']) THEN
        RAISE EXCEPTION 'Not authorized to log outside contacts';
    END IF;

    INSERT INTO public.outside_contacts (thread_id, on_date, kind, summary, by_user_id)
    VALUES (p_thread_id, COALESCE(p_on_date, public.ist_today()), p_kind, btrim(p_summary), v_caller)
    RETURNING id INTO v_id;

    UPDATE public.outside_threads
       SET last_contact_on = GREATEST(last_contact_on, COALESCE(p_on_date, public.ist_today()))
     WHERE id = p_thread_id;

    RETURN v_id;
END;
$$;

-- ── 6.2 (ST3 + ST4) Supervisor Meetings & Private Grievances ──

CREATE TABLE IF NOT EXISTS public.supervisor_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    supervisor_staff_id text,
    met_on date NOT NULL DEFAULT public.ist_today(),
    notes text NOT NULL CHECK (length(btrim(notes)) > 0),
    next_goal text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.private_grievances (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    against_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    category text NOT NULL DEFAULT 'Academic',
    summary text NOT NULL CHECK (length(btrim(summary)) >= 10),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervisor_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_grievances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervisor_meetings_read ON public.supervisor_meetings;
CREATE POLICY supervisor_meetings_read ON public.supervisor_meetings
    FOR SELECT TO authenticated
    USING (
        student_user_id = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Scientist', 'HOD', 'HoD', 'DivisionHead', 'Director', 'PME', 'MasterAdmin'])
    );

DROP POLICY IF EXISTS private_grievances_read ON public.private_grievances;
CREATE POLICY private_grievances_read ON public.private_grievances
    FOR SELECT TO authenticated
    USING (
        reporter_user_id = (SELECT auth.uid())
        OR (
            (against_user_id IS NULL OR against_user_id <> (SELECT auth.uid()))
            AND public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin'])
        )
    );

CREATE OR REPLACE FUNCTION public.supervisor_meeting_log(
    p_met_on date,
    p_notes text,
    p_next_goal text DEFAULT ''
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
    INSERT INTO public.supervisor_meetings (student_user_id, met_on, notes, next_goal)
    VALUES (v_caller, COALESCE(p_met_on, public.ist_today()), btrim(p_notes), COALESCE(btrim(p_next_goal), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_grievance_submit(
    p_category text,
    p_summary text,
    p_against_user_id uuid DEFAULT NULL
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
    IF length(btrim(COALESCE(p_summary, ''))) < 10 THEN
        RAISE EXCEPTION 'Summary must be at least 10 characters';
    END IF;
    INSERT INTO public.private_grievances (reporter_user_id, against_user_id, category, summary)
    VALUES (v_caller, p_against_user_id, COALESCE(btrim(p_category), 'Academic'), btrim(p_summary))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── 6.3 (TS3) Equipment Faults & Calibration ──

CREATE TABLE IF NOT EXISTS public.equipment_faults (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    equipment_id text NOT NULL,
    reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fault_summary text NOT NULL CHECK (length(btrim(fault_summary)) > 0),
    severity text NOT NULL DEFAULT 'DOWN' CHECK (severity IN ('DOWN', 'CALIBRATION_DUE', 'MINOR')),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REPAIR', 'RESOLVED')),
    opened_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

ALTER TABLE public.equipment_faults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_faults_read ON public.equipment_faults;
CREATE POLICY equipment_faults_read ON public.equipment_faults FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.equipment_fault_report(
    p_equipment_id text,
    p_summary text,
    p_severity text DEFAULT 'DOWN'
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
    INSERT INTO public.equipment_faults (equipment_id, reported_by, fault_summary, severity)
    VALUES (p_equipment_id, v_caller, btrim(p_summary), COALESCE(p_severity, 'DOWN'))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.equipment_fault_resolve(p_fault_id uuid)
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
    IF NOT public.has_any_role(ARRAY['Technician', 'HOD', 'HoD', 'DivisionHead', 'Director', 'MasterAdmin', 'SystemAdmin']) THEN
        RAISE EXCEPTION 'Not authorized to resolve equipment faults';
    END IF;
    UPDATE public.equipment_faults SET status = 'RESOLVED', resolved_at = now() WHERE id = p_fault_id;
END;
$$;

-- ── 6.4 (CM7) Meeting Transcripts ──

CREATE TABLE IF NOT EXISTS public.meeting_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    format text NOT NULL DEFAULT 'TEXT' CHECK (format IN ('TEXT', 'VTT', 'DOCX')),
    content text NOT NULL DEFAULT '',
    uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (meeting_id)
);

ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_transcripts_read ON public.meeting_transcripts;
CREATE POLICY meeting_transcripts_read ON public.meeting_transcripts
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m WHERE m.id = meeting_transcripts.meeting_id AND public.committee_can_read(m.committee_id)
    ));

CREATE OR REPLACE FUNCTION public.meeting_transcript_save(
    p_meeting_id uuid,
    p_format text,
    p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT committee_id INTO v_committee_id FROM public.meetings WHERE id = p_meeting_id;
    IF v_committee_id IS NULL OR NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to upload transcript for this meeting';
    END IF;
    INSERT INTO public.meeting_transcripts (meeting_id, format, content, uploaded_by)
    VALUES (p_meeting_id, COALESCE(p_format, 'TEXT'), COALESCE(p_content, ''), v_caller)
    ON CONFLICT (meeting_id) DO UPDATE
       SET format = EXCLUDED.format,
           content = EXCLUDED.content,
           uploaded_by = v_caller,
           uploaded_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── 6.5 (CD12 + CD15 + CD17) No-Dues Clearance & Campus Requests ──

CREATE TABLE IF NOT EXISTS public.no_dues_clearances (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    applicant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    library_ok boolean NOT NULL DEFAULT false,
    stores_ok boolean NOT NULL DEFAULT false,
    accounts_ok boolean NOT NULL DEFAULT false,
    it_ok boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'CLEARED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('VEHICLE', 'GUEST_ROOM', 'CAMPUS_UTILITY')),
    requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    needed_on date NOT NULL,
    details text NOT NULL CHECK (length(btrim(details)) > 0),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.no_dues_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_dues_read ON public.no_dues_clearances;
CREATE POLICY no_dues_read ON public.no_dues_clearances
    FOR SELECT TO authenticated
    USING (
        applicant_user_id = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HRAdmin', 'FinanceAdmin', 'HOD', 'DivisionHead'])
    );

DROP POLICY IF EXISTS campus_requests_read ON public.campus_requests;
CREATE POLICY campus_requests_read ON public.campus_requests
    FOR SELECT TO authenticated
    USING (
        requested_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HOD', 'DivisionHead'])
    );

CREATE OR REPLACE FUNCTION public.no_dues_request()
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
    INSERT INTO public.no_dues_clearances (applicant_user_id) VALUES (v_caller) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.no_dues_signoff(
    p_clearance_id uuid,
    p_desk text
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
    IF NOT public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'HRAdmin', 'FinanceAdmin', 'HOD', 'DivisionHead']) THEN
        RAISE EXCEPTION 'Not authorized to sign off No-Dues desk';
    END IF;
    UPDATE public.no_dues_clearances
       SET library_ok = CASE WHEN p_desk = 'LIBRARY' THEN true ELSE library_ok END,
           stores_ok = CASE WHEN p_desk = 'STORES' THEN true ELSE stores_ok END,
           accounts_ok = CASE WHEN p_desk = 'ACCOUNTS' THEN true ELSE accounts_ok END,
           it_ok = CASE WHEN p_desk = 'IT' THEN true ELSE it_ok END
     WHERE id = p_clearance_id;

    UPDATE public.no_dues_clearances
       SET status = 'CLEARED'
     WHERE id = p_clearance_id
       AND library_ok AND stores_ok AND accounts_ok AND it_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.campus_request_create(
    p_kind text,
    p_needed_on date,
    p_details text
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
    INSERT INTO public.campus_requests (kind, requested_by, needed_on, details)
    VALUES (p_kind, v_caller, p_needed_on, btrim(p_details))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── 6.8 (C3 + D2) Proposal Evaluation Rubric & Document Versioning ──

CREATE TABLE IF NOT EXISTS public.proposal_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    evaluator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    novelty_score integer NOT NULL CHECK (novelty_score BETWEEN 1 AND 10),
    feasibility_score integer NOT NULL CHECK (feasibility_score BETWEEN 1 AND 10),
    impact_score integer NOT NULL CHECK (impact_score BETWEEN 1 AND 10),
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (proposal_id, evaluator_user_id)
);

ALTER TABLE public.proposal_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposal_evaluations_read ON public.proposal_evaluations;
CREATE POLICY proposal_evaluations_read ON public.proposal_evaluations
    FOR SELECT TO authenticated
    USING (
        evaluator_user_id = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin', 'SystemAdmin', 'HOD', 'DivisionHead'])
    );

CREATE OR REPLACE FUNCTION public.proposal_rubric_score(
    p_proposal_id uuid,
    p_novelty integer,
    p_feasibility integer,
    p_impact integer,
    p_notes text DEFAULT ''
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
    IF NOT public.has_any_role(ARRAY['Director', 'PME', 'MasterAdmin', 'SystemAdmin', 'HOD', 'DivisionHead', 'EmpoweredCommittee']) THEN
        RAISE EXCEPTION 'Not authorized to score proposal rubric';
    END IF;
    INSERT INTO public.proposal_evaluations (proposal_id, evaluator_user_id, novelty_score, feasibility_score, impact_score, notes)
    VALUES (p_proposal_id, v_caller, p_novelty, p_feasibility, p_impact, COALESCE(btrim(p_notes), ''))
    ON CONFLICT (proposal_id, evaluator_user_id) DO UPDATE
       SET novelty_score = EXCLUDED.novelty_score,
           feasibility_score = EXCLUDED.feasibility_score,
           impact_score = EXCLUDED.impact_score,
           notes = EXCLUDED.notes
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS supersedes uuid REFERENCES public.documents(id) ON DELETE SET NULL;

GRANT EXECUTE ON FUNCTION
    public.technology_log_step(uuid, text, text, integer, uuid),
    public.outside_contact_log(uuid, text, text, date),
    public.supervisor_meeting_log(date, text, text),
    public.private_grievance_submit(text, text, uuid),
    public.equipment_fault_report(text, text, text),
    public.equipment_fault_resolve(uuid),
    public.meeting_transcript_save(uuid, text, text),
    public.no_dues_request(),
    public.no_dues_signoff(uuid, text),
    public.campus_request_create(text, date, text),
    public.proposal_rubric_score(uuid, integer, integer, integer, text)
TO authenticated;
