-- 20261114120001_project_staff_self_read
-- Lane 1, PJ1 (OTHER-ROLES-HOME-PLAN.md §2): a project staff member reads
-- their own engagement, leave and time used under the cap.
--
-- Until now only the register keepers (PME, HR), institute-wide readers and
-- the project's own people could read project_engagements. The person engaged
-- could not. This adds a login link on the person record and one policy
-- branch. The person and leave policies already follow engagements, so they
-- open for the person without a change.

ALTER TABLE public.project_staff_persons
    ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- The caller's own person record. Definer, so the engagements policy can use
-- it without reading project_staff_persons through that table's own policy
-- (which reads engagements: a loop).
CREATE OR REPLACE FUNCTION public.project_staff_caller_person()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.project_staff_persons WHERE user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.project_staff_caller_person() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_staff_caller_person() TO authenticated, service_role;

-- Body is 20261113000003 plus the self branch.
DROP POLICY IF EXISTS "project_engagements_select" ON public.project_engagements;
CREATE POLICY "project_engagements_select" ON public.project_engagements FOR SELECT TO authenticated
    USING (public.project_staff_caller_keeps() OR public.caller_sees_all_personnel()
           OR public.project_caller_is_party(project_id)
           OR person_id = public.project_staff_caller_person());

-- The register keepers link a login to a person record. One login, one person.
CREATE OR REPLACE FUNCTION public.project_staff_link_user(p_person_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT public.project_staff_caller_keeps() THEN
        RAISE EXCEPTION 'Only PME or HR may link a login to a project staff record';
    END IF;
    IF p_user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.project_staff_persons WHERE user_id = p_user_id AND id <> p_person_id) THEN
        RAISE EXCEPTION 'That login is already linked to another project staff record';
    END IF;
    UPDATE public.project_staff_persons SET user_id = p_user_id WHERE id = p_person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project staff record not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.project_staff_link_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_staff_link_user(uuid, uuid) TO authenticated, service_role;
