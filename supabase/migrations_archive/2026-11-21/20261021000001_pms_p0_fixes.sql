-- ============================================================
-- 20261021000001_pms_p0_fixes
-- P0 fixes from docs/roadmap/sources/PMS-2026-GAP-REVIEW.md:
--   1. Scientist (and Empowered / Grievance members) can read the final
--      committee decision — §6 "PMS shall be communicated to the scientist".
--   2. Empowered and Grievance members can read the report, and every
--      reader of a report can list its annexures.
--   3. A scientist can no longer delete the filed finalized-report PDF.
--   4. Director/admin can condone a late self-appraisal (§5.B.I.iv).
-- ============================================================

-- ── 1+2. Read access ──────────────────────────────────────────────────────
-- Empowered Committee and Grievance members review reports but were never in
-- reports_select. Adding them here also opens the storage objects, because
-- pms_can_read_report_path() reads through this policy.
DROP POLICY IF EXISTS "reports_select" ON public.pms_reports;
CREATE POLICY "reports_select" ON public.pms_reports FOR SELECT TO authenticated
    USING (
        scientist_id = auth.uid()
        OR public.pms_is_admin()
        OR public.pms_is_evaluation_committee_member(cycle_id)
        OR EXISTS (SELECT 1 FROM public.pms_evaluations WHERE report_id = pms_reports.id AND evaluator_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                    WHERE m.cycle_id = pms_reports.cycle_id AND m.user_id = auth.uid())
        OR public.user_has_role('EmpoweredCommittee')
        OR public.pms_is_grievance_member(cycle_id)
    );

-- Annexures follow the report: anyone who may read the report may list them.
DROP POLICY IF EXISTS "annexures_select" ON public.pms_annexures;
CREATE POLICY "annexures_select" ON public.pms_annexures FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = report_id));

-- The scientist sees the decision once it is communicated (FINALIZED or under
-- grievance). Any other reader of the report (the subquery runs under
-- reports_select) sees it always.
DROP POLICY IF EXISTS "committee_decisions_select" ON public.pms_committee_decisions;
CREATE POLICY "committee_decisions_select" ON public.pms_committee_decisions FOR SELECT TO authenticated
    USING (
        decided_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.pms_reports r
             WHERE r.id = report_id
               AND (r.scientist_id <> auth.uid()
                    OR r.status IN ('FINALIZED','UNDER_GRIEVANCE_REVIEW'))
        )
    );

-- ── 3. Protect the finalized PDF ──────────────────────────────────────────
-- fileFinalizedReport writes `<report_id>/finalized_<ts>.pdf`. The owner may
-- still delete their own draft annexures; only admins may delete the record.
DROP POLICY IF EXISTS "pms_annexures_delete" ON storage.objects;
CREATE POLICY "pms_annexures_delete" ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'annexures'
        AND (
            public.pms_is_admin()
            OR (public.pms_owns_report_path(name)
                AND split_part(name, '/', 2) NOT LIKE 'finalized\_%')
        )
    );

-- ── 4. Condonation of late self-appraisal ─────────────────────────────────
-- Separate table, not a pms_reports column: reports_update lets the owner
-- write any column of their DRAFT row, so a column would be self-grantable.
CREATE TABLE IF NOT EXISTS public.pms_condonations (
    report_id      uuid PRIMARY KEY REFERENCES public.pms_reports(id) ON DELETE CASCADE,
    condoned_until date NOT NULL,
    reason         text NOT NULL CHECK (length(trim(reason)) >= 20),
    condoned_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pms_condonations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "condonations_select" ON public.pms_condonations;
CREATE POLICY "condonations_select" ON public.pms_condonations FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = report_id));

-- Written only by pms_condone_delay.
REVOKE ALL ON public.pms_condonations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_condonations FROM authenticated;
GRANT SELECT ON public.pms_condonations TO authenticated;

CREATE TRIGGER trg_lock_pms_condonations
    BEFORE INSERT OR UPDATE OR DELETE ON public.pms_condonations
    FOR EACH ROW EXECUTE FUNCTION public.pms_block_locked_cycle_children();

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
    IF p_condoned_until IS NULL OR p_condoned_until < now()::date THEN
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

-- Same body as the baseline, except the May 15 check honours a condonation.
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
    IF now()::date > greatest(public.pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL'), v_until) THEN
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

REVOKE EXECUTE ON FUNCTION public.pms_condone_delay(uuid, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pms_condone_delay(uuid, date, text) TO authenticated;
