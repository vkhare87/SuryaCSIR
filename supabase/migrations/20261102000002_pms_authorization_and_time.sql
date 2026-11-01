-- ============================================================
-- 20261102000002_pms_authorization_and_time
-- 2a. BUG-03: drop the cycle-agnostic EmpoweredCommittee role branch. Finalize
--     and read access follow the per-cycle committee seats; a cycle with no
--     valid Empowered Committee can no longer be finalized (deliberate).
--     The cycle-wide pms_is_evaluation_committee_member branch goes too: it
--     let a tier-I panel member read tier-II/III reports. The pms_evaluations
--     branch is the precise grant.
-- 2c. BUG-05: one clock. Every PMS deadline compares against the IST day.
-- Tests: scripts/db/pms.db.test.ts.
-- ============================================================
BEGIN;

-- ── 2a. Authorization ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pms_finalize_report(
    p_report_id           uuid,
    p_final_score         integer,
    p_justification       text,
    p_reasons_outstanding text DEFAULT NULL,
    p_reasons_below       text DEFAULT NULL,
    p_suggestions         text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
    END IF;
    IF NOT COALESCE(public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid()), false) THEN
        RAISE EXCEPTION 'Only Empowered Committee members can finalize reports';
    END IF;
    IF NOT public.pms_empowered_committee_valid(v_report.cycle_id) THEN
        RAISE EXCEPTION 'Empowered Committee configuration is invalid: needs 3, 5, or 7 members plus the Director/DG as Chairman';
    END IF;
    IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 100 THEN
        RAISE EXCEPTION 'Final score must be an integer between 0 and 100';
    END IF;
    IF length(trim(p_justification)) < 50 THEN
        RAISE EXCEPTION 'Justification must be at least 50 characters';
    END IF;
    IF p_final_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
        RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
    END IF;
    IF p_final_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                 OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
        RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
    END IF;

    INSERT INTO public.pms_committee_decisions
        (report_id, decided_by, final_score, justification,
         reasons_for_outstanding, reasons_below_threshold, suggestions_for_improvement)
    VALUES
        (p_report_id, auth.uid(), p_final_score, p_justification,
         p_reasons_outstanding, p_reasons_below, p_suggestions)
    ON CONFLICT (report_id) DO UPDATE
        SET final_score                 = EXCLUDED.final_score,
            justification               = EXCLUDED.justification,
            reasons_for_outstanding     = EXCLUDED.reasons_for_outstanding,
            reasons_below_threshold     = EXCLUDED.reasons_below_threshold,
            suggestions_for_improvement = EXCLUDED.suggestions_for_improvement,
            decided_by                  = EXCLUDED.decided_by;

    UPDATE public.pms_reports
        SET status = 'FINALIZED', score_communicated_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('final_score', p_final_score));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your appraisal report has been finalized',
            'The Empowered Committee has assigned your final score. You may submit a representation within 15 days.',
            p_report_id);
END;
$$;

DROP POLICY IF EXISTS "reports_select" ON public.pms_reports;
CREATE POLICY "reports_select" ON public.pms_reports FOR SELECT TO authenticated
    USING (
        scientist_id = (SELECT auth.uid())
        OR public.pms_is_admin()
        OR EXISTS (SELECT 1 FROM public.pms_evaluations e
                    WHERE e.report_id = pms_reports.id AND e.evaluator_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                    WHERE m.cycle_id = pms_reports.cycle_id AND m.user_id = (SELECT auth.uid()))
        OR public.pms_is_grievance_member(cycle_id)
    );

-- Sections and AWP activities follow the report, like annexures_select: the
-- subquery runs under reports_select, so there is one reader list to keep.
DROP POLICY IF EXISTS "sections_select" ON public.pms_report_sections;
CREATE POLICY "sections_select" ON public.pms_report_sections FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = report_id));

DROP POLICY IF EXISTS "awp_select" ON public.pms_awp_activities;
CREATE POLICY "awp_select" ON public.pms_awp_activities FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = report_id));

-- Same body as 20261021000002, minus the two cycle-agnostic operands.
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

