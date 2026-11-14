-- ============================================================
-- 20261112000012_profile_consistency
-- Enterprise P2 / EX2 — where a person's profile and the records disagree.
--
-- profile_consistency_issues() (invoker) lists, per staff member:
--   IRINS_OUTPUT_NOT_IN_SURYA    a paper on their IRINS profile with no
--                                scientific_outputs row (same DOI or title)
--   OUTPUT_AUTHOR_UNLINKED       an unlinked author name that may be them
--   PI_NAME_UNLINKED             an unlinked project PI name that may be them
--   STUDENT_SUPERVISOR_UNLINKED  an unlinked (co-)supervisor name that may be them
--   AWP_PROJECT_NOT_ON_TEAM      a project their work plan names, where they
--                                are not PI, co-PI or on the team
-- profile_consistency_sweep() (weekly, cron only) raises one live
-- contribution request per person with issues, assigned to that person.
-- Tests: scripts/db/profile.db.test.ts.
-- ============================================================
BEGIN;

-- May these two names be the same person? Equal keys, or one key inside
-- the other ("Asha Verma" / "Dr. Asha Rani Verma" does not; "Verma" alone
-- is too short to say). Same test identity_link_gaps() counts candidates by.
CREATE OR REPLACE FUNCTION public.person_name_may_be(a text, b text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(length(public.person_name_key(a)) >= 3 AND length(public.person_name_key(b)) >= 3
     AND (public.person_name_key(a) = public.person_name_key(b)
          OR strpos(public.person_name_key(a), public.person_name_key(b)) > 0
          OR strpos(public.person_name_key(b), public.person_name_key(a)) > 0), false);
$$;

CREATE OR REPLACE FUNCTION public.profile_consistency_issues(p_staff_id text DEFAULT NULL)
RETURNS TABLE (staff_id text, kind text, record_ref text, detail text)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH people AS (
    SELECT s."ID" AS id, s."Name" AS name, s."VidwanID" AS vidwan
      FROM public.staff s
     WHERE (p_staff_id IS NULL OR s."ID" = p_staff_id) AND coalesce(btrim(s."Name"), '') <> ''
), irins_pubs AS (
    SELECT p.id, pub
      FROM people p
      JOIN public.irins_profiles ir ON ir.vidwan_id = p.vidwan
     CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(ir.profile_data -> 'publications') = 'array'
                THEN ir.profile_data -> 'publications' ELSE '[]'::jsonb END) pub
     WHERE coalesce(btrim(pub ->> 'title'), '') <> ''
)
SELECT i.id, 'IRINS_OUTPUT_NOT_IN_SURYA', coalesce(nullif(btrim(i.pub ->> 'doi'), ''), i.pub ->> 'title'),
       'On IRINS, not in SURYA: ' || (i.pub ->> 'title') || coalesce(' (' || nullif(i.pub ->> 'year', '') || ')', '')
  FROM irins_pubs i
 WHERE NOT EXISTS (
        SELECT 1 FROM public.scientific_outputs o
         WHERE (nullif(btrim(i.pub ->> 'doi'), '') IS NOT NULL AND lower(btrim(o.doi)) = lower(btrim(i.pub ->> 'doi')))
            OR regexp_replace(lower(o.title), '[^a-z0-9]', '', 'g') = regexp_replace(lower(i.pub ->> 'title'), '[^a-z0-9]', '', 'g'))
UNION ALL
SELECT p.id, 'OUTPUT_AUTHOR_UNLINKED', a.output_id || ':' || a.pos,
       'Is "' || a.author_name || '" on "' || o.title || '" you?'
  FROM people p
  JOIN public.output_authors a ON a.staff_id IS NULL AND a.link_source IS NULL AND public.person_name_may_be(a.author_name, p.name)
  JOIN public.scientific_outputs o ON o.id = a.output_id
UNION ALL
SELECT p.id, 'PI_NAME_UNLINKED', pr."ProjectID",
       'Is the PI "' || pr."PrincipalInvestigator" || '" of ' || coalesce(pr."ProjectNo", pr."ProjectID") || ' you?'
  FROM people p
  JOIN public.projects pr ON pr.pi_staff_id IS NULL AND public.person_name_may_be(pr."PrincipalInvestigator", p.name)
UNION ALL
SELECT p.id, 'STUDENT_SUPERVISOR_UNLINKED', st."EnrollmentNo",
       'Do you supervise ' || coalesce(st."StudentName", st."EnrollmentNo") || '?'
  FROM people p
  JOIN public.phd_students st
    ON (st.supervisor_staff_id IS NULL AND public.person_name_may_be(st."SupervisorName", p.name))
    OR (st.cosupervisor_staff_id IS NULL AND public.person_name_may_be(st."CoSupervisorName", p.name))
