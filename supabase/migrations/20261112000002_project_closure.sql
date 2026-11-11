-- ============================================================
-- Project lifecycle PL6 — closure and institutional memory
-- Plan: docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §5.4, §6.2, §7
-- Guidelines (April 2025) §8: completion report, RC in-principle approval,
-- Monitoring Committee, DG closure; financial statement and annexures.
--
--   1. project_completion_reports — the PI's report with the lessons
--      (§5.4); starting one moves the project to CLOSING. On submission the
--      financial statement and annexure list are compiled from the file.
--   2. project_completion_steps   — the closure route per track; the last
--      approval closes the project.
--   3. Archive                    — PME archives a closed project with the
--      published report (a PDF in the documents registry, so Ask SURYA
--      indexes it); an archived project is read-only.
--   4. project_lessons            — approved lessons, readable institute-wide.
--   5. Follow-on lineage          — proposals.parent_project_id.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Documents: the signed report and each closure step's scan ──────
ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_doc_type_check CHECK (
    doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'minutes',
                 'change_request', 'change_order', 'completion_report', 'closure_order', 'other'));

CREATE OR REPLACE FUNCTION public.project_caller_may_file(p_project_id text, p_doc_type text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.project_caller_is_office(p_project_id)
      OR (p_doc_type = 'milestone_evidence' AND public.project_caller_is_party(p_project_id))
      OR (p_doc_type IN ('change_request', 'completion_report') AND public.project_caller_is_pi(p_project_id))
      OR (p_doc_type IN ('change_order', 'closure_order') AND NOT public.project_caller_is_party(p_project_id)
          AND (public.caller_has_role('FinanceAdmin') OR public.caller_has_role('Director')
               OR EXISTS (SELECT 1 FROM public.projects pr JOIN public.project_schemes s ON s.code = pr.track
                           WHERE pr."ProjectID" = p_project_id AND s.leader_user_id = (SELECT auth.uid()))));
$$;

-- ── 2. The report ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_completion_reports (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            text NOT NULL UNIQUE REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED')),
    round                 int  NOT NULL DEFAULT 0,
    summary               text NOT NULL DEFAULT '',
    objectives_status     text CHECK (objectives_status IN ('MET', 'PARTLY_MET', 'NOT_MET')),
    objectives_reason     text NOT NULL DEFAULT '',
    what_worked           text NOT NULL DEFAULT '',
    what_did_not          text NOT NULL DEFAULT '',
    reusable_assets       text NOT NULL DEFAULT '',
    trl_target            int CHECK (trl_target BETWEEN 1 AND 9),
    trl_reached           int CHECK (trl_reached BETWEEN 1 AND 9),
    recommendations       text NOT NULL DEFAULT '',
    follow_on_ideas       text NOT NULL DEFAULT '',
    -- Compiled from the ledger and the file when submitted (guidelines §8.3).
    financial_statement   jsonb,
    annexures             jsonb,
    document_id           uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    decision_note         text,
    published_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    created_by            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    submitted_at          timestamptz,
    decided_at            timestamptz
);

CREATE TABLE IF NOT EXISTS public.project_completion_steps (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id   uuid NOT NULL REFERENCES public.project_completion_reports(id) ON DELETE CASCADE,
    round       int  NOT NULL,
    seq         int  NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('PME_VETTING', 'FINANCE', 'REVIEW_COMMITTEE', 'RESEARCH_COUNCIL',
                                              'DIRECTOR_APPROVAL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY')),
    status      text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'RETURNED', 'SKIPPED')),
    decided_by  uuid REFERENCES auth.users(id),
    decided_at  timestamptz,
    notes       text,
    document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (report_id, round, seq)
);

ALTER TABLE public.project_completion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_completion_steps   ENABLE ROW LEVEL SECURITY;

