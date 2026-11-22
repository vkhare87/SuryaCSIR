-- 20261122000006_project_staff_link_user
-- Selectively restores project_staff_link_user from PR #32 (20261114120001).
-- Stage 2 (20261121000011) already restored project_staff_persons.user_id,
-- project_staff_person_is_self(), project_staff_persons_select_own,
-- project_engagements_select_own, and my_engagement().

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
