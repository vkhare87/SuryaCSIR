-- ============================================================
-- 20261102000006_schema_integrity
-- BUG-32 / BUG-33 / WO-6:
--   6a. projects."ProjectNo" is the join key for project_staff, phd_students,
--       proposals, project_reports and projects_select, but was not unique.
--   6b. Only one appraisal cycle may be OPEN; a cycle ends after it starts.
--   6c. Indexes on RLS predicates and the client's .order() columns.
--   6d. auth.uid() -> (SELECT auth.uid()) in every public policy, so it is
--       evaluated once per statement instead of once per row.
--   6e. No TRUNCATE / TRIGGER / REFERENCES for client roles, and table default
--       privileges cover the migration login as well as postgres.
--   6f. pms_resolve_representation no longer records a revised score it did
--       not apply, and cannot resolve a representation twice.
-- Tests: scripts/db/schema.db.test.ts.
-- ============================================================
BEGIN;

-- ── 6a. ProjectNo is unique ──────────────────────────────────────────────
-- ponytail: no FKs from project_staff / phd_students / mous / tech_transfers
-- yet. Those rows come from Excel uploads that can name a project before the
-- projects sheet is loaded; an FK would turn that into a failed upload.
DO $$
DECLARE v_dupes text;
BEGIN
    SELECT string_agg(DISTINCT "ProjectNo", ', ') INTO v_dupes
      FROM (SELECT "ProjectNo" FROM public.projects
             WHERE "ProjectNo" IS NOT NULL
             GROUP BY "ProjectNo" HAVING count(*) > 1) d;
    IF v_dupes IS NOT NULL THEN
        RAISE EXCEPTION 'Duplicate projects."ProjectNo" must be merged before this migration: %', v_dupes;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_project_no_key
    ON public.projects ("ProjectNo") WHERE "ProjectNo" IS NOT NULL;

-- ── 6b. One OPEN cycle; dates in order ───────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM public.appraisal_cycles WHERE status = 'OPEN') > 1 THEN
        RAISE EXCEPTION 'More than one appraisal cycle is OPEN; close all but one before this migration';
    END IF;
    IF EXISTS (SELECT 1 FROM public.appraisal_cycles WHERE end_date <= start_date) THEN
        RAISE EXCEPTION 'An appraisal cycle ends on or before its start date; fix it before this migration';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS appraisal_cycles_one_open
    ON public.appraisal_cycles (status) WHERE status = 'OPEN';
ALTER TABLE public.appraisal_cycles DROP CONSTRAINT IF EXISTS appraisal_cycles_dates;
ALTER TABLE public.appraisal_cycles
    ADD CONSTRAINT appraisal_cycles_dates CHECK (end_date > start_date);

-- ── 6c. Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS project_staff_project_no_idx    ON public.project_staff ("ProjectNo");
CREATE INDEX IF NOT EXISTS staff_email_lower_idx           ON public.staff (lower("Email"));
CREATE INDEX IF NOT EXISTS pms_evaluations_evaluator_idx   ON public.pms_evaluations (evaluator_id);
CREATE INDEX IF NOT EXISTS pms_reports_created_at_idx      ON public.pms_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS pms_notifications_user_created_idx ON public.pms_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx          ON public.tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_assigned_status_idx     ON public.tickets (assigned_to, status);
CREATE INDEX IF NOT EXISTS pms_audit_logs_user_created_idx ON public.pms_audit_logs (user_id, created_at DESC);

-- ── 6d. auth.uid() once per statement ────────────────────────────────────
-- Mechanical and semantics-free: wrap every bare auth.uid() in a scalar
-- subquery so the planner caches it. Already-wrapped calls deparse as
-- "( SELECT auth.uid() AS uid)" and are left alone.
DO $$
DECLARE
    p      record;
    v_qual text;
    v_chk  text;
BEGIN
    FOR p IN SELECT tablename, policyname, qual, with_check
               FROM pg_policies WHERE schemaname = 'public' LOOP
        v_qual := regexp_replace(p.qual,       '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
        v_chk  := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
        IF v_qual IS DISTINCT FROM p.qual THEN
            EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, v_qual);
        END IF;
        IF v_chk IS DISTINCT FROM p.with_check THEN
            EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename, v_chk);
        END IF;
    END LOOP;
END $$;

-- ── 6e. Grant residues ───────────────────────────────────────────────────
-- TRUNCATE is not filtered by RLS; TRIGGER and REFERENCES have no client use.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated, anon;

-- Same both-creators pattern as 20260726000005 for functions: a table made
-- by the migration login (not postgres) must still get its grants, or its
-- RLS policies are dead code.
DO $$
DECLARE
    v_role text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['postgres', current_user] LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                       'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                       'GRANT ALL ON TABLES TO service_role', v_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                       'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated, anon', v_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                       'GRANT ALL ON SEQUENCES TO authenticated, service_role', v_role);
    END LOOP;
END $$;

-- ── 6f. pms_resolve_representation ───────────────────────────────────────
-- Same body as 20260712000004, plus: lock the representation and require it
-- PENDING, and raise if a revised score has no committee decision to land on
-- (senior-track reports have none).
CREATE OR REPLACE FUNCTION public.pms_resolve_representation(
    p_report_id           uuid,
    p_resolution          text,
    p_revised_score       integer DEFAULT NULL,
    p_reasons_outstanding text DEFAULT NULL,
    p_reasons_below       text DEFAULT NULL,
    p_suggestions         text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_rep    public.pms_representations%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'UNDER_GRIEVANCE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not under grievance review';
    END IF;
    IF NOT COALESCE(public.pms_is_admin() OR public.pms_is_grievance_member(v_report.cycle_id), false) THEN
        RAISE EXCEPTION 'Only Grievance Committee members can resolve representations';
    END IF;
    SELECT * INTO v_rep FROM public.pms_representations WHERE report_id = p_report_id FOR UPDATE;
    IF NOT FOUND OR v_rep.status <> 'PENDING' THEN
        RAISE EXCEPTION 'There is no pending representation for this report';
    END IF;
    IF length(trim(coalesce(p_resolution, ''))) < 20 THEN
        RAISE EXCEPTION 'Resolution must be at least 20 characters';
    END IF;

    IF p_revised_score IS NOT NULL THEN
        IF p_revised_score < 0 OR p_revised_score > 100 THEN
            RAISE EXCEPTION 'Revised score must be an integer between 0 and 100';
        END IF;
        IF p_revised_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
            RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
        END IF;
        IF p_revised_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                       OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
            RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
        END IF;

        UPDATE public.pms_committee_decisions
            SET final_score                 = p_revised_score,
                reasons_for_outstanding     = p_reasons_outstanding,
                reasons_below_threshold     = p_reasons_below,
                suggestions_for_improvement = p_suggestions
            WHERE report_id = p_report_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'This report has no committee score to revise';
        END IF;
    END IF;

    UPDATE public.pms_representations
        SET status = 'RESOLVED', resolution = p_resolution,
            resolved_by = auth.uid(), resolved_at = now()
        WHERE report_id = p_report_id;

    UPDATE public.pms_reports
        SET status = 'FINALIZED', updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPRESENTATION_RESOLVED', 'pms_reports', p_report_id,
            jsonb_build_object('revised_score', p_revised_score));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'representation_resolved',
            'Your representation has been resolved',
            'The Grievance Redressal Committee has resolved your representation.',
            p_report_id);
END;
$$;

COMMIT;