-- ── 2c. One clock ─────────────────────────────────────────────────────────
-- The institute's day. Every PMS deadline comparison uses it; the client
-- builds the same boundary in src/lib/pms/deadlines.ts.
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION public.pms_cycle_locked(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT public.ist_today() > public.pms_deadline(p_cycle_id, 'SYSTEM_LOCK');
$$;

-- Same body as 20261021000001, IST day instead of now()::date.
CREATE OR REPLACE FUNCTION public.pms_submit_report(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_cycle   public.appraisal_cycles%ROWTYPE;
    v_until   date;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.scientist_id <> auth.uid() THEN RAISE EXCEPTION 'Not your report'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF v_report.period_from IS NULL OR v_report.period_to IS NULL THEN
        RAISE EXCEPTION 'period_from and period_to must be set before submitting';
    END IF;

    SELECT * INTO v_cycle FROM public.appraisal_cycles WHERE id = v_report.cycle_id;
    IF v_cycle.status <> 'OPEN' THEN RAISE EXCEPTION 'Appraisal cycle is not OPEN'; END IF;

    SELECT condoned_until INTO v_until FROM public.pms_condonations WHERE report_id = p_report_id;
    IF public.ist_today() > greatest(public.pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL'), v_until) THEN
        RAISE EXCEPTION 'Self-appraisal deadline (May 15) has passed; ask the Director to condone the delay';
    END IF;

    IF v_report.duty_days IS NOT NULL AND v_report.duty_days < 90 THEN
        RAISE EXCEPTION 'Physical duty days below 90; report is not assessable under 2026 guidelines';
    END IF;

    UPDATE public.pms_reports
        SET status = 'SUBMITTED', submitted_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SUBMIT', 'pms_reports', p_report_id,
            CASE WHEN v_until IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('condoned_until', v_until) END);
END;
$$;

-- Same body as 20260712000004, IST day instead of now()::date.
CREATE OR REPLACE FUNCTION public.pms_record_non_submission(
    p_report_id uuid,
    p_cert_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    IF NOT public.pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can record non-submission'; END IF;

    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF public.ist_today() <= public.pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL') THEN
        RAISE EXCEPTION 'Non-submission can only be recorded after the May 15 deadline';
    END IF;

    UPDATE public.pms_reports
        SET status = 'SUBMITTED',
            submitted_at = now(),
            non_submission_certificate_path = p_cert_path,
            system_remark = 'Self-appraisal not submitted by May 15. Evaluation Committee may award a zero score or rate strictly on Reporting Officer inputs.',
            updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'NON_SUBMISSION_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('certificate', p_cert_path));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'non_submission_flagged',
            'Non-submission certificate recorded',
            'You missed the self-appraisal deadline. Your appraisal will proceed on Reporting Officer inputs or a zero score.',
            p_report_id);
END;
$$;

-- Same body as 20261021000001, IST day instead of now()::date.
CREATE OR REPLACE FUNCTION public.pms_condone_delay(
    p_report_id      uuid,
    p_condoned_until date,
    p_reason         text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    IF NOT COALESCE(public.pms_is_admin() OR public.user_has_role('Director'), false) THEN
        RAISE EXCEPTION 'Only the Director or PMS administrators can condone a delay';
    END IF;

    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only a DRAFT report can be condoned'; END IF;
    IF p_condoned_until IS NULL OR p_condoned_until < public.ist_today() THEN
        RAISE EXCEPTION 'Condoned-until date must be today or later';
    END IF;
    IF p_condoned_until > public.pms_deadline(v_report.cycle_id, 'EC_COMPLETION') THEN
        RAISE EXCEPTION 'Condoned-until date cannot be after the Evaluation Committee deadline (June 30)';
    END IF;
    IF length(trim(coalesce(p_reason, ''))) < 20 THEN
        RAISE EXCEPTION 'Reason must be at least 20 characters';
    END IF;

    INSERT INTO public.pms_condonations (report_id, condoned_until, reason, condoned_by)
    VALUES (p_report_id, p_condoned_until, p_reason, auth.uid())
    ON CONFLICT (report_id) DO UPDATE
        SET condoned_until = EXCLUDED.condoned_until,
            reason         = EXCLUDED.reason,
            condoned_by    = EXCLUDED.condoned_by,
            created_at     = now();

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DELAY_CONDONED', 'pms_reports', p_report_id,
            jsonb_build_object('condoned_until', p_condoned_until, 'reason', p_reason));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'delay_condoned',
            'Late submission allowed',
            'The Director has condoned the delay. You may submit your self-appraisal until '
                || to_char(p_condoned_until, 'DD Mon YYYY') || '.',
            p_report_id);
END;
$$;

COMMIT;
