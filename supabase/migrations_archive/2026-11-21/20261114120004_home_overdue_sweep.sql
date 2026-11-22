-- 20261114120004_home_overdue_sweep
-- Lane 1, SH4 (SCIENTIST-HOME-PLAN.md §2, escalation ladder): when a
-- progress report is 7 days past its due date and still not sent, the head of
-- the project's division (held or acting) is told, once per report.
--
-- The scientist's screen states this consequence on the report timer. The
-- screen may say only what this sweep does.
--
-- Window: due between 37 and 7 days ago. Older reports are already known to
-- the head through the monitoring pages; telling about every one of them on
-- the first run would bury the messages that matter.

CREATE OR REPLACE FUNCTION public.home_overdue_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT DISTINCT h.user_id, 'report_overdue_head', 'warning',
           'Progress report 7 days late: ' || p."ProjectNo",
           coalesce(nullif(p."ProjectName", ''), p."ProjectNo") || ' · ' || s.period_label || ' · due ' || to_char(s.due_date, 'DD Mon'),
           '/projects/' || p."ProjectID" || '?tab=monitoring', 'rule', 'overdue7:' || s.id
      FROM public.project_review_slots s
      JOIN public.projects p ON p."ProjectID" = s.project_id
      JOIN (SELECT user_id, division_code FROM public.user_roles WHERE role IN ('HOD', 'DivisionHead')
            UNION
            SELECT acting_user_id, division_code FROM public.acting_assignments
             WHERE role IN ('HOD', 'DivisionHead') AND public.ist_today() BETWEEN from_on AND to_on) h
        ON h.division_code = p."DivisionCode"
     WHERE s.kind = 'PROGRESS_REPORT'
       AND s.status = 'PENDING'
       AND s.due_date BETWEEN public.ist_today() - 37 AND public.ist_today() - 7
       AND coalesce(p.stage, 'ACTIVE') NOT IN ('CLOSED', 'ARCHIVED', 'FORECLOSED')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.home_overdue_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.home_overdue_sweep() TO service_role;

-- 01:45 UTC = 07:15 IST, after the PMS timeline sweep, before the working day.
SELECT cron.schedule('home-overdue-sweep', '45 1 * * *', 'select public.home_overdue_sweep()');
