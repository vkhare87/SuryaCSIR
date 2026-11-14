-- ============================================================
-- 20261112000010_staff_profile
-- Enterprise P2 / EX1 — one research profile per person.
--
-- staff_profile_facts() lists everything SURYA holds about one staff member,
-- one line per record, each with a link to the record behind it. It is the
-- single source for the profile page, the CV PDF, Ask SURYA and (P4) the PMS
-- pre-fill. SECURITY INVOKER: every table keeps its own RLS, and nothing is
-- returned unless the caller may read the staff row itself — a HoD of another
-- division gets no rows, not an error.
-- People are matched by key only (pi_staff_id, output_authors.staff_id …),
-- never by display name.
-- Tests: scripts/db/profile.db.test.ts.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.staff_profile_facts(p_staff_id text, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (section text, record_type text, record_id text, title text, role text,
               date_from date, date_to date, amount numeric, link text)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH me AS (
    SELECT s."ID" AS id, s.user_id, s."Designation", s.doj_date, s.doapp_date
      FROM public.staff s WHERE s."ID" = p_staff_id
), my_projects AS (
    SELECT pr."ProjectID" AS project_id, 'PI'::text AS role FROM public.projects pr, me WHERE pr.pi_staff_id = me.id
    UNION
    SELECT pr."ProjectID", 'Co-PI' FROM public.projects pr
      JOIN public.proposal_copis c ON c.proposal_id = pr.proposal_id, me WHERE c.staff_id = me.id
    UNION
    SELECT ps.project_id, coalesce(nullif(ps."Designation", ''), 'Team member') FROM public.project_staff ps, me
     WHERE ps.staff_id = me.id AND ps.project_id IS NOT NULL
), my_ip AS (
    SELECT DISTINCT i.ip_id FROM public.ip_inventors i, me WHERE i.staff_id = me.id
), facts AS (
    SELECT 'SERVICE' AS section, 'staff' AS record_type, me.id AS record_id,
           'Joined CSIR-AMPRI' AS title, me."Designation" AS role,
           me.doj_date AS date_from, NULL::date AS date_to, NULL::numeric AS amount, '/staff/' || me.id AS link
      FROM me WHERE me.doj_date IS NOT NULL
    UNION ALL
    SELECT 'SERVICE', 'staff', me.id, 'In present grade', me."Designation", me.doapp_date, NULL, NULL, '/staff/' || me.id
      FROM me WHERE me.doapp_date IS NOT NULL
    UNION ALL
    SELECT 'PROJECT', 'project', pr."ProjectID", coalesce(pr."ProjectName", pr."ProjectNo"), mp.role,
           pr.start_date, pr.end_date, pr.sanctioned_cost, '/projects/' || pr."ProjectID"
      FROM my_projects mp JOIN public.projects pr ON pr."ProjectID" = mp.project_id
    UNION ALL
    SELECT 'OUTPUT', 'scientific_output', o.id, o.title, 'Author ' || a.pos || ' · ' || o.journal,
           make_date(o.year, 1, 1), make_date(o.year, 12, 31), NULL,
           coalesce('https://doi.org/' || nullif(btrim(o.doi), ''), '/intelligence')
      FROM public.output_authors a JOIN public.scientific_outputs o ON o.id = a.output_id, me
     WHERE a.staff_id = me.id
    UNION ALL
    SELECT 'IP', 'ip', ip.id, ip.title, ip.type || ' · ' || ip.status,
           public.try_parse_date(ip.filing_date), public.try_parse_date(ip.grant_date), NULL, '/intelligence'
      FROM my_ip JOIN public.ip_intelligence ip ON ip.id = my_ip.ip_id
    UNION ALL
    SELECT DISTINCT 'TECH_TRANSFER', 'tech_transfer', t.id::text, t.technology_title,
           t.agreement_type || ' · ' || t.licensee, t.agreement_date, NULL::date, t.value_lakhs * 100000, '/partnerships'
      FROM public.tech_transfers t
     WHERE t.linked_ip_id IN (SELECT ip_id FROM my_ip)
        OR t.linked_project_no IN (SELECT pr."ProjectNo" FROM public.projects pr
                                     JOIN my_projects mp ON mp.project_id = pr."ProjectID" AND mp.role IN ('PI', 'Co-PI'))
    UNION ALL
    SELECT 'STUDENT', 'phd_student', st."EnrollmentNo",
           st."StudentName" || coalesce(' — ' || nullif(st."ThesisTitle", ''), ''),
           CASE WHEN st.supervisor_staff_id = me.id THEN 'Supervisor' ELSE 'Co-supervisor' END
               || coalesce(' · ' || nullif(st."CurrentStatus", ''), ''),
           NULL, NULL, NULL, '/phd'
      FROM public.phd_students st, me
     WHERE me.id IN (st.supervisor_staff_id, st.cosupervisor_staff_id)
    UNION ALL
    SELECT 'COMMITTEE', 'committee', c.id::text, c.name,
           CASE WHEN c.chairperson_id = me.id THEN 'Chair'
                WHEN c.secretary_id = me.id THEN 'Secretary'
                ELSE (SELECT m.role FROM public.committee_members m WHERE m.committee_id = c.id AND m.staff_id = me.id LIMIT 1) END,
           c.formed_date, NULL, NULL, '/committees/' || c.id
      FROM public.committees c, me
     WHERE me.id IN (c.chairperson_id, c.secretary_id)
        OR EXISTS (SELECT 1 FROM public.committee_members m WHERE m.committee_id = c.id AND m.staff_id = me.id)
    UNION ALL
    SELECT 'AWP', 'awp', w.id::text, 'Annual work plan ' || w.reporting_year, initcap(lower(replace(w.status, '_', ' '))),
           make_date(left(w.reporting_year, 4)::int, 4, 1), make_date(left(w.reporting_year, 4)::int + 1, 3, 31), NULL,
           '/pms/awp'
      FROM public.pms_awps w, me WHERE w.staff_id = me.id
    UNION ALL
    SELECT 'LESSON', 'project_lessons', l.project_id, coalesce(l.project_name, l.project_no), 'Lessons learned',
           l.approved_at::date, NULL, NULL, '/lessons'
      FROM public.project_lessons l
     WHERE l.project_id IN (SELECT project_id FROM my_projects WHERE role = 'PI')
    UNION ALL
    SELECT 'EQUIPMENT', 'equipment', e."UInsID", e."Name", 'Owner', e.procurement_date, NULL, e.purchase_cost,
           '/facilities/' || e."UInsID"
      FROM public.equipment e, me WHERE me.user_id IS NOT NULL AND e.owner_user_id = me.user_id
)
SELECT f.* FROM facts f
 WHERE (p_from IS NULL OR coalesce(f.date_to, f.date_from, 'infinity'::date) >= p_from)
   AND (p_to IS NULL OR coalesce(f.date_from, '-infinity'::date) <= p_to)
 ORDER BY f.section, f.date_from DESC NULLS LAST, f.title;
$$;

REVOKE ALL ON FUNCTION public.staff_profile_facts(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_profile_facts(text, date, date) TO authenticated, service_role;

COMMIT;
