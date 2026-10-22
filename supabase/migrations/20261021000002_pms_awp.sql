-- ============================================================
-- 20261021000002_pms_awp
-- Part V — Annual Work Plan (CSIR PMS Guidelines 2026, §5.E).
-- Design: docs/superpowers/specs/2026-10-21-pms-awp-workflow-design.md
--
-- One AWP per scientist per reporting year, keyed on staff."ID" (works for
-- staff without a SURYA login, e.g. imported 2026-27 paper AWPs).
-- Flow: DRAFT → WITH_RO → WITH_RVO → WITH_DIRECTOR → APPROVED, with
-- RETURNED as the consensus loop. When the RO or Reviewing Officer is the
-- Director the Director's one decision covers those steps (§5.E.a.v).
-- Every status change is an RPC below; the table is read-only to clients.
-- Not covered by the Nov 30 lock: the AWP year is not the appraisal cycle.
-- ============================================================

-- ── 1. Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pms_awps (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id              text NOT NULL REFERENCES public.staff("ID") ON DELETE RESTRICT,
    scientist_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reporting_year        text NOT NULL CHECK (reporting_year ~ '^\d{4}-\d{2}$'),
    status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','WITH_RO','WITH_RVO','WITH_DIRECTOR','RETURNED','APPROVED')),
    part_a                jsonb NOT NULL DEFAULT '{}',
    activity_split        jsonb NOT NULL DEFAULT '[]',
    projects              jsonb NOT NULL DEFAULT '[]',
    objectives            jsonb NOT NULL DEFAULT '{}',
    development           jsonb NOT NULL DEFAULT '{}',
    institutional_work    text NOT NULL DEFAULT '',
    other                 text NOT NULL DEFAULT '',
    reporting_officer_id  text REFERENCES public.staff("ID") ON DELETE SET NULL,
    reviewing_officer_id  text REFERENCES public.staff("ID") ON DELETE SET NULL,
    ro_verdict            text CHECK (ro_verdict IN ('REASONABLE','NOT_REASONABLE')),
    ro_reasons            text,
    ro_at                 timestamptz,
    rvo_remarks           text,
    rvo_at                timestamptz,
    director_decision     text CHECK (director_decision IN ('ACCEPTED','MODIFIED')),
    director_remarks      text,
    approved_at           timestamptz,
    approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    communicated_at       timestamptz,
    return_reasons        text,
    source                text NOT NULL DEFAULT 'ONLINE'
                          CHECK (source IN ('ONLINE','IMPORTED','BLANK_FORWARDED')),
    source_pdf_path       text,
    submitted_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (staff_id, reporting_year)
);

CREATE INDEX IF NOT EXISTS pms_awps_status_idx ON public.pms_awps(status);
CREATE INDEX IF NOT EXISTS pms_awps_ro_idx     ON public.pms_awps(reporting_officer_id);

CREATE TRIGGER trg_pms_awps_updated_at
    BEFORE UPDATE ON public.pms_awps
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- §5.E.a.vii — revisions in the first six months, Director approves.
CREATE TABLE IF NOT EXISTS public.pms_awp_revisions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    awp_id        uuid NOT NULL REFERENCES public.pms_awps(id) ON DELETE CASCADE,
    initiated_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reasons       text NOT NULL CHECK (length(trim(reasons)) >= 20),
    before        jsonb NOT NULL,
    after         jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at    timestamptz,
    decision_remarks text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pms_awp_revisions_awp_idx ON public.pms_awp_revisions(awp_id);

-- ── 2. Helpers ────────────────────────────────────────────────────────────
-- Plain (invoker) functions: they only compute values. When called from a
-- SECURITY DEFINER RPC they run as its owner; called directly they see only
-- what the caller already may.