UNION ALL
SELECT DISTINCT p.id, 'AWP_PROJECT_NOT_ON_TEAM', pr."ProjectID",
       'Your work plan ' || w.reporting_year || ' names ' || pr."ProjectNo" || ', but you are not on its team'
  FROM people p
  JOIN public.pms_awps w ON w.staff_id = p.id
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(w.projects) = 'array' THEN w.projects ELSE '[]'::jsonb END) e
  JOIN public.projects pr ON length(btrim(pr."ProjectNo")) >= 4
                         AND strpos(upper(coalesce(e ->> 'details', '')), upper(btrim(pr."ProjectNo"))) > 0
 WHERE coalesce(pr.pi_staff_id, '') <> p.id
   AND NOT EXISTS (SELECT 1 FROM public.project_staff ps WHERE ps.project_id = pr."ProjectID" AND ps.staff_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.proposal_copis c WHERE c.proposal_id = pr.proposal_id AND c.staff_id = p.id)
ORDER BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.profile_consistency_issues(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_consistency_issues(text) TO authenticated, service_role;

-- A person may be asked about their own staff record. Body is
-- 20261101000002 plus the 'staff' branch.
CREATE OR REPLACE FUNCTION public.contribution_target_can_see(
    p_user uuid, p_domain text, p_division text, p_ref text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        EXISTS (SELECT 1 FROM user_roles
                 WHERE user_id = p_user
                   AND role IN ('HRAdmin','SystemAdmin','MasterAdmin','Director'))
     OR EXISTS (SELECT 1 FROM data_stewards s
                 WHERE s.user_id = p_user AND s.domain = p_domain
                   AND (s.division_code IS NULL OR s.division_code = p_division))
     OR (p_division IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_roles
             WHERE user_id = p_user AND role IN ('HOD','DivisionHead')
               AND division_code = p_division))
     OR (p_domain = 'staff' AND EXISTS (
            SELECT 1 FROM staff st WHERE st."ID" = p_ref AND st.user_id = p_user))
     OR (p_domain = 'projects' AND (
            EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user AND role = 'FinanceAdmin')
         OR EXISTS (SELECT 1 FROM projects p JOIN staff st ON st."ID" = p.pi_staff_id
                     WHERE p."ProjectID" = p_ref AND st.user_id = p_user)
         OR EXISTS (SELECT 1 FROM projects p
                      JOIN project_staff ps ON ps."ProjectNo" = p."ProjectNo"
                      JOIN staff st ON st."ID" = ps.staff_id
                     WHERE p."ProjectID" = p_ref AND st.user_id = p_user)))
     OR (p_domain = 'equipment' AND (
            (p_division IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_roles
                 WHERE user_id = p_user AND role = 'Technician'
                   AND division_code = p_division))
         OR EXISTS (SELECT 1 FROM equipment e
                     WHERE e."UInsID" = p_ref AND e.owner_user_id = p_user)));
$$;

-- Weekly. One live request per person: a new one waits until the last is
-- done or declined. Cron only — reads every person's profile.
CREATE OR REPLACE FUNCTION public.profile_consistency_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    s       record;
    v_n     integer := 0;
    v_id    uuid;
    v_event uuid;
BEGIN
    FOR s IN
        SELECT st."ID" AS staff_id, st.user_id, st."Division" AS division,
               count(*) AS issues, string_agg(DISTINCT i.kind, ', ') AS kinds
          FROM public.profile_consistency_issues(NULL) i
          JOIN public.staff st ON st."ID" = i.staff_id
         WHERE st.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.contribution_requests c
                            WHERE left(c.dedupe_key, length('profile:' || st."ID" || ':')) = 'profile:' || st."ID" || ':'
                              AND c.status NOT IN ('done', 'declined'))
         GROUP BY st."ID", st.user_id, st."Division"
    LOOP
        v_id := NULL;
        INSERT INTO public.contribution_requests
            (domain, record_ref, division_code, title, reason, link, requested_by, assignee_id, dedupe_key)
        VALUES ('staff', s.staff_id, s.division, 'Check your research profile',
                s.issues || ' item(s) to confirm: ' || s.kinds, '/me', NULL, s.user_id,
                'profile:' || s.staff_id || ':' || public.ist_today())
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            v_n := v_n + 1;
            INSERT INTO public.contribution_request_events (request_id, actor_id, action, from_status, to_status)
            VALUES (v_id, NULL, 'created', NULL, 'open') RETURNING id INTO v_event;
            INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
            VALUES (s.user_id, 'contribution', 'info', 'Check your research profile',
                    s.issues || ' item(s) where your profile and the records disagree',
                    '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
            ON CONFLICT (user_id, dedupe_key) DO NOTHING;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profile_consistency_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_consistency_sweep() TO service_role;

-- Mondays 02:00 UTC = 07:30 IST.
SELECT cron.schedule('profile-consistency-sweep', '0 2 * * 1', 'select public.profile_consistency_sweep()');

COMMIT;
