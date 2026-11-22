-- ============================================================
-- Stage 09 / 09 — Stage 0 Hardening & Debt Closure
-- Contains : import_events.division_code + per-division sweep,
--            resolve_unique_staff_id + unambiguous staff-key backfill,
--            extended identity_link_authors / identity_set_link,
--            removal of display-name RLS fallback predicates (A3b)
-- Depends  : Stages 01–08 (20261121000001–20261121000008)
-- Rerun    : Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ============================================================

-- ── 1. Per-division freshness attribution (Item 0.4) ──────────────────────

ALTER TABLE public.import_events
    ADD COLUMN IF NOT EXISTS division_code text;

CREATE INDEX IF NOT EXISTS import_events_file_type_div_idx
    ON public.import_events (file_type, division_code, uploaded_at DESC);

CREATE OR REPLACE FUNCTION public.contribution_requests_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    s       record;
    v_n     integer := 0;
    v_id    uuid;
    v_to    uuid;
    v_event uuid;
BEGIN
    FOR s IN
        SELECT g.domain, g.division_code, li.id AS import_id
          FROM (SELECT domain, division_code, min(cadence_days) AS cadence_days,
                       'stale:' || domain || ':' || coalesce(division_code, '*') || ':' AS prefix
                  FROM data_stewards
                 WHERE kind = 'steward'
                 GROUP BY domain, division_code) g
          LEFT JOIN LATERAL (
                SELECT ie.id, ie.uploaded_at
                  FROM import_events ie
                 WHERE ie.file_type = g.domain
                   AND (g.division_code IS NULL OR ie.division_code IS NULL OR ie.division_code = g.division_code)
                 ORDER BY ie.uploaded_at DESC
                 LIMIT 1) li ON true
         WHERE (li.id IS NULL
                OR li.uploaded_at < now() - make_interval(days => g.cadence_days))
           -- One live refresh request per (domain, division): a newer stale
           -- period waits until the previous one is done or declined.
           AND NOT EXISTS (
                SELECT 1 FROM contribution_requests c
                 WHERE left(c.dedupe_key, length(g.prefix)) = g.prefix
                   AND c.status NOT IN ('done','declined'))
    LOOP
        v_id := NULL;
        v_to := contribution_steward_for(s.domain, s.division_code);

        INSERT INTO contribution_requests
            (domain, division_code, title, reason, link, requested_by, assignee_id, dedupe_key)
        VALUES (s.domain, s.division_code,
                'Refresh ' || s.domain || ' data',
                CASE WHEN s.import_id IS NULL THEN 'No import has been recorded for this domain'
                     ELSE 'The latest import is older than the agreed refresh cadence' END,
                '/data', NULL, v_to,
                'stale:' || s.domain || ':' || coalesce(s.division_code, '*') || ':'
                    || coalesce(s.import_id::text, 'none'))
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            v_n := v_n + 1;
            INSERT INTO contribution_request_events (request_id, actor_id, action, from_status, to_status)
            VALUES (v_id, NULL, 'created', NULL, 'open')
            RETURNING id INTO v_event;

            IF v_to IS NOT NULL THEN
                INSERT INTO notifications (user_id, kind, severity, title, body, link, dedupe_key)
                VALUES (v_to, 'contribution', 'warning', 'Data refresh due',
                        'Refresh ' || s.domain || ' data',
                        '/work?r=' || v_id, 'contribution:' || v_id || ':' || v_event)
                ON CONFLICT (user_id, dedupe_key) DO NOTHING;
            END IF;
        END IF;
    END LOOP;

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.contribution_requests_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contribution_requests_sweep() TO service_role;

-- ── 2. Unambiguous staff linking & removal of display-name RLS fallback (Item 0.5 / A3b) ──

