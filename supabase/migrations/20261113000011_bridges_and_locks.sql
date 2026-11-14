-- ============================================================
-- 20261113000011_bridges_and_locks
-- Review of enterprise phases P1–P9. No table changes shape; no data moves.
--
-- 1. Bridges. Two invoker views do the joins once, for everybody:
--      staff_project_links     who is on which project, and as what
--                              (PI · Co-PI · team). Same three sources as
--                              staff_profile_facts.
--      staff_research_summary  one row per staff member the caller may read:
--                              running projects, as PI, PI value, papers, IP,
--                              students, confirmed expertise, retirement day.
--    staff_workload() and expertise_find() now read them. Before, both
--    called staff_profile_facts() once per staff row (ten unions each) —
--    every row of the register for one Workforce page or one search.
--    Same columns, same numbers.
-- 2. Races. project_engage() and project_staff_leave_add() checked a cap and
--    then inserted, with nothing held between: two requests at once could
--    both pass the 6-year tenure cap or the paid-leave limit. Each now locks
--    the row the cap belongs to first.
-- 3. Access. metrics and metric_snapshots were readable by any signed-in
--    account, including one with no role yet. Now verified users only, like
--    csir_rules.
-- Tests: scripts/db/people.db.test.ts, expertise.db.test.ts, metrics.db.test.ts.
-- ============================================================
BEGIN;

-- ── 1. Bridges ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS proposal_copis_staff_idx ON public.proposal_copis (staff_id);
CREATE INDEX IF NOT EXISTS phd_cosupervisor_staff_id_idx ON public.phd_students (cosupervisor_staff_id);

CREATE OR REPLACE VIEW public.staff_project_links WITH (security_invoker = true) AS
SELECT pr.pi_staff_id AS staff_id, pr."ProjectID" AS project_id, 'PI'::text AS role
  FROM public.projects pr
 WHERE pr.pi_staff_id IS NOT NULL
UNION
SELECT c.staff_id, pr."ProjectID", 'Co-PI'
  FROM public.projects pr JOIN public.proposal_copis c ON c.proposal_id = pr.proposal_id
UNION
SELECT ps.staff_id, ps.project_id, coalesce(nullif(ps."Designation", ''), 'Team member')
  FROM public.project_staff ps
 WHERE ps.staff_id IS NOT NULL AND ps.project_id IS NOT NULL;

CREATE OR REPLACE VIEW public.staff_research_summary WITH (security_invoker = true) AS
SELECT s."ID" AS staff_id, s."Name" AS name, s."Division" AS division, s."Designation" AS designation,
       p.active_projects, p.as_pi, p.sanctioned_value,
       (SELECT count(DISTINCT a.output_id)::int FROM public.output_authors a WHERE a.staff_id = s."ID") AS outputs,
       (SELECT count(DISTINCT i.ip_id)::int FROM public.ip_inventors i WHERE i.staff_id = s."ID") AS ip,
       (SELECT count(*)::int FROM public.phd_students st
         WHERE s."ID" IN (st.supervisor_staff_id, st.cosupervisor_staff_id)) AS students,
       (SELECT count(*)::int FROM public.staff_expertise se
         WHERE se.staff_id = s."ID" AND se.confirmed_at IS NOT NULL) AS confirmed_terms,
       (s.dob_date + interval '60 years')::date AS retires_on
  FROM public.staff s
 CROSS JOIN LATERAL (
       -- Running today: the same window staff_workload always used.
       SELECT count(*)::int AS active_projects,
              count(*) FILTER (WHERE l.role = 'PI')::int AS as_pi,
              coalesce(sum(pr.sanctioned_cost) FILTER (WHERE l.role = 'PI'), 0) AS sanctioned_value
         FROM public.staff_project_links l JOIN public.projects pr ON pr."ProjectID" = l.project_id
        WHERE l.staff_id = s."ID"
          AND (pr.start_date IS NULL OR pr.start_date <= public.ist_today())
          AND (pr.end_date IS NULL OR pr.end_date >= public.ist_today())) p;

REVOKE ALL ON public.staff_project_links, public.staff_research_summary FROM PUBLIC, anon;
GRANT SELECT ON public.staff_project_links, public.staff_research_summary TO authenticated, service_role;