-- Whoever may see the project; the draft too, so co-PIs can read along.
DROP POLICY IF EXISTS "project_completion_reports_select" ON public.project_completion_reports;
CREATE POLICY "project_completion_reports_select" ON public.project_completion_reports
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_completion_reports.project_id));
DROP POLICY IF EXISTS "project_completion_steps_select" ON public.project_completion_steps;
CREATE POLICY "project_completion_steps_select" ON public.project_completion_steps
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.project_completion_reports r WHERE r.id = project_completion_steps.report_id));

REVOKE INSERT, UPDATE, DELETE ON public.project_completion_reports FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_completion_steps   FROM authenticated;
GRANT SELECT ON public.project_completion_reports TO authenticated, service_role;
GRANT SELECT ON public.project_completion_steps   TO authenticated, service_role;

-- ULIP: PME, the review committee recommends, the Director approves.
-- HQ (§8): PME, Finance signs the statement, RC in-principle, Monitoring
-- Committee, DG closure.
CREATE OR REPLACE FUNCTION public.project_completion_step_kinds(p_track text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_track
    WHEN 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    ELSE ARRAY['PME_VETTING', 'FINANCE', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
  END;
$$;

-- Year- and head-wise allocation against expenditure, with receipts per year.
CREATE OR REPLACE FUNCTION public.project_financial_statement(p_project_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'heads', coalesce((SELECT jsonb_agg(jsonb_build_object('fiscal_year', h.fiscal_year, 'head', h.head,
                                                            'sanctioned', h.sanctioned, 'spent', h.spent)
                                        ORDER BY h.fiscal_year, h.head)
                         FROM public.project_head_position(p_project_id) h), '[]'::jsonb),
    'received', coalesce((SELECT jsonb_agg(jsonb_build_object('fiscal_year', r.fiscal_year, 'amount', r.amount) ORDER BY r.fiscal_year)
                            FROM (SELECT fiscal_year, sum(amount) AS amount FROM public.project_fund_receipts
                                   WHERE project_id = p_project_id GROUP BY fiscal_year) r), '[]'::jsonb),
    'sanctioned', coalesce((SELECT sum(amount) FROM public.project_budget_lines WHERE project_id = p_project_id), 0),
    'received_total', coalesce((SELECT sum(amount) FROM public.project_fund_receipts WHERE project_id = p_project_id), 0),
    'spent_total', coalesce((SELECT sum(amount) FROM public.project_expenditure WHERE project_id = p_project_id), 0));
$$;

-- The annexures §8.3 asks for, from what is on file: the sanction, every
-- approved change order, and the minutes of every review held (a review
-- held without minutes on file is listed as missing).
CREATE OR REPLACE FUNCTION public.project_completion_annexures(p_project_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY a->>'group', a->>'date'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('group', '1 Sanction', 'label', 'Sanction order ' || coalesce(p.sanction_ref, '(no number)'),
                              'date', p.sanction_date, 'missing', p.sanction_ref IS NULL) AS a
      FROM public.projects p WHERE p."ProjectID" = p_project_id
    UNION ALL
    SELECT jsonb_build_object('group', '2 Orders', 'label',
                              initcap(lower(replace(c.kind, '_', ' '))) || ' order ' || coalesce(c.order_no, '(recorded without a number)')
                                  || coalesce(', IFD ' || c.ifd_file_no, ''),
                              'date', coalesce(c.order_date, c.decided_at::date), 'missing', false)
      FROM public.project_change_requests c WHERE c.project_id = p_project_id AND c.status = 'APPROVED'
    UNION ALL
    SELECT jsonb_build_object('group', '3 Minutes', 'label', s.body || ' (' || s.period_label || ') minutes',
                              'date', s.held_on, 'document_id', s.minutes_document_id, 'missing', s.minutes_document_id IS NULL)
      FROM public.project_review_slots s
     WHERE s.project_id = p_project_id AND s.status = 'DONE' AND s.kind <> 'PROGRESS_REPORT'
  ) x;
$$;

-- ── 3. RPCs ────────────────────────────────────────────────────────────
-- The PI writes the report; the first save moves the project to CLOSING.
-- p_fields carries the text fields by column name.
CREATE OR REPLACE FUNCTION public.project_completion_save(p_project_id text, p_fields jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_r  public.project_completion_reports%ROWTYPE;
    v_f  jsonb := coalesce(p_fields, '{}'::jsonb);
BEGIN
    IF NOT public.project_caller_is_pi(p_project_id) THEN
        RAISE EXCEPTION 'Only the PI writes the completion report';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id FOR UPDATE;
    IF FOUND AND v_r.status NOT IN ('DRAFT', 'RETURNED') THEN
        RAISE EXCEPTION 'The report has been submitted and cannot be edited';
    END IF;
    IF NOT FOUND AND v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'FORECLOSED') THEN
        RAISE EXCEPTION 'A completion report is written for a running or foreclosed project';
    END IF;
    IF v_f ? 'objectives_status' AND nullif(v_f->>'objectives_status', '') NOT IN ('MET', 'PARTLY_MET', 'NOT_MET') THEN
        RAISE EXCEPTION 'Objectives are met, partly met or not met';
    END IF;

    INSERT INTO public.project_completion_reports (project_id, created_by) VALUES (p_project_id, auth.uid())
    ON CONFLICT (project_id) DO NOTHING;
    UPDATE public.project_completion_reports SET
        summary           = coalesce(v_f->>'summary', summary),
        objectives_status = CASE WHEN v_f ? 'objectives_status' THEN nullif(v_f->>'objectives_status', '') ELSE objectives_status END,
        objectives_reason = coalesce(v_f->>'objectives_reason', objectives_reason),
        what_worked       = coalesce(v_f->>'what_worked', what_worked),
        what_did_not      = coalesce(v_f->>'what_did_not', what_did_not),
        reusable_assets   = coalesce(v_f->>'reusable_assets', reusable_assets),
        trl_target        = CASE WHEN v_f ? 'trl_target' THEN nullif(v_f->>'trl_target', '')::int ELSE trl_target END,
        trl_reached       = CASE WHEN v_f ? 'trl_reached' THEN nullif(v_f->>'trl_reached', '')::int ELSE trl_reached END,
        recommendations   = coalesce(v_f->>'recommendations', recommendations),
        follow_on_ideas   = coalesce(v_f->>'follow_on_ideas', follow_on_ideas),
        updated_at        = now()
     WHERE project_id = p_project_id
    RETURNING * INTO v_r;

    IF v_pr.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD') THEN
        UPDATE public.projects SET stage = 'CLOSING' WHERE "ProjectID" = p_project_id;
    END IF;
    RETURN v_r.id;
END;
$$;

-- What a completion report must say before it goes forward (§5.4).
CREATE OR REPLACE FUNCTION public.project_completion_missing(r public.project_completion_reports)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN btrim(r.summary) = ''          THEN 'summary' END,
    CASE WHEN r.objectives_status IS NULL    THEN 'objectives_status' END,
    CASE WHEN r.objectives_status IN ('PARTLY_MET', 'NOT_MET') AND btrim(r.objectives_reason) = '' THEN 'objectives_reason' END,
    CASE WHEN btrim(r.what_worked) = ''      THEN 'what_worked' END,
    CASE WHEN btrim(r.what_did_not) = ''     THEN 'what_did_not' END,
    CASE WHEN btrim(r.recommendations) = ''  THEN 'recommendations' END
  ], NULL);
