-- ═══════════════════════════════════════════════════════════════════════
-- 20260725000005_staff_keyed_scoping
-- A3b — stop deciding row visibility by comparing display names.
--
-- 20260718000001_rls_scope_reads scoped personnel reads, but every
-- "is this mine?" predicate compares a NAME:
--
--     "PrincipalInvestigator" = public.caller_staff_name()
--     "SupervisorName"        = public.caller_staff_name()
--     ps."StaffName"          = public.caller_staff_name()
--
-- Two staff sharing a display name therefore see each other's projects,
-- budgets and PhD supervision. In an Indian institute roster that is not a
-- corner case — "R. Kumar" recurs. 20260725000002 fixed the *caller* side
-- (resolve through staff.user_id, not an editable email string); this fixes
-- the *target* side by keying the relationship to staff."ID".
--
-- Migration strategy — additive and non-breaking:
--   1. Add nullable staff-ID columns beside each name column.
--   2. Backfill ONLY unambiguous matches (the name resolves to exactly one
--      staff row). Ambiguous names are the leaking ones, and guessing which
--      "R. Kumar" was meant would bake the bug in permanently.
--   3. Policies prefer the key when present and fall back to the name when
--      it is NULL — so nobody loses access on the day this ships.
--   4. public.staff_link_gaps reports what is left. The leak is fully
--      closed only when that view is empty; until then it is narrowed from
--      "every duplicate-name row" to "unreconciled rows only".
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Caller's own staff key ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.caller_staff_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT "ID" FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.caller_staff_id() TO authenticated;

-- ── 2. Key columns ─────────────────────────────────────────────────────

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS pi_staff_id text REFERENCES public.staff("ID") ON DELETE SET NULL;

ALTER TABLE public.phd_students
    ADD COLUMN IF NOT EXISTS supervisor_staff_id   text REFERENCES public.staff("ID") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cosupervisor_staff_id text REFERENCES public.staff("ID") ON DELETE SET NULL;

ALTER TABLE public.project_staff
    ADD COLUMN IF NOT EXISTS staff_id text REFERENCES public.staff("ID") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_pi_staff_id_idx      ON public.projects(pi_staff_id);
CREATE INDEX IF NOT EXISTS phd_supervisor_staff_id_idx   ON public.phd_students(supervisor_staff_id);
CREATE INDEX IF NOT EXISTS project_staff_staff_id_idx    ON public.project_staff(staff_id);

-- ── 3. Backfill unambiguous names only ─────────────────────────────────
-- A name that resolves to exactly one staff row is safe to key. Anything
-- else stays NULL for HR to reconcile — see staff_link_gaps below.

CREATE OR REPLACE VIEW public.unique_staff_names AS
    SELECT trim("Name") AS name, min("ID") AS staff_id
      FROM public.staff
     WHERE "Name" IS NOT NULL AND length(trim("Name")) > 0
     GROUP BY trim("Name")
    HAVING count(*) = 1;

UPDATE public.projects p
   SET pi_staff_id = u.staff_id
  FROM public.unique_staff_names u
 WHERE trim(p."PrincipalInvestigator") = u.name
   AND p.pi_staff_id IS NULL;

UPDATE public.phd_students s
   SET supervisor_staff_id = u.staff_id
  FROM public.unique_staff_names u
 WHERE trim(s."SupervisorName") = u.name
   AND s.supervisor_staff_id IS NULL;

UPDATE public.phd_students s
   SET cosupervisor_staff_id = u.staff_id
  FROM public.unique_staff_names u
 WHERE trim(s."CoSupervisorName") = u.name
   AND s.cosupervisor_staff_id IS NULL;

UPDATE public.project_staff ps
   SET staff_id = u.staff_id
  FROM public.unique_staff_names u
 WHERE trim(ps."StaffName") = u.name
   AND ps.staff_id IS NULL;

-- ── 4. Scoped policies: key first, name only as a fallback ─────────────
-- Postgres OR-combines permissive policies, so these replace rather than
-- add to the 20260718000001 versions.

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_in_division("DivisionCode")
  -- Keyed: exact, immune to duplicate display names.
  OR (pi_staff_id IS NOT NULL AND pi_staff_id = public.caller_staff_id())
  -- Unreconciled: preserve the pre-existing name match so nobody loses
  -- access on migration day. Narrow, and shrinks as gaps are resolved.
  OR (pi_staff_id IS NULL AND "PrincipalInvestigator" = public.caller_staff_name())
  OR EXISTS (
      SELECT 1 FROM public.project_staff ps
       WHERE ps."ProjectNo" = projects."ProjectNo"
         AND ((ps.staff_id IS NOT NULL AND ps.staff_id = public.caller_staff_id())
              OR (ps.staff_id IS NULL AND ps."StaffName" = public.caller_staff_name())))
);

DROP POLICY IF EXISTS "phd_students_select" ON public.phd_students;
CREATE POLICY "phd_students_select" ON public.phd_students FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("DivisionCode")
  OR (supervisor_staff_id IS NOT NULL AND supervisor_staff_id = public.caller_staff_id())
  OR (cosupervisor_staff_id IS NOT NULL AND cosupervisor_staff_id = public.caller_staff_id())
  OR (supervisor_staff_id IS NULL AND "SupervisorName" = public.caller_staff_name())
  OR (cosupervisor_staff_id IS NULL AND "CoSupervisorName" = public.caller_staff_name())
  -- Students are not necessarily on the staff roster, so this one stays a
  -- name match until phd_students gains its own auth link.
  OR "StudentName" = public.caller_staff_name()
);

