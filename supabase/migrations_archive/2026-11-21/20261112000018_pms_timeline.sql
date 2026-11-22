-- ============================================================
-- 20261112000018_pms_timeline
-- Enterprise P4 / ES4 — the nine steps of Annexure-B, tracked.
--
-- Columns added to pms_reports here, used across P4:
--   proforma_version  'LEGACY' for every report that exists today (they keep
--                     the old layout, no data moves), '2026' for a report a
--                     scientist creates from now on.
--   committee_id      the Evaluation Committee the report was sent to.
--   deemed_accepted_at  set by the sweep 15 days after the score is
--                     communicated when no representation was made.
-- None is client-writable (trg_pms_reports_2026_columns).
--
-- pms_timeline_status(cycle) counts done / pending / overdue for each step
-- against the IST day; pms_delay_report(cycle) lists every late report for
-- the delay report to the DG. pms_timeline_sweep() runs daily.
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

ALTER TABLE public.pms_reports
    ADD COLUMN IF NOT EXISTS proforma_version  text NOT NULL DEFAULT 'LEGACY' CHECK (proforma_version IN ('LEGACY', '2026')),
    ADD COLUMN IF NOT EXISTS committee_id      uuid REFERENCES public.pms_evaluation_committees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deemed_accepted_at timestamptz;
-- Existing rows stay LEGACY. A report a scientist creates in the app is a
-- 2026 report (the trigger below); a server-side insert keeps the default.

-- The client never chooses its proforma, committee or acceptance.
CREATE OR REPLACE FUNCTION public.pms_reports_guard_2026_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.proforma_version := '2026';
            NEW.committee_id := NULL;
            NEW.deemed_accepted_at := NULL;
        ELSIF NEW.proforma_version IS DISTINCT FROM OLD.proforma_version
           OR NEW.committee_id IS DISTINCT FROM OLD.committee_id
           OR NEW.deemed_accepted_at IS DISTINCT FROM OLD.deemed_accepted_at THEN
            RAISE EXCEPTION 'proforma, committee and acceptance are written only by the PMS workflow';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pms_reports_2026_columns ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_2026_columns BEFORE INSERT OR UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_reports_guard_2026_columns();

