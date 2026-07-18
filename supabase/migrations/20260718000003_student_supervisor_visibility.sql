-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000003_student_supervisor_visibility
-- Narrow read carve-out: a PhD student can see their own supervisor's
-- staff row (name, designation, division, email, ext) for a contact card.
--
-- 20260718000001_rls_scope_reads.sql self-scopes `staff` to the caller's own
-- row, which correctly hides everyone else — but also hides a student's own
-- supervisor. Postgres OR-combines multiple permissive policies on the same
-- table/command, so this is purely additive: it widens staff_select without
-- touching the existing policy.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "staff_select_own_supervisor" ON public.staff FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.phd_students ps
     WHERE (ps."SupervisorName" = staff."Name" OR ps."CoSupervisorName" = staff."Name")
       AND ps."StudentName" = public.caller_staff_name()
  )
);
