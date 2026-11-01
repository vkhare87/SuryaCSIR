-- ═══════════════════════════════════════════════════════════════════════
-- 20261101000002_contribution_target_scope
-- PR #15 review (Codex P2): a request's `prefill` copies the record's
-- fields, and contribution_requests RLS shows the whole row to its
-- assignee and delegate. Assigning someone outside the record's read
-- scope therefore leaked fields (project costs, equipment owner) that the
-- canonical table's RLS would hide from them.
--
-- Fix: a request may only be assigned or delegated to a person who could
-- already read that record. Enforced by a trigger, so every write path
-- (create, delegate, claim, not_mine, the sweep) is covered by one check.
--
-- The scope test mirrors the SELECT policies on projects / equipment
-- (20260725000005, 20260718000001), by role rows rather than the active
-- role: a user holding HOD for a division can switch to it and read it.
-- ponytail: name-matched PI / project-staff fallbacks are not mirrored;
-- such users are routed via the steward until HR reconciles their link.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.contribution_requests_target_scope()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.assignee_id IS NOT NULL
       AND NEW.assignee_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.assignee_id END)
       AND NOT COALESCE(contribution_target_can_see(NEW.assignee_id, NEW.domain, NEW.division_code, NEW.record_ref), false)
    THEN
        RAISE EXCEPTION 'target_out_of_scope';
    END IF;
    IF NEW.delegate_id IS NOT NULL
       AND NEW.delegate_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.delegate_id END)
       AND NOT COALESCE(contribution_target_can_see(NEW.delegate_id, NEW.domain, NEW.division_code, NEW.record_ref), false)
    THEN
        RAISE EXCEPTION 'target_out_of_scope';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contribution_requests_target_scope ON public.contribution_requests;
CREATE TRIGGER contribution_requests_target_scope
    BEFORE INSERT OR UPDATE OF assignee_id, delegate_id ON public.contribution_requests
    FOR EACH ROW EXECUTE FUNCTION public.contribution_requests_target_scope();

-- Answers about any user, so it is internal: only the trigger calls it.
REVOKE EXECUTE ON FUNCTION public.contribution_target_can_see(uuid, text, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contribution_requests_target_scope()
    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF has_function_privilege('authenticated',
         'public.contribution_target_can_see(uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can EXECUTE contribution_target_can_see — it reveals other users'' access';
    END IF;
END $$;
