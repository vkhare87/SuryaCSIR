-- ============================================================
-- 20261112000022_pms_score_history
-- Enterprise P4 / ES6 — a scientist's PMS record across cycles, for those
-- the rules entitle (owner decision 3: a HoD who is not the RO may not).
--
-- Allowed: the scientist; the Director; a member of an OPEN cycle's
-- Empowered Committee; the Reporting or Reviewing Officer of the panel the
-- scientist's report in an OPEN cycle was sent to. Anyone else gets no rows
-- — not an error, and never another person's rows.
-- normalised = the score as a percentage of that cycle's lab average
-- (the guideline recommends normalising against the lab).
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.pms_grade(p_score integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_score IS NULL THEN NULL
              WHEN p_score >= 90 THEN 'Outstanding'
              WHEN p_score >= 85 THEN 'Excellent'
              WHEN p_score >= 75 THEN 'Very Good'
              WHEN p_score >= 60 THEN 'Good'
              WHEN p_score >= 50 THEN 'Satisfactory'
              ELSE 'Need Improvement' END;
$$;

CREATE OR REPLACE FUNCTION public.pms_score_history(p_staff_id text)
RETURNS TABLE (cycle_id uuid, cycle text, score integer, grade text, lab_average numeric, normalised numeric, remarks text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid;
BEGIN
    SELECT user_id INTO v_user FROM public.staff WHERE "ID" = p_staff_id;
    IF v_user IS NULL OR auth.uid() IS NULL THEN RETURN; END IF;
    IF NOT coalesce(
           v_user = auth.uid()
        OR public.caller_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members m
                     JOIN public.appraisal_cycles c ON c.id = m.cycle_id
                    WHERE m.user_id = auth.uid() AND c.status = 'OPEN')
        OR EXISTS (SELECT 1 FROM public.pms_reports r
                     JOIN public.appraisal_cycles c ON c.id = r.cycle_id AND c.status = 'OPEN'
                     JOIN public.pms_evaluation_committee_members m ON m.committee_id = r.committee_id
                    WHERE r.scientist_id = v_user AND m.user_id = auth.uid()
                      AND m.role IN ('REPORTING_OFFICER', 'REVIEWING_OFFICER')),
        false) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c.id, c.name, d.final_score, public.pms_grade(d.final_score),
           round(avg_.a, 1), round(100.0 * d.final_score / nullif(avg_.a, 0), 1), d.justification
      FROM public.pms_reports r
      JOIN public.appraisal_cycles c ON c.id = r.cycle_id
      JOIN public.pms_committee_decisions d ON d.report_id = r.id
      CROSS JOIN LATERAL (
          SELECT avg(d2.final_score)::numeric AS a
            FROM public.pms_committee_decisions d2
            JOIN public.pms_reports r2 ON r2.id = d2.report_id
           WHERE r2.cycle_id = r.cycle_id AND r2.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW')) avg_
     WHERE r.scientist_id = v_user AND r.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW')
     ORDER BY c.end_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_score_history(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_score_history(text) TO authenticated, service_role;

COMMIT;