CREATE OR REPLACE FUNCTION public.pms_awp_total(p_split jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(sum((r->>'timePct')::numeric), 0)::int
      FROM jsonb_array_elements(coalesce(p_split, '[]'::jsonb)) r;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_content(a public.pms_awps)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'partA', a.part_a, 'activitySplit', a.activity_split, 'projects', a.projects,
        'objectives', a.objectives, 'development', a.development,
        'institutionalWork', a.institutional_work, 'other', a.other);
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_director_staff_id()
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT s."ID" FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.user_id AND ur.role = 'Director'
     ORDER BY s."ID" LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_notify(p_staff_id text, p_type text, p_title text, p_body text)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.pms_notifications (user_id, type, title, body)
    SELECT s.user_id, p_type, p_title, p_body
      FROM public.staff s WHERE s."ID" = p_staff_id AND s.user_id IS NOT NULL;
$$;

-- Read gate for the full AWP row: the scientist, their Reporting and
-- Reviewing Officers, the Director and PMS admins. Committees do NOT read
-- the table — they get a copy with confidential projects stripped through
-- pms_awp_for_report() below, so the redaction is enforced server-side.
-- SECURITY DEFINER because it consults staff rows the caller may not see.
CREATE OR REPLACE FUNCTION public.pms_awp_can_read(p_staff_id text, p_ro text, p_rvo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL AND (
           public.pms_is_admin()
        OR public.user_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = p_staff_id AND s.user_id = auth.uid())
        OR public.caller_staff_id() IN (p_ro, p_rvo)
    );
$$;

-- Projects with confidential=true lose everything but their kind.
CREATE OR REPLACE FUNCTION public.pms_awp_redact_projects(p_projects jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(jsonb_agg(
        CASE WHEN coalesce((p->>'confidential')::boolean, false)
             THEN jsonb_build_object('kind', p->'kind', 'details', '', 'objectives', '',
                                     'resources', '', 'confidential', true)
             ELSE p END), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(p_projects, '[]'::jsonb)) p;
$$;

-- ── 3. RLS + grants ───────────────────────────────────────────────────────

ALTER TABLE public.pms_awps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_awp_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "awps_select" ON public.pms_awps FOR SELECT TO authenticated
    USING (public.pms_awp_can_read(staff_id, reporting_officer_id, reviewing_officer_id));

CREATE POLICY "awp_revisions_select" ON public.pms_awp_revisions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_awps a WHERE a.id = awp_id));

-- All writes go through the RPCs below.
REVOKE ALL ON public.pms_awps, public.pms_awp_revisions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_awps, public.pms_awp_revisions FROM authenticated;
GRANT SELECT ON public.pms_awps, public.pms_awp_revisions TO authenticated;

-- ── 4. RPCs ───────────────────────────────────────────────────────────────

-- Committee view: the AWP for the reporting year of a report the caller may
-- read (same readers as reports_select), confidential projects redacted.
-- Looks the scientist up through staff.user_id OR the AWP's own copy, so a
-- reviewer from another division (who cannot see the staff row) still gets it.
CREATE OR REPLACE FUNCTION public.pms_awp_for_report(p_report_id uuid)
RETURNS SETOF public.pms_awps LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_awp    public.pms_awps%ROWTYPE;
    v_year   text;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF NOT COALESCE(
           v_report.scientist_id = auth.uid()
        OR public.pms_is_admin()
        OR public.user_has_role('Director')
        OR public.user_has_role('EmpoweredCommittee')
        OR public.pms_is_evaluation_committee_member(v_report.cycle_id)
        OR public.pms_is_grievance_member(v_report.cycle_id)
        OR EXISTS (SELECT 1 FROM public.pms_evaluations e
                    WHERE e.report_id = p_report_id AND e.evaluator_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                    WHERE m.cycle_id = v_report.cycle_id AND m.user_id = auth.uid()), false) THEN
        RETURN;
    END IF;

    v_year := to_char(coalesce(v_report.period_from,
                               (SELECT start_date FROM public.appraisal_cycles WHERE id = v_report.cycle_id)), 'YYYY');
    v_year := v_year || '-' || lpad(((v_year::int + 1) % 100)::text, 2, '0');

    SELECT * INTO v_awp FROM public.pms_awps a
     WHERE a.reporting_year = v_year
       AND (a.scientist_user_id = v_report.scientist_id
            OR a.staff_id IN (SELECT s."ID" FROM public.staff s WHERE s.user_id = v_report.scientist_id))
     LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    v_awp.projects := public.pms_awp_redact_projects(v_awp.projects);
    RETURN NEXT v_awp;