$$;

CREATE OR REPLACE FUNCTION public.project_completion_submit(p_project_id text, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr      public.projects%ROWTYPE;
    v_r       public.project_completion_reports%ROWTYPE;
    v_missing text[];
BEGIN
    IF NOT public.project_caller_is_pi(p_project_id) THEN
        RAISE EXCEPTION 'Only the PI submits the completion report';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Write the completion report first'; END IF;
    IF v_r.status NOT IN ('DRAFT', 'RETURNED') THEN RAISE EXCEPTION 'The report has already been submitted'; END IF;
    IF v_pr.track IS NULL THEN RAISE EXCEPTION 'PME must classify this project as ULIP or HQ first'; END IF;
    v_missing := public.project_completion_missing(v_r);
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'The report still needs: %', array_to_string(v_missing, ', ');
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_change_requests
                WHERE project_id = p_project_id AND status IN ('SUBMITTED', 'UNDER_REVIEW')) THEN
        RAISE EXCEPTION 'A change request on this project is still in review';
    END IF;
    PERFORM public.project_assert_document(p_project_id, p_document_id, 'completion_report');

    UPDATE public.project_completion_reports
       SET status = 'SUBMITTED', round = round + 1, document_id = p_document_id,
           financial_statement = public.project_financial_statement(p_project_id),
           annexures = public.project_completion_annexures(p_project_id),
           submitted_at = now(), updated_at = now(), decision_note = NULL
     WHERE id = v_r.id;
    INSERT INTO public.project_completion_steps (report_id, round, seq, kind)
    SELECT v_r.id, v_r.round + 1, s.n, s.k
      FROM unnest(public.project_completion_step_kinds(v_pr.track)) WITH ORDINALITY AS s(k, n);