CREATE OR REPLACE FUNCTION public.resolve_unique_staff_id(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT CASE
        WHEN p_name IS NULL OR length(btrim(p_name)) = 0 THEN NULL
        WHEN length(coalesce(public.person_name_key(p_name), '')) >= 3 THEN (
            SELECT min(s."ID")
              FROM public.staff s
             WHERE public.person_name_key(s."Name") = public.person_name_key(p_name)
            HAVING count(*) = 1
        )
        ELSE (
            SELECT u.staff_id
              FROM public.unique_staff_names u
             WHERE u.name = btrim(p_name)
        )
    END;
$$;

REVOKE ALL ON FUNCTION public.resolve_unique_staff_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_unique_staff_id(text) TO service_role;

-- Backfill unambiguous staff foreign keys on existing rows
UPDATE public.projects
   SET pi_staff_id = public.resolve_unique_staff_id("PrincipalInvestigator")
 WHERE pi_staff_id IS NULL
   AND "PrincipalInvestigator" IS NOT NULL
   AND length(btrim("PrincipalInvestigator")) > 0
   AND public.resolve_unique_staff_id("PrincipalInvestigator") IS NOT NULL;

UPDATE public.phd_students
   SET supervisor_staff_id = public.resolve_unique_staff_id("SupervisorName")
 WHERE supervisor_staff_id IS NULL
   AND "SupervisorName" IS NOT NULL
   AND length(btrim("SupervisorName")) > 0
   AND public.resolve_unique_staff_id("SupervisorName") IS NOT NULL;

UPDATE public.phd_students
   SET cosupervisor_staff_id = public.resolve_unique_staff_id("CoSupervisorName")
 WHERE cosupervisor_staff_id IS NULL
   AND "CoSupervisorName" IS NOT NULL
   AND length(btrim("CoSupervisorName")) > 0
   AND public.resolve_unique_staff_id("CoSupervisorName") IS NOT NULL;

UPDATE public.project_staff
   SET staff_id = public.resolve_unique_staff_id("StaffName")
 WHERE staff_id IS NULL
   AND "StaffName" IS NOT NULL
   AND length(btrim("StaffName")) > 0
   AND public.resolve_unique_staff_id("StaffName") IS NOT NULL;

WITH unique_email_staff AS (
    SELECT lower(btrim("Email")) AS email_key, min("ID") AS staff_id
      FROM public.staff
     WHERE "Email" IS NOT NULL AND length(btrim("Email")) > 0
     GROUP BY 1
    HAVING count(*) = 1
),
unique_email_users AS (
    SELECT lower(btrim(email)) AS email_key, min(id::text)::uuid AS user_id
      FROM auth.users
     WHERE email IS NOT NULL AND length(btrim(email)) > 0
     GROUP BY 1
    HAVING count(*) = 1
)
UPDATE public.staff s
   SET user_id = u.user_id
  FROM unique_email_staff es
  JOIN unique_email_users u ON u.email_key = es.email_key
 WHERE s."ID" = es.staff_id
   AND s.user_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.staff o WHERE o.user_id = u.user_id);

CREATE OR REPLACE FUNCTION public.identity_link_authors()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_total integer := 0;
    v_n     integer := 0;
BEGIN
    IF NOT coalesce(public.caller_is_admin(), false) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    v_total := public.identity_autolink('OUTPUT') + public.identity_autolink('IP');

    UPDATE public.projects
       SET pi_staff_id = public.resolve_unique_staff_id("PrincipalInvestigator")
     WHERE pi_staff_id IS NULL
       AND "PrincipalInvestigator" IS NOT NULL
       AND length(btrim("PrincipalInvestigator")) > 0
       AND public.resolve_unique_staff_id("PrincipalInvestigator") IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    UPDATE public.phd_students
       SET supervisor_staff_id = public.resolve_unique_staff_id("SupervisorName")
     WHERE supervisor_staff_id IS NULL
       AND "SupervisorName" IS NOT NULL
       AND length(btrim("SupervisorName")) > 0
       AND public.resolve_unique_staff_id("SupervisorName") IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    UPDATE public.phd_students
       SET cosupervisor_staff_id = public.resolve_unique_staff_id("CoSupervisorName")
     WHERE cosupervisor_staff_id IS NULL
       AND "CoSupervisorName" IS NOT NULL
       AND length(btrim("CoSupervisorName")) > 0
       AND public.resolve_unique_staff_id("CoSupervisorName") IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    UPDATE public.project_staff
       SET staff_id = public.resolve_unique_staff_id("StaffName")
     WHERE staff_id IS NULL
       AND "StaffName" IS NOT NULL
       AND length(btrim("StaffName")) > 0
       AND public.resolve_unique_staff_id("StaffName") IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    WITH unique_email_staff AS (
        SELECT lower(btrim("Email")) AS email_key, min("ID") AS staff_id
          FROM public.staff
         WHERE "Email" IS NOT NULL AND length(btrim("Email")) > 0
         GROUP BY 1
        HAVING count(*) = 1
    ),
    unique_email_users AS (
        SELECT lower(btrim(email)) AS email_key, min(id::text)::uuid AS user_id
          FROM auth.users
         WHERE email IS NOT NULL AND length(btrim(email)) > 0
         GROUP BY 1
        HAVING count(*) = 1
    )
    UPDATE public.staff s
       SET user_id = u.user_id
      FROM unique_email_staff es
      JOIN unique_email_users u ON u.email_key = es.email_key
     WHERE s."ID" = es.staff_id
       AND s.user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.staff o WHERE o.user_id = u.user_id);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;

    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.identity_set_link(p_kind text, p_record_id text, p_position integer, p_staff_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
    v_me      text := public.caller_staff_id();
    v_current text;
    v_found   boolean;
BEGIN
    IF p_kind IN ('OUTPUT', 'IP') THEN
        IF p_kind = 'OUTPUT' THEN
            SELECT staff_id, true INTO v_current, v_found FROM public.output_authors
             WHERE output_id = p_record_id AND pos = p_position FOR UPDATE;
        ELSE
            SELECT staff_id, true INTO v_current, v_found FROM public.ip_inventors
             WHERE ip_id = p_record_id AND pos = p_position FOR UPDATE;
        END IF;
        IF NOT coalesce(v_found, false) THEN RAISE EXCEPTION 'No such name on that record'; END IF;

        IF NOT coalesce(
             public.caller_is_admin()
             OR (v_me IS NOT NULL AND p_staff_id = v_me AND (v_current IS NULL OR v_current = v_me))
             OR (v_me IS NOT NULL AND p_staff_id IS NULL AND v_current = v_me),
             false) THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
            RAISE EXCEPTION 'No staff member %', p_staff_id;
        END IF;

        IF p_kind = 'OUTPUT' THEN
            UPDATE public.output_authors
               SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
             WHERE output_id = p_record_id AND pos = p_position;
        ELSE
            UPDATE public.ip_inventors
               SET staff_id = p_staff_id, link_source = 'manual', confirmed_by = auth.uid(), confirmed_at = now()
             WHERE ip_id = p_record_id AND pos = p_position;
        END IF;

    ELSIF p_kind = 'projects.PrincipalInvestigator' THEN
        IF NOT coalesce(public.caller_is_admin(), false) THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
            RAISE EXCEPTION 'No staff member %', p_staff_id;
        END IF;
        UPDATE public.projects
           SET pi_staff_id = p_staff_id
         WHERE "ProjectID" = p_record_id
            OR ("ProjectNo" = p_record_id AND (pi_staff_id IS NULL OR p_staff_id IS NULL));
        IF NOT FOUND THEN RAISE EXCEPTION 'No such project %', p_record_id; END IF;

    ELSIF p_kind = 'phd_students.SupervisorName' THEN
        IF NOT coalesce(public.caller_is_admin(), false) THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
            RAISE EXCEPTION 'No staff member %', p_staff_id;
        END IF;
        UPDATE public.phd_students
           SET supervisor_staff_id = p_staff_id
         WHERE "EnrollmentNo" = p_record_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'No such PhD scholar %', p_record_id; END IF;

    ELSIF p_kind = 'phd_students.CoSupervisorName' THEN
        IF NOT coalesce(public.caller_is_admin(), false) THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
            RAISE EXCEPTION 'No staff member %', p_staff_id;
        END IF;
        UPDATE public.phd_students
           SET cosupervisor_staff_id = p_staff_id
         WHERE "EnrollmentNo" = p_record_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'No such PhD scholar %', p_record_id; END IF;

    ELSIF p_kind = 'project_staff.StaffName' THEN
        IF NOT coalesce(public.caller_is_admin(), false) THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        IF p_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff WHERE "ID" = p_staff_id) THEN
            RAISE EXCEPTION 'No staff member %', p_staff_id;
        END IF;
        UPDATE public.project_staff
           SET staff_id = p_staff_id
         WHERE id = p_record_id
            OR ("ProjectNo" = p_record_id AND (staff_id IS NULL OR p_staff_id IS NULL));
        IF NOT FOUND THEN RAISE EXCEPTION 'No such project staff row %', p_record_id; END IF;

    ELSE
        RAISE EXCEPTION 'Unknown kind: %', p_kind;
    END IF;