END;
$$;

-- Scientist creates or edits their own AWP while DRAFT / RETURNED.
CREATE OR REPLACE FUNCTION public.pms_awp_save_draft(p_staff_id text, p_year text, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_staff public.staff%ROWTYPE;
    v_awp   public.pms_awps%ROWTYPE;
    v_id    uuid;
BEGIN
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND OR v_staff.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Not your Annual Work Plan';
    END IF;

    SELECT * INTO v_awp FROM public.pms_awps
     WHERE staff_id = p_staff_id AND reporting_year = p_year FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pms_awps (staff_id, scientist_user_id, reporting_year,
                                     reporting_officer_id, reviewing_officer_id)
        VALUES (p_staff_id, auth.uid(), p_year,
                coalesce(v_staff."ReportingID",
                         (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division")),
                public.pms_awp_director_staff_id())
        RETURNING id INTO v_id;
    ELSIF v_awp.status NOT IN ('DRAFT','RETURNED') THEN
        RAISE EXCEPTION 'AWP can only be edited while DRAFT or RETURNED';
    ELSE
        v_id := v_awp.id;
    END IF;

    UPDATE public.pms_awps SET
        part_a             = coalesce(p_payload->'partA', '{}'),
        activity_split     = coalesce(p_payload->'activitySplit', '[]'),
        projects           = coalesce(p_payload->'projects', '[]'),
        objectives         = coalesce(p_payload->'objectives', '{}'),
        development        = coalesce(p_payload->'development', '{}'),
        institutional_work = coalesce(p_payload->>'institutionalWork', ''),
        other              = coalesce(p_payload->>'other', '')
     WHERE id = v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_submit(p_awp_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_next text;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = v_awp.staff_id AND s.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Not your Annual Work Plan';
    END IF;
    IF v_awp.status NOT IN ('DRAFT','RETURNED') THEN RAISE EXCEPTION 'AWP is not a draft'; END IF;
    IF public.pms_awp_total(v_awp.activity_split) <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;
    IF v_awp.reporting_officer_id IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;

    v_next := CASE WHEN v_awp.reporting_officer_id = public.pms_awp_director_staff_id()
                   THEN 'WITH_DIRECTOR' ELSE 'WITH_RO' END;

    UPDATE public.pms_awps SET status = v_next, submitted_at = now(), return_reasons = NULL
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_SUBMITTED', 'pms_awps', p_awp_id, jsonb_build_object('status', v_next));

    PERFORM public.pms_awp_notify(
        CASE v_next WHEN 'WITH_RO' THEN v_awp.reporting_officer_id ELSE public.pms_awp_director_staff_id() END,
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your review.');
END;
$$;

-- p_payload: only for a BLANK_FORWARDED AWP, where the RO fills the plan in
-- on the scientist's behalf (§5.E.a.iii).
CREATE OR REPLACE FUNCTION public.pms_awp_ro_review(
    p_awp_id uuid, p_verdict text, p_reasons text, p_payload jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_director text := public.pms_awp_director_staff_id();
    v_next text;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(public.caller_staff_id() = v_awp.reporting_officer_id, false) THEN
        RAISE EXCEPTION 'Not the Reporting Officer';
    END IF;
    IF v_awp.status <> 'WITH_RO' THEN RAISE EXCEPTION 'AWP is not waiting for the Reporting Officer'; END IF;
    IF p_verdict NOT IN ('REASONABLE','NOT_REASONABLE') THEN RAISE EXCEPTION 'Invalid verdict'; END IF;
    IF p_verdict = 'NOT_REASONABLE' AND length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons (at least 20 characters) are required when the plan does not appear reasonable';
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_awp.source <> 'BLANK_FORWARDED' THEN
            RAISE EXCEPTION 'Only a blank-forwarded AWP can be filled in by the Reporting Officer';
        END IF;
        IF public.pms_awp_total(p_payload->'activitySplit') <> 100 THEN
            RAISE EXCEPTION 'Time committed must total 100%%';
        END IF;
        UPDATE public.pms_awps SET
            part_a             = coalesce(p_payload->'partA', '{}'),
            activity_split     = coalesce(p_payload->'activitySplit', '[]'),
            projects           = coalesce(p_payload->'projects', '[]'),
            objectives         = coalesce(p_payload->'objectives', '{}'),
            development        = coalesce(p_payload->'development', '{}'),
            institutional_work = coalesce(p_payload->>'institutionalWork', ''),
            other              = coalesce(p_payload->>'other', '')
         WHERE id = p_awp_id;
    ELSIF v_awp.source = 'BLANK_FORWARDED' AND public.pms_awp_total(v_awp.activity_split) <> 100 THEN
        RAISE EXCEPTION 'Fill in the blank-forwarded plan before reviewing it';
    END IF;

    v_next := CASE WHEN v_awp.reviewing_officer_id IS NULL OR v_awp.reviewing_officer_id = v_director
                   THEN 'WITH_DIRECTOR' ELSE 'WITH_RVO' END;

    UPDATE public.pms_awps SET status = v_next, ro_verdict = p_verdict, ro_reasons = p_reasons, ro_at = now()
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RO_REVIEWED', 'pms_awps', p_awp_id, jsonb_build_object('verdict', p_verdict));

    PERFORM public.pms_awp_notify(
        CASE v_next WHEN 'WITH_RVO' THEN v_awp.reviewing_officer_id ELSE v_director END,
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your review.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_rvo_review(p_awp_id uuid, p_remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(public.caller_staff_id() = v_awp.reviewing_officer_id, false) THEN
        RAISE EXCEPTION 'Not the Reviewing Officer';
    END IF;
    IF v_awp.status <> 'WITH_RVO' THEN RAISE EXCEPTION 'AWP is not waiting for the Reviewing Officer'; END IF;

    UPDATE public.pms_awps SET status = 'WITH_DIRECTOR', rvo_remarks = p_remarks, rvo_at = now()
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RVO_REVIEWED', 'pms_awps', p_awp_id, '{}');

    PERFORM public.pms_awp_notify(public.pms_awp_director_staff_id(),
        'awp_review_needed', 'Annual Work Plan waiting for you',
        'An Annual Work Plan for ' || v_awp.reporting_year || ' needs your approval.');
END;
$$;

-- §5.E.a.iv — Director accepts or modifies; final.
CREATE OR REPLACE FUNCTION public.pms_awp_director_decide(
    p_awp_id uuid, p_decision text, p_remarks text, p_payload jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    -- §5.E.a.iv: the Director's decision, not an administrator's. Paper
    -- approvals already given are recorded through pms_awp_import instead.
    IF NOT public.user_has_role('Director') THEN
        RAISE EXCEPTION 'Only the Director can approve an Annual Work Plan';
    END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF v_awp.status <> 'WITH_DIRECTOR' THEN RAISE EXCEPTION 'AWP is not waiting for the Director'; END IF;
    IF p_decision NOT IN ('ACCEPTED','MODIFIED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
    IF p_decision = 'MODIFIED' AND (p_payload IS NULL OR length(trim(coalesce(p_remarks, ''))) < 20) THEN
        RAISE EXCEPTION 'A modification needs the revised plan and remarks (at least 20 characters)';
    END IF;
    IF p_decision = 'MODIFIED' AND public.pms_awp_total(p_payload->'activitySplit') <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;

    IF p_decision = 'MODIFIED' THEN
        UPDATE public.pms_awps SET
            part_a             = coalesce(p_payload->'partA', part_a),
            activity_split     = coalesce(p_payload->'activitySplit', activity_split),
            projects           = coalesce(p_payload->'projects', projects),
            objectives         = coalesce(p_payload->'objectives', objectives),
            development        = coalesce(p_payload->'development', development),
            institutional_work = coalesce(p_payload->>'institutionalWork', institutional_work),
            other              = coalesce(p_payload->>'other', other)
         WHERE id = p_awp_id;
    END IF;

    UPDATE public.pms_awps SET
        status            = 'APPROVED',
        director_decision = p_decision,
        director_remarks  = p_remarks,
        approved_at       = now(),
        approved_by       = auth.uid(),
        communicated_at   = now(),
        -- RO step was skipped because the Director is the RO (§5.E.a.v)
        ro_verdict        = coalesce(ro_verdict, 'REASONABLE'),
        ro_reasons        = CASE WHEN ro_verdict IS NULL THEN 'Director is the Reporting Officer' ELSE ro_reasons END,
        ro_at             = coalesce(ro_at, now())
     WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_APPROVED', 'pms_awps', p_awp_id, jsonb_build_object('decision', p_decision));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_approved',
        'Your Annual Work Plan is approved',
        'Your Annual Work Plan for ' || v_awp.reporting_year || ' has been approved by the Director'
            || CASE WHEN p_decision = 'MODIFIED' THEN ' with modifications.' ELSE '.' END);
END;
$$;

-- Consensus loop (§5.E.a.ii): the current reviewer sends it back.
CREATE OR REPLACE FUNCTION public.pms_awp_return(p_awp_id uuid, p_reasons text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_me  text := public.caller_staff_id();
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(
           (public.pms_is_admin() AND v_awp.status <> 'WITH_DIRECTOR')
        OR (v_awp.status = 'WITH_RO'       AND v_me = v_awp.reporting_officer_id)
        OR (v_awp.status = 'WITH_RVO'      AND v_me = v_awp.reviewing_officer_id)
        OR (v_awp.status = 'WITH_DIRECTOR' AND public.user_has_role('Director')), false) THEN
        RAISE EXCEPTION 'Only the current reviewer can return this AWP';
    END IF;
    IF v_awp.status NOT IN ('WITH_RO','WITH_RVO','WITH_DIRECTOR') THEN
        RAISE EXCEPTION 'AWP is not under review';
    END IF;
    IF length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons must be at least 20 characters';
    END IF;

    UPDATE public.pms_awps SET status = 'RETURNED', return_reasons = p_reasons WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RETURNED', 'pms_awps', p_awp_id, jsonb_build_object('reasons', p_reasons));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_returned',
        'Your Annual Work Plan was returned',
        'Please revise your Annual Work Plan for ' || v_awp.reporting_year || ': ' || p_reasons);
END;
$$;

-- §5.E.a.iii — no AWP in time: blank Part V goes to the Reporting Officer.
CREATE OR REPLACE FUNCTION public.pms_awp_forward_blank(p_staff_id text, p_year text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_staff public.staff%ROWTYPE;
    v_awp   public.pms_awps%ROWTYPE;
    v_ro    text;
    v_id    uuid;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can forward a blank AWP'; END IF;
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;

    v_ro := coalesce(v_staff."ReportingID",
                     (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division"));

    SELECT * INTO v_awp FROM public.pms_awps
     WHERE staff_id = p_staff_id AND reporting_year = p_year FOR UPDATE;
    IF coalesce(v_awp.reporting_officer_id, v_ro) IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;
    IF FOUND AND v_awp.status NOT IN ('DRAFT','RETURNED') THEN
        RAISE EXCEPTION 'AWP has already been submitted';
    END IF;

    IF NOT FOUND THEN
        INSERT INTO public.pms_awps (staff_id, scientist_user_id, reporting_year,
                                     reporting_officer_id, reviewing_officer_id)
        VALUES (p_staff_id, v_staff.user_id, p_year, v_ro, public.pms_awp_director_staff_id())
        RETURNING id INTO v_id;
    ELSE
        v_id := v_awp.id;
        v_ro := coalesce(v_awp.reporting_officer_id, v_ro);
    END IF;

    UPDATE public.pms_awps SET
        status = CASE WHEN v_ro = public.pms_awp_director_staff_id() THEN 'WITH_DIRECTOR' ELSE 'WITH_RO' END,
        source = 'BLANK_FORWARDED',
        submitted_at = now()
     WHERE id = v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_BLANK_FORWARDED', 'pms_awps', v_id, '{}');

    PERFORM public.pms_awp_notify(v_ro, 'awp_review_needed', 'Blank Annual Work Plan forwarded',
        'A scientist did not submit an Annual Work Plan for ' || p_year || '. Please take action.');
    RETURN v_id;
END;
$$;

-- Admin import of an AWP read from a PDF. Initial status reflects how far
-- the paper chain already went.
CREATE OR REPLACE FUNCTION public.pms_awp_import(
    p_staff_id text, p_year text, p_payload jsonb, p_status text,
    p_pdf_path text, p_ro_verdict text, p_ro_date date, p_approved_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_staff    public.staff%ROWTYPE;
    v_ro       text;
    v_director text := public.pms_awp_director_staff_id();
    v_status   text := p_status;
    v_id       uuid;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can import AWPs'; END IF;
    IF p_status NOT IN ('APPROVED','WITH_DIRECTOR','WITH_RO') THEN RAISE EXCEPTION 'Invalid import status'; END IF;
    IF p_ro_verdict IS NOT NULL AND p_ro_verdict NOT IN ('REASONABLE','NOT_REASONABLE') THEN
        RAISE EXCEPTION 'Invalid verdict';
    END IF;
    SELECT * INTO v_staff FROM public.staff WHERE "ID" = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.pms_awps WHERE staff_id = p_staff_id AND reporting_year = p_year) THEN
        RAISE EXCEPTION 'AWP already exists for this scientist and year';
    END IF;

    v_ro := coalesce(v_staff."ReportingID",
                     (SELECT d."divHoDID" FROM public.divisions d WHERE d."divCode" = v_staff."Division"));
    IF v_status = 'WITH_RO' AND v_ro IS NULL THEN
        RAISE EXCEPTION 'No Reporting Officer on record; ask HR to set one';
    END IF;
    IF v_status = 'WITH_RO' AND v_ro = v_director THEN v_status := 'WITH_DIRECTOR'; END IF;

    INSERT INTO public.pms_awps (
        staff_id, scientist_user_id, reporting_year, status,
        part_a, activity_split, projects, objectives, development, institutional_work, other,
        reporting_officer_id, reviewing_officer_id,
        ro_verdict, ro_at, director_decision, approved_at, approved_by, communicated_at,
        source, source_pdf_path, submitted_at)
    VALUES (
        p_staff_id, v_staff.user_id, p_year, v_status,
        coalesce(p_payload->'partA', '{}'), coalesce(p_payload->'activitySplit', '[]'),
        coalesce(p_payload->'projects', '[]'), coalesce(p_payload->'objectives', '{}'),
        coalesce(p_payload->'development', '{}'), coalesce(p_payload->>'institutionalWork', ''),
        coalesce(p_payload->>'other', ''),
        v_ro, v_director,
        CASE WHEN v_status = 'WITH_RO' THEN NULL ELSE coalesce(p_ro_verdict, 'REASONABLE') END,
        CASE WHEN v_status = 'WITH_RO' THEN NULL ELSE coalesce(p_ro_date::timestamptz, now()) END,
        CASE WHEN v_status = 'APPROVED' THEN 'ACCEPTED' END,
        CASE WHEN v_status = 'APPROVED' THEN coalesce(p_approved_date::timestamptz, now()) END,
        CASE WHEN v_status = 'APPROVED' THEN auth.uid() END,
        CASE WHEN v_status = 'APPROVED' THEN now() END,
        'IMPORTED', p_pdf_path, now())
    RETURNING id INTO v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_IMPORTED', 'pms_awps', v_id,
            jsonb_build_object('status', v_status, 'pdf', p_pdf_path));
    RETURN v_id;
END;
$$;

-- §5.E.a.vii — revision within the first six months of the reporting year.
CREATE OR REPLACE FUNCTION public.pms_awp_request_revision(p_awp_id uuid, p_reasons text, p_after jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
    v_me  text := public.caller_staff_id();
    v_id  uuid;
BEGIN
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF NOT COALESCE(
           public.pms_is_admin()
        OR public.user_has_role('Director')
        OR v_me IN (v_awp.staff_id, v_awp.reporting_officer_id, v_awp.reviewing_officer_id), false) THEN
        RAISE EXCEPTION 'Not allowed to revise this AWP';
    END IF;
    IF v_awp.status <> 'APPROVED' THEN RAISE EXCEPTION 'Only an approved AWP can be revised'; END IF;
    -- Lab time (IST), not UTC: 00:00–05:30 IST on 1 Oct is already closed.
    IF (now() AT TIME ZONE 'Asia/Kolkata')::date > make_date(left(v_awp.reporting_year, 4)::int, 9, 30) THEN
        RAISE EXCEPTION 'Revision window (first six months) has closed';
    END IF;
    IF length(trim(coalesce(p_reasons, ''))) < 20 THEN
        RAISE EXCEPTION 'Reasons must be at least 20 characters';
    END IF;
    IF public.pms_awp_total(p_after->'activitySplit') <> 100 THEN
        RAISE EXCEPTION 'Time committed must total 100%%';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pms_awp_revisions WHERE awp_id = p_awp_id AND status = 'PENDING') THEN
        RAISE EXCEPTION 'A revision is already pending';
    END IF;

    INSERT INTO public.pms_awp_revisions (awp_id, initiated_by, reasons, before, after)
    VALUES (p_awp_id, auth.uid(), p_reasons, public.pms_awp_content(v_awp), p_after)
    RETURNING id INTO v_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_REVISION_REQUESTED', 'pms_awps', p_awp_id, jsonb_build_object('revision', v_id));

    PERFORM public.pms_awp_notify(public.pms_awp_director_staff_id(), 'awp_review_needed',
        'Annual Work Plan revision requested',
        'A revision of an Annual Work Plan for ' || v_awp.reporting_year || ' needs your approval.');
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pms_awp_decide_revision(p_revision_id uuid, p_approve boolean, p_remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rev public.pms_awp_revisions%ROWTYPE;
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    IF NOT public.user_has_role('Director') THEN
        RAISE EXCEPTION 'Only the Director can decide an AWP revision';
    END IF;
    SELECT * INTO v_rev FROM public.pms_awp_revisions WHERE id = p_revision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
    IF v_rev.status <> 'PENDING' THEN RAISE EXCEPTION 'Revision already decided'; END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = v_rev.awp_id FOR UPDATE;

    UPDATE public.pms_awp_revisions SET
        status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
        decided_by = auth.uid(), decided_at = now(), decision_remarks = p_remarks
     WHERE id = p_revision_id;

    IF p_approve THEN
        UPDATE public.pms_awps SET
            part_a             = coalesce(v_rev.after->'partA', part_a),
            activity_split     = coalesce(v_rev.after->'activitySplit', activity_split),
            projects           = coalesce(v_rev.after->'projects', projects),
            objectives         = coalesce(v_rev.after->'objectives', objectives),
            development        = coalesce(v_rev.after->'development', development),
            institutional_work = coalesce(v_rev.after->>'institutionalWork', institutional_work),
            other              = coalesce(v_rev.after->>'other', other),
            communicated_at    = now()
         WHERE id = v_rev.awp_id;
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_REVISION_DECIDED', 'pms_awps', v_rev.awp_id,
            jsonb_build_object('revision', p_revision_id, 'approved', p_approve));

    PERFORM public.pms_awp_notify(v_awp.staff_id, 'awp_revision_decided',
        'Annual Work Plan revision ' || CASE WHEN p_approve THEN 'approved' ELSE 'not approved' END,
        'The Director has decided the revision of your Annual Work Plan for ' || v_awp.reporting_year || '.');
END;
$$;

-- Admin override of the Reviewing Officer (defaults to the Director).
CREATE OR REPLACE FUNCTION public.pms_awp_set_reviewing_officer(p_awp_id uuid, p_staff_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_awp public.pms_awps%ROWTYPE;
BEGIN
    IF NOT public.pms_is_admin() THEN
        RAISE EXCEPTION 'Only PMS administrators can change the Reviewing Officer';
    END IF;
    SELECT * INTO v_awp FROM public.pms_awps WHERE id = p_awp_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AWP not found'; END IF;
    IF v_awp.status NOT IN ('DRAFT','RETURNED','WITH_RO') THEN
        RAISE EXCEPTION 'The Reviewing Officer can only change before the Reporting Officer has reviewed';
    END IF;
    IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    UPDATE public.pms_awps SET reviewing_officer_id = p_staff_id WHERE id = p_awp_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'AWP_RVO_SET', 'pms_awps', p_awp_id, jsonb_build_object('reviewing_officer', p_staff_id));
END;
$$;

-- Keep pms_awps.scientist_user_id in step when HR links (or relinks) a
-- staff row to a login, so an AWP imported before the scientist had an
-- account becomes theirs. Runs as owner: the staff write itself was already
-- authorized by staff RLS, and clients have no UPDATE on pms_awps.
CREATE OR REPLACE FUNCTION public.pms_awp_sync_staff_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.pms_awps SET scientist_user_id = NEW.user_id
     WHERE staff_id = NEW."ID" AND scientist_user_id IS DISTINCT FROM NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pms_awp_sync_staff_user
    AFTER UPDATE OF user_id ON public.staff
    FOR EACH ROW WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id)
    EXECUTE FUNCTION public.pms_awp_sync_staff_user();

-- ── 5. Storage — source PDFs ──────────────────────────────────────────────
-- Admins upload (import/<uuid>.pdf); anyone who can read the AWP that
-- references a file can read it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('awp-pdfs', 'awp-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "awp_pdfs_select" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'awp-pdfs'
           AND (public.pms_is_admin()
                OR EXISTS (SELECT 1 FROM public.pms_awps a WHERE a.source_pdf_path = name)));

CREATE POLICY "awp_pdfs_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'awp-pdfs' AND public.pms_is_admin());

CREATE POLICY "awp_pdfs_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'awp-pdfs' AND public.pms_is_admin());

-- ── 6. Function grants ────────────────────────────────────────────────────
-- Default privileges (20260718000007) hand authenticated EXECUTE on every
-- new function, so internal helpers must be revoked from it explicitly.
REVOKE EXECUTE ON FUNCTION
    public.pms_awp_notify(text, text, text, text),
    public.pms_awp_sync_staff_user()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
    public.pms_awp_can_read(text, text, text),
    public.pms_awp_for_report(uuid),
    public.pms_awp_save_draft(text, text, jsonb),
    public.pms_awp_submit(uuid),
    public.pms_awp_ro_review(uuid, text, text, jsonb),
    public.pms_awp_rvo_review(uuid, text),
    public.pms_awp_director_decide(uuid, text, text, jsonb),
    public.pms_awp_return(uuid, text),
    public.pms_awp_forward_blank(text, text),
    public.pms_awp_import(text, text, jsonb, text, text, text, date, date),
    public.pms_awp_request_revision(uuid, text, jsonb),
    public.pms_awp_decide_revision(uuid, boolean, text),
    public.pms_awp_set_reviewing_officer(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.pms_awp_can_read(text, text, text),
    public.pms_awp_for_report(uuid),
    public.pms_awp_save_draft(text, text, jsonb),
    public.pms_awp_submit(uuid),
    public.pms_awp_ro_review(uuid, text, text, jsonb),
    public.pms_awp_rvo_review(uuid, text),
    public.pms_awp_director_decide(uuid, text, text, jsonb),
    public.pms_awp_return(uuid, text),
    public.pms_awp_forward_blank(text, text),
    public.pms_awp_import(text, text, jsonb, text, text, text, date, date),
    public.pms_awp_request_revision(uuid, text, jsonb),
    public.pms_awp_decide_revision(uuid, boolean, text),
    public.pms_awp_set_reviewing_officer(uuid, text)
TO authenticated;