-- Annexure-B dates for a cycle. Reporting year ends 31 March of year Y.
CREATE OR REPLACE FUNCTION public.pms_annexure_b_due(p_cycle_id uuid, p_step smallint)
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT CASE p_step
        WHEN 1 THEN make_date(y, 4, 1)    -- distribute
        WHEN 2 THEN make_date(y, 5, 15)   -- self-appraisal + AWP
        WHEN 3 THEN make_date(y, 6, 30)   -- Evaluation Committee
        WHEN 4 THEN make_date(y, 7, 31)   -- Empowered Committee
        WHEN 5 THEN make_date(y, 8, 15)   -- communicate (15 days after #4)
        WHEN 6 THEN make_date(y, 8, 30)   -- accept or represent (15 days)
        WHEN 7 THEN NULL                  -- dispose: one month from each receipt
        WHEN 8 THEN make_date(y, 11, 15)  -- communicate decision
        WHEN 9 THEN make_date(y, 11, 30)  -- close, take on record
    END
    FROM (SELECT extract(year FROM end_date)::int AS y FROM public.appraisal_cycles WHERE id = p_cycle_id) c;
$$;

CREATE OR REPLACE FUNCTION public.pms_timeline_status(p_cycle_id uuid)
RETURNS TABLE (step smallint, label text, due date, done integer, pending integer, overdue integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_today date := public.ist_today();
BEGIN
    IF NOT coalesce(public.pms_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH r AS (
        SELECT pr.*, rep.status AS rep_status, rep.submitted_at AS rep_at, rep.resolved_at AS rep_resolved_at,
               greatest(public.pms_annexure_b_due(p_cycle_id, 2::smallint),
                        (SELECT c.condoned_until FROM public.pms_condonations c WHERE c.report_id = pr.id)) AS self_due
          FROM public.pms_reports pr
          LEFT JOIN public.pms_representations rep ON rep.report_id = pr.id
         WHERE pr.cycle_id = p_cycle_id AND pr.status <> 'NOT_ASSESSED'
    ), s AS (
        SELECT 1::smallint AS step, 'Distribute PMS'::text AS label,
               count(*)::int AS done, 0 AS pending, 0 AS overdue FROM r
        UNION ALL
        SELECT 2::smallint, 'Self-appraisal and AWP',
               count(*) FILTER (WHERE r.status <> 'DRAFT')::int,
               count(*) FILTER (WHERE r.status = 'DRAFT')::int,
               count(*) FILTER (WHERE r.status = 'DRAFT' AND v_today > r.self_due)::int FROM r
        UNION ALL
        SELECT 3::smallint, 'Evaluation Committee',
               count(*) FILTER (WHERE r.status IN ('EMPOWERED_COMMITTEE_REVIEW', 'FINALIZED', 'UNDER_GRIEVANCE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW')
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 3::smallint))::int FROM r
        UNION ALL
        SELECT 4::smallint, 'Empowered Committee',
               count(*) FILTER (WHERE r.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW'))::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW')::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 4::smallint))::int FROM r
        UNION ALL
        SELECT 5::smallint, 'Communicate PMS',
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL)::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW')::int,
               count(*) FILTER (WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 5::smallint))::int FROM r
        UNION ALL
        SELECT 6::smallint, 'Accept or represent (15 days)',
               count(*) FILTER (WHERE r.deemed_accepted_at IS NOT NULL OR r.rep_at IS NOT NULL)::int,
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL AND r.deemed_accepted_at IS NULL AND r.rep_at IS NULL)::int,
               count(*) FILTER (WHERE r.score_communicated_at IS NOT NULL AND r.deemed_accepted_at IS NULL AND r.rep_at IS NULL
                                  AND v_today > (r.score_communicated_at AT TIME ZONE 'Asia/Kolkata')::date + 15)::int FROM r
        UNION ALL
        SELECT 7::smallint, 'Dispose representation (1 month)',
               count(*) FILTER (WHERE r.rep_status = 'RESOLVED')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING'
                                  AND v_today > ((r.rep_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date)::int FROM r
        UNION ALL
        SELECT 8::smallint, 'Communicate decision on representation',
               count(*) FILTER (WHERE r.rep_status = 'RESOLVED')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING')::int,
               count(*) FILTER (WHERE r.rep_status = 'PENDING' AND v_today > public.pms_annexure_b_due(p_cycle_id, 8::smallint))::int FROM r
        UNION ALL
        SELECT 9::smallint, 'Close and take on record',
               count(*) FILTER (WHERE r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED')::int,
               count(*) FILTER (WHERE NOT (r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED'))::int,
               count(*) FILTER (WHERE NOT (r.status = 'FINALIZED' AND coalesce(r.rep_status, 'RESOLVED') = 'RESOLVED')
                                  AND v_today > public.pms_annexure_b_due(p_cycle_id, 9::smallint))::int FROM r
    )
    SELECT s.step, s.label, public.pms_annexure_b_due(p_cycle_id, s.step), s.done, s.pending, s.overdue
      FROM s ORDER BY s.step;
END;
$$;

-- Every late report, for the delay report to the DG.
CREATE OR REPLACE FUNCTION public.pms_delay_report(p_cycle_id uuid)
RETURNS TABLE (report_id uuid, scientist text, status text, step smallint, due date, days_late integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_today date := public.ist_today();
BEGIN
    IF NOT coalesce(public.pms_is_admin() OR public.caller_has_role('Director'), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY
    WITH r AS (
        SELECT pr.id, pr.status, pr.score_communicated_at, rep.status AS rep_status, rep.submitted_at AS rep_at,
               coalesce((SELECT s."Name" FROM public.staff s WHERE s.user_id = pr.scientist_id LIMIT 1), pr.scientist_id::text) AS who,
               greatest(public.pms_annexure_b_due(p_cycle_id, 2::smallint),
                        (SELECT c.condoned_until FROM public.pms_condonations c WHERE c.report_id = pr.id)) AS self_due
          FROM public.pms_reports pr
          LEFT JOIN public.pms_representations rep ON rep.report_id = pr.id
         WHERE pr.cycle_id = p_cycle_id AND pr.status <> 'NOT_ASSESSED'
    ), late AS (
        SELECT r.id, r.who, r.status, 2::smallint AS step, r.self_due AS due FROM r WHERE r.status = 'DRAFT'
        UNION ALL
        SELECT r.id, r.who, r.status, 3::smallint, public.pms_annexure_b_due(p_cycle_id, 3::smallint) FROM r
         WHERE r.status IN ('SUBMITTED', 'UNDER_EVALUATION_COMMITTEE_REVIEW')
        UNION ALL
        SELECT r.id, r.who, r.status, 4::smallint, public.pms_annexure_b_due(p_cycle_id, 4::smallint) FROM r
         WHERE r.status = 'EMPOWERED_COMMITTEE_REVIEW'
        UNION ALL
        SELECT r.id, r.who, r.status, 7::smallint, ((r.rep_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date FROM r
         WHERE r.rep_status = 'PENDING'
    )
    SELECT l.id, l.who, l.status, l.step, l.due, (v_today - l.due)::int
      FROM late l WHERE v_today > l.due
     ORDER BY l.step, l.due, l.who;
END;
$$;

-- Daily: deemed acceptance, and reminders for late committee work.
-- Cron only — reads every report of every cycle.
CREATE OR REPLACE FUNCTION public.pms_timeline_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    UPDATE public.pms_reports pr
       SET deemed_accepted_at = now()
     WHERE pr.status = 'FINALIZED'
       AND pr.score_communicated_at IS NOT NULL
       AND pr.deemed_accepted_at IS NULL
       AND public.ist_today() > (pr.score_communicated_at AT TIME ZONE 'Asia/Kolkata')::date + 15
       AND NOT EXISTS (SELECT 1 FROM public.pms_representations rep WHERE rep.report_id = pr.id)
       AND NOT public.pms_cycle_locked(pr.cycle_id);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    -- Representation not disposed within a month → grievance members and PMS admins.
    SELECT DISTINCT w.user_id, 'pms-representation-overdue', 'warning', 'Representation overdue',
           'A PMS representation received on ' || to_char(rep.submitted_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
               || ' is not yet disposed (one month allowed)',
           '/pms/grievance', 'rule', 'pms-rep-overdue:' || rep.id
      FROM public.pms_representations rep
      JOIN public.pms_reports pr ON pr.id = rep.report_id
      JOIN (SELECT g.cycle_id, g.user_id FROM public.pms_grievance_members g
            UNION SELECT c.id, ur.user_id FROM public.appraisal_cycles c
                    CROSS JOIN public.user_roles ur WHERE ur.role IN ('HRAdmin', 'MasterAdmin')) w ON w.cycle_id = pr.cycle_id
     WHERE rep.status = 'PENDING'
       AND public.ist_today() > ((rep.submitted_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date
    UNION ALL
    -- Empowered Committee past 31 July → its members.
    SELECT m.user_id, 'pms-empowered-overdue', 'warning', 'PMS decision overdue',
           'A report has waited for the Empowered Committee since 31 July',
           '/pms/committee', 'rule', 'pms-ec-overdue:' || pr.id
      FROM public.pms_reports pr
      JOIN public.pms_empowered_committee_members m ON m.cycle_id = pr.cycle_id
     WHERE pr.status = 'EMPOWERED_COMMITTEE_REVIEW'
       AND public.ist_today() > public.pms_annexure_b_due(pr.cycle_id, 4::smallint)
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_annexure_b_due(uuid, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_timeline_status(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_delay_report(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pms_timeline_sweep()           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_annexure_b_due(uuid, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_timeline_status(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_delay_report(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_timeline_sweep()               TO service_role;

-- 01:15 UTC = 06:45 IST, before notifications-sweep.
SELECT cron.schedule('pms-timeline-sweep', '15 1 * * *', 'select public.pms_timeline_sweep()');

COMMIT;