-- Body is 20261113000002 on the summary view.
CREATE OR REPLACE FUNCTION public.staff_workload(p_staff_id text DEFAULT NULL)
RETURNS TABLE (staff_id text, name text, division text, active_projects integer, as_pi integer,
               sanctioned_value numeric, awp_year text, awp_time_pct jsonb, overload boolean)
LANGUAGE sql STABLE SET search_path = public AS $$
SELECT r.staff_id, r.name, r.division, r.active_projects, r.as_pi, r.sanctioned_value,
       w.reporting_year, coalesce(w.activity_split, '[]'::jsonb),
       -- ponytail: fixed at 4 (roadmap B3); make it a csir_rules row if the lab sets one.
       r.active_projects > 4
  FROM public.staff_research_summary r
  LEFT JOIN LATERAL (
      SELECT a.reporting_year, a.activity_split FROM public.pms_awps a
       WHERE a.staff_id = r.staff_id ORDER BY a.reporting_year DESC LIMIT 1) w ON true
 WHERE p_staff_id IS NULL OR r.staff_id = p_staff_id
 ORDER BY 4 DESC, 2;
$$;

-- Body is 20261113000006 with the evidence read from the link tables in one
-- pass, and the load from the summary view.
CREATE OR REPLACE FUNCTION public.expertise_find(p_term_ids uuid[] DEFAULT NULL, p_text text DEFAULT NULL)
RETURNS TABLE (staff_id text, name text, division text, designation text, confirmed_terms integer,
               evidence jsonb, evidence_count integer, active_projects integer, overload boolean, retires_on date)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH q AS (
    SELECT nullif(btrim(p_text), '') AS txt
), terms AS (
    SELECT t.id, t.label FROM public.expertise_terms t, q
     WHERE t.status = 'ACTIVE'
       AND (t.id = ANY (coalesce(p_term_ids, '{}'::uuid[]))
            OR (q.txt IS NOT NULL AND t.label ~* public.expertise_pattern(q.txt)))
), patterns AS (
    SELECT public.expertise_pattern(label) AS re FROM terms
    UNION
    SELECT public.expertise_pattern(q.txt) FROM q WHERE q.txt IS NOT NULL
), tagged AS (
    SELECT se.staff_id, count(*)::int AS n
      FROM public.staff_expertise se JOIN terms t ON t.id = se.term_id
     WHERE se.confirmed_at IS NOT NULL
     GROUP BY 1
), ev AS (
    SELECT l.staff_id, 'project'::text AS record_type, pr."ProjectID" AS record_id,
           coalesce(pr."ProjectName", pr."ProjectNo") AS title, '/projects/' || pr."ProjectID" AS link
      FROM public.staff_project_links l JOIN public.projects pr ON pr."ProjectID" = l.project_id
     WHERE EXISTS (SELECT 1 FROM patterns p WHERE coalesce(pr."ProjectName", pr."ProjectNo") ~* p.re)
    UNION
    SELECT a.staff_id, 'scientific_output', o.id, o.title,
           coalesce('https://doi.org/' || nullif(btrim(o.doi), ''), '/intelligence')
      FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id
     WHERE a.staff_id IS NOT NULL AND EXISTS (SELECT 1 FROM patterns p WHERE o.title ~* p.re)
    UNION
    SELECT i.staff_id, 'ip', ip.id, ip.title, '/intelligence'
      FROM public.ip_inventors i JOIN public.ip_intelligence ip ON ip.id = i.ip_id
     WHERE i.staff_id IS NOT NULL AND EXISTS (SELECT 1 FROM patterns p WHERE ip.title ~* p.re)
    UNION
    SELECT s."ID", 'note', s."ID", s."Expertise", '/staff/' || s."ID"
      FROM public.staff s
     WHERE EXISTS (SELECT 1 FROM patterns p WHERE s."Expertise" ~* p.re)
), evidence AS (
    SELECT staff_id,
           jsonb_agg(jsonb_build_object('type', record_type, 'id', record_id, 'title', title, 'link', link)
                     ORDER BY record_type, title) AS items,
           count(*)::int AS n
      FROM ev GROUP BY 1
), hits AS (
    SELECT staff_id FROM tagged UNION SELECT staff_id FROM evidence
)
-- The join to the summary also drops anyone whose staff row the caller may not read.
SELECT r.staff_id, r.name, r.division, r.designation,
       coalesce(tg.n, 0), coalesce(e.items, '[]'::jsonb), coalesce(e.n, 0),
       r.active_projects, r.active_projects > 4, r.retires_on
  FROM hits h
  JOIN public.staff_research_summary r ON r.staff_id = h.staff_id
  LEFT JOIN tagged tg ON tg.staff_id = h.staff_id
  LEFT JOIN evidence e ON e.staff_id = h.staff_id
 ORDER BY 5 DESC, 7 DESC, 2;
