-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000001_rls_scope_reads
-- Row-level READ scoping for personnel & financial tables.
--
-- Before this migration every "_select" policy in stage 03 (hr_core) was
-- USING (true): any authenticated user could read the entire staff table
-- (DOB, designation), all project budgets, every PhD record — regardless of
-- what the nav (ACCESS_MAP) showed. RLS only gated writes. This closes that:
-- reads are now scoped by role + division.
--
-- Tiers:
--   • Institute-wide  — Director, HRAdmin/SystemAdmin/MasterAdmin (all rows).
--                       FinanceAdmin additionally sees all projects (funding).
--   • Division-scoped — DivisionHead, HOD: only rows in their own division_code
--                       (resolved from the ACTIVE role).
--   • Self-scoped     — everyone else: their own staff row, own project
--                       involvement, own / supervised PhD records.
--
-- Scope of this migration is deliberately the PERSONNEL + FINANCIAL tables.
-- Research-output / relationship tables (scientific_outputs, ip_intelligence,
-- mous, tech_transfers) and org tables (divisions, vacancies) are LEFT
-- institute-readable on purpose: they carry no personal PII and feed the
-- cross-division collaboration, IP and Intelligence analytics that Director /
-- Explore / Intelligence pages need whole. Scope them later if unit-level
-- confidentiality is required there too.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Caller helper functions ─────────────────────────────────────────
-- Role/division helpers mirror the working proposals_caller_* helpers in
-- stage 06 (read only user_roles / user_profiles, which are self-readable —
-- no recursion). caller_staff_name() reads staff, so it is SECURITY DEFINER
-- to bypass RLS and avoid recursing into the staff policy below.

CREATE OR REPLACE FUNCTION public.caller_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower(auth.jwt() ->> 'email');
$$;

CREATE OR REPLACE FUNCTION public.caller_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.caller_active_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT active_role FROM public.user_profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- division_code lives on user_roles, scoped to the caller's ACTIVE role.
CREATE OR REPLACE FUNCTION public.caller_division()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT ur.division_code
    FROM public.user_roles ur
    JOIN public.user_profiles up ON up.user_id = ur.user_id
   WHERE ur.user_id = auth.uid()
     AND ur.role = up.active_role
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.caller_is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_has_role('HRAdmin')
      OR public.caller_has_role('SystemAdmin')
      OR public.caller_has_role('MasterAdmin');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_director()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_has_role('Director');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_finance()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_has_role('FinanceAdmin');
$$;

-- Division-scoped view is tied to the ACTIVE role (a user holding both
-- Scientist and HOD is scoped only while acting as HOD).
CREATE OR REPLACE FUNCTION public.caller_is_div_manager()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_active_role() IN ('DivisionHead', 'HOD');
$$;

-- Anyone who reads across the whole institute (personnel tables).
CREATE OR REPLACE FUNCTION public.caller_sees_all_personnel()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_is_admin() OR public.caller_is_director();
$$;

-- caller's own staff display name — needed for name-keyed self predicates.
-- SECURITY DEFINER: reads staff regardless of RLS (no recursion).
-- ponytail: name-match self-scope; tighten to a staff.user_id FK when the
-- staff↔auth link lands, then these name joins go away.
CREATE OR REPLACE FUNCTION public.caller_staff_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT "Name" FROM public.staff WHERE lower("Email") = public.caller_email() LIMIT 1;
$$;

-- True when the caller is a division manager WITH a division assigned and the
-- given code matches it. NULL division (unassigned manager) → false.
CREATE OR REPLACE FUNCTION public.caller_in_division(p_div text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.caller_is_div_manager()
     AND public.caller_division() IS NOT NULL
     AND p_div = public.caller_division();
$$;

-- ── 2. Scoped SELECT policies ──────────────────────────────────────────

-- staff: institute-wide (admin/director) | own division (manager) | own row.
DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("Division")
  OR lower("Email") = public.caller_email()
);

-- projects: personnel-wide + FinanceAdmin (funding oversight) | division |
-- own (PI by name, or listed in project_staff for the project).
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_in_division("DivisionCode")
  OR "PrincipalInvestigator" = public.caller_staff_name()
  OR EXISTS (
      SELECT 1 FROM public.project_staff ps
       WHERE ps."ProjectNo" = projects."ProjectNo"
         AND ps."StaffName" = public.caller_staff_name())
);

-- phd_students: division (manager) | own record (student) or supervisees.
DROP POLICY IF EXISTS "phd_students_select" ON public.phd_students;
CREATE POLICY "phd_students_select" ON public.phd_students FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("DivisionCode")
  OR "StudentName"    = public.caller_staff_name()
  OR "SupervisorName" = public.caller_staff_name()
  OR "CoSupervisorName" = public.caller_staff_name()
);

-- phd_milestones: visible for any phd_students row the caller can already see
-- (inherits the scoped policy above via the RLS-filtered EXISTS).
DROP POLICY IF EXISTS "phd_milestones_select" ON public.phd_milestones;
CREATE POLICY "phd_milestones_select" ON public.phd_milestones FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR EXISTS (
      SELECT 1 FROM public.phd_students ps
       WHERE ps."EnrollmentNo" = phd_milestones.enrollment_no)
);

-- project_staff: division (manager) | own assignment.
DROP POLICY IF EXISTS "project_staff_select" ON public.project_staff;
CREATE POLICY "project_staff_select" ON public.project_staff FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_is_finance()
  OR public.caller_in_division("DivisionCode")
  OR "StaffName" = public.caller_staff_name()
);

-- contract_staff: division (manager) | own record.
DROP POLICY IF EXISTS "contract_staff_select" ON public.contract_staff;
CREATE POLICY "contract_staff_select" ON public.contract_staff FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("Division")
  OR "Name" = public.caller_staff_name()
);

-- equipment: division (manager OR technician acting in a division) | owner.
DROP POLICY IF EXISTS "equipment_select" ON public.equipment;
CREATE POLICY "equipment_select" ON public.equipment FOR SELECT TO authenticated
USING (
  public.caller_sees_all_personnel()
  OR public.caller_in_division("Division")
  OR (public.caller_active_role() = 'Technician'
      AND public.caller_division() IS NOT NULL
      AND "Division" = public.caller_division())
  OR owner_user_id = auth.uid()
);

-- NOTE: scientific_outputs, ip_intelligence, mous, tech_transfers, divisions,
-- vacancy_* keep their existing USING(true) SELECT policies (non-PII, feed
-- cross-division analytics). Intentionally untouched.
