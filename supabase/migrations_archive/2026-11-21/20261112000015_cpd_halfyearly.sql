-- ============================================================
-- 20261112000015_cpd_halfyearly
-- Enterprise P3 / EP5 — the half-yearly performance report to CPD (§5).
--
-- One row per HQ-track project running in the half-year that ends on
-- p_period_end: reviews due, held and missed in the period (from the review
-- slots of 20261111000003), money received and spent to the period end,
-- milestones, and progress reports submitted. The report is due on the
-- dates in csir_rule('monitoring.cpd_halfyearly_due') (15 April, 15
-- September); the UI reads them from the registry.
-- Invoker: the projects' RLS decides who sees which rows (PME sees all).
-- Tests: scripts/db/compliance.db.test.ts.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.project_cpd_halfyearly(p_period_end date)
RETURNS TABLE (project_id text, project_no text, title text, pi text, category text, stage text,
               start_date date, end_date date,
               reviews_due integer, reviews_held integer, reviews_missed integer, last_review_on date,
               received numeric, spent numeric, milestones_achieved integer, milestones_total integer,
               reports_submitted integer)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH period AS (SELECT (p_period_end - interval '6 months' + interval '1 day')::date AS from_on, p_period_end AS to_on),
review_slots AS (
    SELECT s.* FROM public.project_review_slots s, period
     WHERE s.kind <> 'PROGRESS_REPORT' AND s.status <> 'CANCELLED'
       AND s.due_date BETWEEN period.from_on AND period.to_on
)
SELECT p."ProjectID", p."ProjectNo", p."ProjectName",
       coalesce((SELECT pr.pi_name FROM public.proposals pr WHERE pr.id = p.proposal_id),
                (SELECT st."Name" FROM public.staff st WHERE st."ID" = p.pi_staff_id), p."PrincipalInvestigator"),
       upper(btrim(coalesce((SELECT pr.category_code FROM public.proposals pr WHERE pr.id = p.proposal_id), p."ProjectCategory"))),
       p.stage, p.start_date, p.end_date,
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID"),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'DONE'),
       (SELECT count(*)::int FROM review_slots s WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING'
                                                  AND s.due_date < public.ist_today()),
       (SELECT max(s.held_on) FROM public.project_review_slots s WHERE s.project_id = p."ProjectID"
                                                                 AND s.status = 'DONE' AND s.held_on <= p_period_end),
       (SELECT coalesce(sum(r.amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p."ProjectID" AND r.received_on <= p_period_end),
       (SELECT coalesce(sum(e.amount), 0) FROM public.project_expenditure e WHERE e.project_id = p."ProjectID"
                                                                         AND e.fiscal_year <= public.fiscal_year_of(p_period_end)),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status = 'ACHIEVED' AND m.achieved_on <= p_period_end),
       (SELECT count(*)::int FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status <> 'DROPPED'),
       (SELECT count(*)::int FROM public.project_reports r, period WHERE r.project_id = p."ProjectID"
                                                                 AND r.submitted_at::date BETWEEN period.from_on AND period.to_on)
  FROM public.projects p, period
 WHERE p.track = 'HQ'
   AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'CLOSED', 'FORECLOSED', 'ARCHIVED')
   AND (p.start_date IS NULL OR p.start_date <= period.to_on)
   AND (p.end_date IS NULL OR p.end_date >= period.from_on)
 ORDER BY p."ProjectNo";
$$;

REVOKE ALL ON FUNCTION public.project_cpd_halfyearly(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_cpd_halfyearly(date) TO authenticated, service_role;

COMMIT;