END;
$$;

CREATE OR REPLACE FUNCTION public.project_completion_record_step(
    p_step_id     uuid,
    p_decision    text,
    p_notes       text,
    p_document_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_step public.project_completion_steps%ROWTYPE;
    v_r    public.project_completion_reports%ROWTYPE;
    v_pr   public.projects%ROWTYPE;
    v_note text := nullif(btrim(p_notes), '');
    v_word text;
BEGIN
    SELECT * INTO v_step FROM public.project_completion_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE id = v_step.report_id FOR UPDATE;
    IF NOT public.project_change_caller_may_act(v_r.project_id, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this completion report';
    END IF;
    IF v_r.status NOT IN ('SUBMITTED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'This report is not in review'; END IF;
    IF v_step.status <> 'PENDING' OR v_step.round <> v_r.round THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_completion_steps s
                WHERE s.report_id = v_r.id AND s.round = v_step.round AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_r.project_id FOR UPDATE;

    IF p_decision = 'APPROVE' THEN
        PERFORM public.project_assert_document(v_r.project_id, p_document_id, 'closure_order');
        UPDATE public.project_completion_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(), notes = v_note, document_id = p_document_id
         WHERE id = v_step.id;
        IF NOT EXISTS (SELECT 1 FROM public.project_completion_steps s
                        WHERE s.report_id = v_r.id AND s.round = v_step.round AND s.status = 'PENDING') THEN
            UPDATE public.project_completion_reports
               SET status = 'APPROVED', decided_at = now(), updated_at = now(), decision_note = v_note
             WHERE id = v_r.id;
            -- A foreclosed project stays foreclosed; its report is still memory.
            IF v_pr.stage <> 'FORECLOSED' THEN
                UPDATE public.projects SET stage = 'CLOSED' WHERE "ProjectID" = v_r.project_id;
            END IF;
            v_word := 'approved';
        ELSE
            UPDATE public.project_completion_reports SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v_r.id;
        END IF;
    ELSIF p_decision = 'RETURN' THEN
        IF v_note IS NULL THEN RAISE EXCEPTION 'Say what needs to change'; END IF;
        UPDATE public.project_completion_steps
           SET status = 'RETURNED', decided_by = auth.uid(), decided_at = now(), notes = v_note, document_id = p_document_id
         WHERE id = v_step.id;
        UPDATE public.project_completion_steps SET status = 'SKIPPED'
         WHERE report_id = v_r.id AND round = v_step.round AND status = 'PENDING';
        UPDATE public.project_completion_reports
           SET status = 'RETURNED', decision_note = v_note, updated_at = now()
         WHERE id = v_r.id;
        v_word := 'returned for changes';
    ELSE
        -- A completion report is not rejected: a project ends either way.
        RAISE EXCEPTION 'A completion report is approved or returned';
    END IF;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT v_r.created_by, 'project_completion_decided', CASE WHEN v_word = 'approved' THEN 'info' ELSE 'warning' END,
           'Completion report ' || v_word || ': ' || v_pr."ProjectNo",
           'The completion report of ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo") || ' was ' || v_word || coalesce('. ' || v_note, '.'),
           '/projects/' || v_r.project_id || '?tab=closure', 'rule', 'completion:' || v_r.id || ':' || v_step.id
     WHERE v_word IS NOT NULL
    ON CONFLICT DO NOTHING;
END;
$$;

-- PME archives a closed (or foreclosed) project with its published report:
-- a PDF of the approved report in the documents registry, which Ask SURYA
-- indexes. A legacy project with no proposal may be archived without one.
-- PME may register a document only at a private tier (20260725000001); the
-- report has been through the closure chain, so archiving is what makes it
-- institute-wide — this document only, and only one PME uploaded.
CREATE OR REPLACE FUNCTION public.project_archive(p_project_id text, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
    v_r  public.project_completion_reports%ROWTYPE;
BEGIN
    IF NOT public.project_caller_is_office(p_project_id) THEN
        RAISE EXCEPTION 'Only PME archives a project, and not one of their own';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('CLOSED', 'FORECLOSED') THEN RAISE EXCEPTION 'Only a closed or foreclosed project is archived'; END IF;
    SELECT * INTO v_r FROM public.project_completion_reports WHERE project_id = p_project_id;
    IF v_r.id IS NOT NULL AND v_r.status <> 'APPROVED' THEN
        RAISE EXCEPTION 'The completion report is still in review';
    END IF;
    IF v_r.id IS NULL AND v_pr.proposal_id IS NOT NULL THEN
        RAISE EXCEPTION 'Close the project with an approved completion report first';
    END IF;
    IF v_r.id IS NOT NULL THEN
        IF p_document_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.documents d
             WHERE d.id = p_document_id AND d.entity_type = 'project' AND d.entity_id = p_project_id
               AND d.doc_type = 'completion_report' AND d.owner_id = auth.uid()) THEN
            RAISE EXCEPTION 'Publish the completion report first';
        END IF;
        UPDATE public.documents SET access_tier = 'institute', division_code = v_pr."DivisionCode" WHERE id = p_document_id;
        UPDATE public.project_completion_reports SET published_document_id = p_document_id WHERE id = v_r.id;
    END IF;
    UPDATE public.projects SET stage = 'ARCHIVED' WHERE "ProjectID" = p_project_id;
END;
$$;

-- An archived project is read-only. Runs last among the BEFORE triggers
-- (they fire in name order), after the derived columns are filled in.
CREATE OR REPLACE FUNCTION public.projects_archived_readonly()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF OLD.stage = 'ARCHIVED' AND row(NEW.*) IS DISTINCT FROM row(OLD.*) THEN
        RAISE EXCEPTION 'Project % is archived and read-only', OLD."ProjectNo";
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_projects_zz_archived_readonly ON public.projects;
CREATE TRIGGER trg_projects_zz_archived_readonly BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_archived_readonly();

-- Steps waiting on the caller, and completion reports the caller owes.
CREATE OR REPLACE FUNCTION public.my_closure_items()
RETURNS TABLE (item text, project_id text, project_no text, step_id uuid, step_kind text, end_date date)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT 'step', r.project_id, p."ProjectNo", s.id, s.kind, p.end_date
    FROM public.project_completion_steps s
    JOIN public.project_completion_reports r ON r.id = s.report_id AND s.round = r.round
    JOIN public.projects p ON p."ProjectID" = r.project_id
   WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
     AND NOT EXISTS (SELECT 1 FROM public.project_completion_steps e
                      WHERE e.report_id = s.report_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')
     AND public.project_change_caller_may_act(r.project_id, s.kind)
  UNION ALL
  -- The PI's: the end date has passed (or the project is closing) and no
  -- report has gone forward.
  SELECT 'due', p."ProjectID", p."ProjectNo", NULL, NULL, p.end_date
    FROM public.projects p
    LEFT JOIN public.project_completion_reports r ON r.project_id = p."ProjectID"
   WHERE (p.stage = 'CLOSING' OR (p.stage IN ('ACTIVE', 'ON_HOLD') AND p.end_date < public.ist_today())
          OR (p.stage = 'FORECLOSED' AND p.proposal_id IS NOT NULL))
     AND coalesce(r.status, 'DRAFT') IN ('DRAFT', 'RETURNED')
     AND public.project_caller_is_pi(p."ProjectID");
$$;

-- ── 4. Lessons, readable by everyone ───────────────────────────────────
-- The point of the exercise (plan §5.4): what a closed project learned is
-- institute memory, not the project team's. Only approved reports, only the
-- lesson fields. Runs as the owner, so it is not limited by projects RLS.
CREATE OR REPLACE VIEW public.project_lessons AS
SELECT r.project_id, p."ProjectNo" AS project_no, p."ProjectName" AS project_name,
       p."DivisionCode" AS division_code, p."PrincipalInvestigator" AS pi_name, p.track, p.stage,
       p.start_date, p.end_date, r.summary, r.objectives_status, r.objectives_reason, r.what_worked, r.what_did_not,
       r.reusable_assets, r.trl_target, r.trl_reached, r.recommendations, r.follow_on_ideas,
       r.decided_at AS approved_at, r.published_document_id
  FROM public.project_completion_reports r
  JOIN public.projects p ON p."ProjectID" = r.project_id
 WHERE r.status = 'APPROVED';
REVOKE ALL ON public.project_lessons FROM PUBLIC, anon;
GRANT SELECT ON public.project_lessons TO authenticated, service_role;

-- ── 5. Follow-on lineage ───────────────────────────────────────────────
ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS parent_project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS proposals_parent_project_idx ON public.proposals (parent_project_id) WHERE parent_project_id IS NOT NULL;

-- ── 6. Timeline ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_completion_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure', 'Completion report started', NEW.id::text);
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SUBMITTED', 'RETURNED', 'APPROVED') THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure',
                'Completion report ' || CASE NEW.status WHEN 'SUBMITTED' THEN 'submitted'
                                                        WHEN 'RETURNED' THEN 'returned for changes'
                                                        ELSE 'approved' END
                || coalesce(' — ' || NEW.decision_note, ''), NEW.id::text);
    ELSIF NEW.published_document_id IS DISTINCT FROM OLD.published_document_id AND NEW.published_document_id IS NOT NULL THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'closure', 'Completion report published to the institute archive', NEW.id::text);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.project_completion_log() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_project_completion_reports_log ON public.project_completion_reports;
CREATE TRIGGER trg_project_completion_reports_log AFTER INSERT OR UPDATE ON public.project_completion_reports
    FOR EACH ROW EXECUTE FUNCTION public.project_completion_log();

-- ── 7. Grants and assertions ───────────────────────────────────────────
REVOKE ALL ON FUNCTION public.project_completion_save(text, jsonb)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_completion_submit(text, uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_completion_record_step(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_archive(text, uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_closure_items()                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_financial_statement(text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_completion_annexures(text)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_completion_save(text, jsonb)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_submit(text, uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_record_step(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_archive(text, uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_closure_items()                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_financial_statement(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_completion_annexures(text)                  TO authenticated, service_role;

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.project_completion_reports', 'UPDATE') THEN
        RAISE EXCEPTION 'completion reports are writable by clients';
    END IF;
END $$;