DROP POLICY IF EXISTS "project_staff_select" ON public.project_staff;
CREATE POLICY "project_staff_select" ON public.project_staff FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_in_division("DivisionCode")
  OR (staff_id IS NOT NULL AND staff_id = public.caller_staff_id())
  OR (staff_id IS NULL AND "StaffName" = public.caller_staff_name())
);

-- ── 5. Keep the keys correct on write ──────────────────────────────────
-- The import pipeline (dataMigration.ts) writes names, not keys. Resolve
-- unambiguous ones automatically so an upload does not silently reopen the
-- gap this migration just closed.

CREATE OR REPLACE FUNCTION public.sync_staff_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        IF NEW.pi_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.pi_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."PrincipalInvestigator");
        END IF;
    ELSIF TG_TABLE_NAME = 'phd_students' THEN
        IF NEW.supervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.supervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."SupervisorName");
        END IF;
        IF NEW.cosupervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.cosupervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."CoSupervisorName");
        END IF;
    ELSIF TG_TABLE_NAME = 'project_staff' THEN
        IF NEW.staff_id IS NULL THEN
            SELECT staff_id INTO NEW.staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."StaffName");
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_staff_key ON public.projects;
CREATE TRIGGER trg_projects_staff_key
    BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.sync_staff_key();

DROP TRIGGER IF EXISTS trg_phd_students_staff_key ON public.phd_students;
CREATE TRIGGER trg_phd_students_staff_key
    BEFORE INSERT OR UPDATE ON public.phd_students
    FOR EACH ROW EXECUTE FUNCTION public.sync_staff_key();

DROP TRIGGER IF EXISTS trg_project_staff_staff_key ON public.project_staff;
CREATE TRIGGER trg_project_staff_staff_key
    BEFORE INSERT OR UPDATE ON public.project_staff
    FOR EACH ROW EXECUTE FUNCTION public.sync_staff_key();

-- ── 6. What HR still has to reconcile ──────────────────────────────────
-- Every row here is one where visibility still falls back to a name match.
-- Drive this to zero and the duplicate-name leak is gone; each row is
-- either a typo, a person missing from the roster, or a genuine collision
-- that a human has to disambiguate.

CREATE OR REPLACE VIEW public.staff_link_gaps AS
    SELECT 'projects'      AS table_name, "ProjectNo"    AS row_key,
           'PrincipalInvestigator' AS name_column, "PrincipalInvestigator" AS unresolved_name
      FROM public.projects
     WHERE pi_staff_id IS NULL
       AND "PrincipalInvestigator" IS NOT NULL AND length(trim("PrincipalInvestigator")) > 0
    UNION ALL
    SELECT 'phd_students', "EnrollmentNo", 'SupervisorName', "SupervisorName"
      FROM public.phd_students
     WHERE supervisor_staff_id IS NULL
       AND "SupervisorName" IS NOT NULL AND length(trim("SupervisorName")) > 0
    UNION ALL
    SELECT 'phd_students', "EnrollmentNo", 'CoSupervisorName', "CoSupervisorName"
      FROM public.phd_students
     WHERE cosupervisor_staff_id IS NULL
       AND "CoSupervisorName" IS NOT NULL AND length(trim("CoSupervisorName")) > 0
    UNION ALL
    SELECT 'project_staff', "ProjectNo", 'StaffName', "StaffName"
      FROM public.project_staff
     WHERE staff_id IS NULL
       AND "StaffName" IS NOT NULL AND length(trim("StaffName")) > 0
    UNION ALL
    -- The caller side of the same problem: a roster row with no login link
    -- falls back to matching on an HRAdmin-editable email string.
    SELECT 'staff', "ID", 'user_id', "Name"
      FROM public.staff
     WHERE user_id IS NULL;

COMMENT ON VIEW public.staff_link_gaps IS
    'Rows whose RLS visibility still falls back to display-name matching. '
    'Empty view = the duplicate-name cross-leak (MED-9/A3b) is fully closed.';

-- Views do not inherit RLS from their base tables unless they are
-- security_invoker, and this one aggregates personnel data — so restrict it
-- rather than leaving it readable by every authenticated user.
ALTER VIEW public.staff_link_gaps SET (security_invoker = on);
ALTER VIEW public.unique_staff_names SET (security_invoker = on);

REVOKE ALL ON public.staff_link_gaps    FROM authenticated, anon, PUBLIC;
REVOKE ALL ON public.unique_staff_names FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.staff_link_gaps  TO service_role;
GRANT SELECT ON public.unique_staff_names TO service_role;

-- Admins read the reconciliation queue through an RPC, so the definer can
-- see past the RLS that would otherwise hide the very rows needing fixing.
CREATE OR REPLACE FUNCTION public.admin_staff_link_gaps()
RETURNS TABLE (table_name text, row_key text, name_column text, unresolved_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (public.caller_is_admin() OR public.caller_has_role('Director')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    RETURN QUERY SELECT * FROM public.staff_link_gaps ORDER BY 1, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_staff_link_gaps() TO authenticated;
