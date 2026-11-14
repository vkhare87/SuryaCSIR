-- ============================================================
-- 20261112000009_live_policy_drift
-- The live project carried 34 RLS policies that no migration creates — the
-- pre-2026-07-12 Dashboard-era names. Found when 20261112000003 refused to
-- apply (2026-11-12). Policies are permissive and OR together, so they
-- silently undid the repo's rules:
--   * "Authenticated users can read <t>" USING (true) on nine HR tables —
--     every signed-in user read every row, cancelling the division scoping
--     of 20260718000001 / 20260725000005.
--   * "Enable insert for authenticated users only" WITH CHECK (true) on
--     staff — any signed-in user could add a staff row.
--   * "Admins can write <t>" — HRAdmin / SystemAdmin writes the repo has
--     since narrowed (projects in 20261112000003).
-- Each is dropped. Where the live project had only the old name, the repo
-- policy is created first (evaluation committees; vacancy writes, which keep
-- the live HRAdmin / MasterAdmin rule — SystemAdmin is platform-only).
-- On a database built from the migrations every DROP is a no-op.
-- Tests: scripts/db/policyDrift.db.test.ts.
-- ============================================================
BEGIN;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['contract_staff', 'divisions', 'equipment', 'ip_intelligence', 'phd_students',
                             'project_staff', 'projects', 'scientific_outputs', 'staff'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated users can read ' || t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins can write ' || t, t);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "HRAdmin and MasterAdmin can write contract_staff" ON public.contract_staff;
DROP POLICY IF EXISTS "Enable insert for authenticated users only"        ON public.staff;

-- Identical to user_profiles_manage_admin / _select_admin / _select_own / _update_own.
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"   ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile"     ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"   ON public.user_profiles;

-- Evaluation committees: the live project had only the old "collegium" names.
DROP POLICY IF EXISTS "evaluation_committees_select" ON public.pms_evaluation_committees;
DROP POLICY IF EXISTS "evaluation_committees_write"  ON public.pms_evaluation_committees;
CREATE POLICY "evaluation_committees_select" ON public.pms_evaluation_committees FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluation_committees_write"  ON public.pms_evaluation_committees FOR ALL TO authenticated
    USING (public.pms_is_admin()) WITH CHECK (public.pms_is_admin());
DROP POLICY IF EXISTS "evaluation_committee_members_select" ON public.pms_evaluation_committee_members;
DROP POLICY IF EXISTS "evaluation_committee_members_write"  ON public.pms_evaluation_committee_members;
CREATE POLICY "evaluation_committee_members_select" ON public.pms_evaluation_committee_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluation_committee_members_write"  ON public.pms_evaluation_committee_members FOR ALL TO authenticated
    USING (public.pms_is_admin()) WITH CHECK (public.pms_is_admin());
DROP POLICY IF EXISTS "collegiums_select"         ON public.pms_evaluation_committees;
DROP POLICY IF EXISTS "collegiums_write"          ON public.pms_evaluation_committees;
DROP POLICY IF EXISTS "collegium_members_select"  ON public.pms_evaluation_committee_members;
DROP POLICY IF EXISTS "collegium_members_write"   ON public.pms_evaluation_committee_members;

-- Vacancies: one write policy each, HRAdmin and MasterAdmin (the live rule).
DROP POLICY IF EXISTS "vacancy_advertisements_write"  ON public.vacancy_advertisements;
DROP POLICY IF EXISTS "vacancy_advertisements_insert" ON public.vacancy_advertisements;
DROP POLICY IF EXISTS "vacancy_advertisements_update" ON public.vacancy_advertisements;
DROP POLICY IF EXISTS "vacancy_advertisements_delete" ON public.vacancy_advertisements;
CREATE POLICY "vacancy_advertisements_write" ON public.vacancy_advertisements FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('MasterAdmin'));
DROP POLICY IF EXISTS "vacancy_posts_write"  ON public.vacancy_posts;
DROP POLICY IF EXISTS "vacancy_posts_insert" ON public.vacancy_posts;
DROP POLICY IF EXISTS "vacancy_posts_update" ON public.vacancy_posts;
DROP POLICY IF EXISTS "vacancy_posts_delete" ON public.vacancy_posts;
CREATE POLICY "vacancy_posts_write" ON public.vacancy_posts FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('MasterAdmin'));

-- Nothing of the Dashboard era may remain.
DO $$
DECLARE
    v text;
BEGIN
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (policyname LIKE '% %' OR policyname LIKE 'collegium%');
    IF v IS NOT NULL THEN
        RAISE EXCEPTION 'Dashboard-era policies remain: %', v;
    END IF;
END $$;

COMMIT;