END;
$$;

-- Remove display-name fallback predicates from staff-linked RLS policies (A3b)
DROP POLICY IF EXISTS "projects_select" ON public."projects";
CREATE POLICY "projects_select" ON public."projects" FOR SELECT TO authenticated USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_is_pme()
  OR public.caller_in_division("DivisionCode")
  OR (pi_staff_id IS NOT NULL AND pi_staff_id = public.caller_staff_id())
  OR EXISTS (
      SELECT 1
        FROM public.project_staff ps
       WHERE ps."ProjectNo" = projects."ProjectNo"
         AND ps.staff_id IS NOT NULL
         AND ps.staff_id = public.caller_staff_id()
  )
);

DROP POLICY IF EXISTS "phd_students_select" ON public."phd_students";
CREATE POLICY "phd_students_select" ON public."phd_students" FOR SELECT TO authenticated USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("DivisionCode")
  OR (supervisor_staff_id IS NOT NULL AND supervisor_staff_id = public.caller_staff_id())
  OR (cosupervisor_staff_id IS NOT NULL AND cosupervisor_staff_id = public.caller_staff_id())
  OR ("StudentName" = public.caller_staff_name())
);

DROP POLICY IF EXISTS "project_staff_select" ON public."project_staff";
CREATE POLICY "project_staff_select" ON public."project_staff" FOR SELECT TO authenticated USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_is_pme()
  OR public.caller_in_division("DivisionCode")
  OR (staff_id IS NOT NULL AND staff_id = public.caller_staff_id())
);

DROP POLICY IF EXISTS "staff_select_own_supervisor" ON public."staff";
CREATE POLICY "staff_select_own_supervisor" ON public."staff" FOR SELECT TO authenticated USING (
  EXISTS (
      SELECT 1
        FROM public.phd_students ps
       WHERE (ps.supervisor_staff_id = staff."ID" OR ps.cosupervisor_staff_id = staff."ID")
         AND ps."StudentName" = public.caller_staff_name()
  )
);