$$;

-- ── 2. Races ───────────────────────────────────────────────────────────
-- Body is 20261113000003 plus the lock on the person: a second engagement
-- for the same person waits, then counts the first one in its tenure.
CREATE OR REPLACE FUNCTION public.project_engage(
    p_selection_id uuid, p_person_id uuid, p_from date, p_to date, p_emoluments numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sel  public.project_selections%ROWTYPE;
    v_fail text;
    v_id   uuid;
BEGIN
    IF NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR engages project staff';
    END IF;
    SELECT * INTO v_sel FROM public.project_selections WHERE id = p_selection_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selection not found'; END IF;
    PERFORM 1 FROM public.project_staff_persons WHERE id = p_person_id FOR UPDATE;
    SELECT string_agg(c.detail, '; ') INTO v_fail
      FROM public.project_engagement_check(p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_selection_id) c
     WHERE c.ok = false;
    IF v_fail IS NOT NULL THEN RAISE EXCEPTION 'Cannot engage: %', v_fail; END IF;
    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, emoluments, selection_id, created_by)
    VALUES (p_person_id, v_sel.project_id, v_sel.position_code, p_from, p_to, p_emoluments, p_selection_id, auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
    VALUES (v_sel.project_id, auth.uid(), 'staff',
            'Engaged ' || (SELECT name FROM public.project_staff_persons WHERE id = p_person_id) || ' as ' || v_sel.position_code
                || ' from ' || to_char(p_from, 'DD Mon YYYY') || ' to ' || to_char(p_to, 'DD Mon YYYY'), v_id::text);
    RETURN v_id;
END;
$$;

-- Body is 20261113000003 plus the lock on the engagement: two leave entries
-- at once cannot both fit under the yearly limit.
CREATE OR REPLACE FUNCTION public.project_staff_leave_add(p_engagement_id uuid, p_kind text, p_from date, p_to date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_days  integer := p_to - p_from + 1;
    v_limit integer;
    v_used  integer;
    v_id    uuid;
BEGIN
    IF NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR records leave';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Give the leave dates'; END IF;
    PERFORM 1 FROM public.project_engagements WHERE id = p_engagement_id AND p_from >= from_on AND p_to <= to_on FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Leave must fall within the engagement'; END IF;
    IF p_kind = 'PAID' THEN
        v_limit := public.csir_rule('project_staff.paid_leave_days_per_year')::int;
        SELECT coalesce(sum(to_on - from_on + 1), 0) INTO v_used FROM public.project_staff_leave
         WHERE engagement_id = p_engagement_id AND kind = 'PAID' AND public.fiscal_year_of(from_on) = public.fiscal_year_of(p_from);
        IF v_used + v_days > v_limit THEN RAISE EXCEPTION 'Paid leave: % of % days used this year', v_used, v_limit; END IF;
    ELSIF p_kind IN ('MATERNITY', 'PATERNITY') THEN
        v_limit := public.csir_rule(CASE p_kind WHEN 'MATERNITY' THEN 'project_staff.maternity_leave_days' ELSE 'project_staff.paternity_leave_days' END)::int;
        IF v_days > v_limit THEN RAISE EXCEPTION '% leave is up to % days', initcap(lower(p_kind)), v_limit; END IF;
    ELSIF p_kind <> 'OTHER' THEN
        RAISE EXCEPTION 'Paid, maternity, paternity or other';
    END IF;
    INSERT INTO public.project_staff_leave (engagement_id, kind, from_on, to_on, recorded_by)
    VALUES (p_engagement_id, p_kind, p_from, p_to, auth.uid()) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── 3. Access ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS metrics_select ON public.metrics;
CREATE POLICY metrics_select ON public.metrics FOR SELECT TO authenticated USING (public.caller_is_verified());
DROP POLICY IF EXISTS metric_snapshots_select ON public.metric_snapshots;
CREATE POLICY metric_snapshots_select ON public.metric_snapshots FOR SELECT TO authenticated USING (public.caller_is_verified());

COMMIT;
