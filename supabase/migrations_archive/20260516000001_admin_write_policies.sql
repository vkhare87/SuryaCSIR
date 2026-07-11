-- Migration: admin write policies for HR tables that lack them
--
-- The init.sql migration shipped SELECT-everyone + write-admin policies for
-- staff, divisions, contract_staff, scientific_outputs, ip_intelligence.
-- It missed projects, phd_students, project_staff. Those tables have RLS
-- enabled but no write policy at all → admin attempts return permission
-- denied.
--
-- Adds matching policies. Idempotent via DROP POLICY IF EXISTS.

DROP POLICY IF EXISTS "projects_write"       ON public.projects;
DROP POLICY IF EXISTS "project_staff_write"  ON public.project_staff;
DROP POLICY IF EXISTS "phd_students_write"   ON public.phd_students;

CREATE POLICY "projects_write"
    ON public.projects FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "project_staff_write"
    ON public.project_staff FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "phd_students_write"
    ON public.phd_students FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
