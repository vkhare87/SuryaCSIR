-- ============================================================
-- 20261102000001_pms_client_write_guard
-- Client sessions may not write PMS workflow state.
-- BUG-01: reports_insert/reports_update pinned only scientist_id, so the owner
--         could set status='FINALIZED' (or duty_days, submitted_at, …) directly.
-- BUG-02: evaluations_update had no WITH CHECK, so an evaluator could re-point
--         their row at any report and drive pms_check_evaluation_complete.
-- Discriminator: current_user. Direct PostgREST writes run as 'authenticated';
-- SECURITY DEFINER RPCs run as the function owner. Do not use auth.uid() — it is
-- still the caller inside a definer function and would block pms_submit_report.
-- Tests: supabase/tests/rls_negative.sql T21–T23, scripts/db/pms.db.test.ts.
-- ============================================================
BEGIN;

-- 1. The owner may only ever hold a DRAFT row.
DROP POLICY IF EXISTS "reports_insert" ON public.pms_reports;
CREATE POLICY "reports_insert" ON public.pms_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        scientist_id = (SELECT auth.uid())
        AND status = 'DRAFT'
        AND EXISTS (SELECT 1 FROM public.appraisal_cycles c
                     WHERE c.id = cycle_id AND c.status = 'OPEN')
    );

DROP POLICY IF EXISTS "reports_update" ON public.pms_reports;
CREATE POLICY "reports_update" ON public.pms_reports
    FOR UPDATE TO authenticated
    USING      (scientist_id = (SELECT auth.uid()) AND status = 'DRAFT')
    WITH CHECK (scientist_id = (SELECT auth.uid()) AND status = 'DRAFT');

-- 2. Workflow columns are written only by the RPCs. The owner keeps the
--    self-appraisal fields (period, self_score, previous-PMS, signature).
CREATE OR REPLACE FUNCTION public.pms_reports_guard_owner_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.submitted_at                    IS NOT NULL
            OR NEW.duty_days                       IS NOT NULL
            OR NEW.system_remark                   IS NOT NULL
            OR NEW.score_communicated_at           IS NOT NULL
            OR NEW.non_submission_certificate_path IS NOT NULL
            THEN
                RAISE EXCEPTION 'submission, duty days and score fields are written only by the PMS workflow RPCs';
            END IF;
        ELSIF NEW.status                          IS DISTINCT FROM OLD.status
           OR NEW.scientist_id                    IS DISTINCT FROM OLD.scientist_id
           OR NEW.cycle_id                        IS DISTINCT FROM OLD.cycle_id
           OR NEW.submitted_at                    IS DISTINCT FROM OLD.submitted_at
           OR NEW.duty_days                       IS DISTINCT FROM OLD.duty_days
           OR NEW.system_remark                   IS DISTINCT FROM OLD.system_remark
           OR NEW.score_communicated_at           IS DISTINCT FROM OLD.score_communicated_at
           OR NEW.non_submission_certificate_path IS DISTINCT FROM OLD.non_submission_certificate_path
        THEN
            RAISE EXCEPTION
                'status, scores, duty days and cycle are written only by the PMS workflow RPCs'
                USING HINT = 'Use pms_submit_report / pms_finalize_report / pms_mark_not_assessed / pms_set_duty_days.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_reports_owner_columns ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_owner_columns
    BEFORE INSERT OR UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_reports_guard_owner_columns();

-- 3. An evaluation belongs to one report and one evaluator, forever.
DROP POLICY IF EXISTS "evaluations_update" ON public.pms_evaluations;
CREATE POLICY "evaluations_update" ON public.pms_evaluations
    FOR UPDATE TO authenticated
    USING      (evaluator_id = (SELECT auth.uid()))
    WITH CHECK (evaluator_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.pms_evaluations_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (NEW.report_id IS DISTINCT FROM OLD.report_id
            OR NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id) THEN
        RAISE EXCEPTION 'An evaluation cannot be moved to another report or evaluator';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_evaluations_identity ON public.pms_evaluations;
CREATE TRIGGER trg_pms_evaluations_identity
    BEFORE UPDATE ON public.pms_evaluations
    FOR EACH ROW EXECUTE FUNCTION public.pms_evaluations_guard_identity();

COMMIT;
