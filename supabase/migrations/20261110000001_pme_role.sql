-- ============================================================
-- 20261110000001_pme_role
-- Project lifecycle PL0 (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §4).
--
-- Adds the PME role: the office that carries a project file from
-- submission to archive. It is NOT an admin. proposals_caller_is_admin()
-- is left alone, so PME gains no HR, appraisal or account reach; it gets
-- its own helper and its own policies (20261110000002).
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. The role is assignable ──────────────────────────────────────────
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN (
    'Director', 'DivisionHead', 'Scientist', 'Technician',
    'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
    'DefaultUser', 'HOD', 'Student', 'ProjectStaff', 'Guest',
    'EmpoweredCommittee', 'PME'
));

-- ── 2. Caller helper ───────────────────────────────────────────────────
-- Any-role check, like caller_is_director(): what PME may do must not
-- depend on which dashboard the user happens to have open.
CREATE OR REPLACE FUNCTION public.caller_is_pme()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.caller_has_role('PME');
$$;

REVOKE ALL ON FUNCTION public.caller_is_pme() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_pme() TO authenticated, service_role;

-- ── 3. admin_set_user_roles accepts it ─────────────────────────────────
-- Body unchanged from 20260712000002 apart from 'PME' in v_allowed; the
-- search_path pin from 20261102000004 is restated because CREATE OR REPLACE
-- resets it.
CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
    p_user_id     uuid,
    p_roles       text[],
    p_active_role text,
    p_division    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_allowed     text[] := ARRAY[
        'Director','DivisionHead','HOD','Scientist','Technician',
        'HRAdmin','FinanceAdmin','SystemAdmin','MasterAdmin','Student',
        'ProjectStaff','Guest','DefaultUser','EmpoweredCommittee','PME'
    ];
    v_role        text;
    v_current     text[];
    v_added       text[];
    v_removed     text[];
    v_caller      uuid := auth.uid();
    v_target_had_admin  boolean;
    v_target_keeps_admin boolean;
    v_other_admins int;
BEGIN
    -- 1. Authz
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    -- 2. Validation
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    FOREACH v_role IN ARRAY p_roles LOOP
        IF NOT (v_role = ANY(v_allowed)) THEN
            RAISE EXCEPTION 'invalid role: %', v_role;
        END IF;
    END LOOP;
    IF NOT (p_active_role = ANY(p_roles)) THEN
        RAISE EXCEPTION 'active role must be one of the assigned roles';
    END IF;

    -- Current roles for the target user.
    SELECT COALESCE(array_agg(role), ARRAY[]::text[]) INTO v_current
        FROM public.user_roles WHERE user_id = p_user_id;

    v_target_had_admin   := v_current && ARRAY['SystemAdmin','MasterAdmin'];
    v_target_keeps_admin := p_roles   && ARRAY['SystemAdmin','MasterAdmin'];

    -- 3. Lockout guards
    -- 3a. Caller cannot strip their own last admin role.
    IF p_user_id = v_caller AND v_target_had_admin AND NOT v_target_keeps_admin THEN
        RAISE EXCEPTION 'cannot remove your own last admin role';
    END IF;

    -- 3b. System must retain at least one admin.
    IF v_target_had_admin AND NOT v_target_keeps_admin THEN
        SELECT count(DISTINCT user_id) INTO v_other_admins
            FROM public.user_roles
            WHERE role IN ('SystemAdmin','MasterAdmin')
              AND user_id <> p_user_id;
        IF v_other_admins < 1 THEN
            RAISE EXCEPTION 'cannot remove the last administrator';
        END IF;
    END IF;

    -- 4. Diff
    SELECT COALESCE(array_agg(r), ARRAY[]::text[]) INTO v_added
        FROM unnest(p_roles) r WHERE NOT (r = ANY(v_current));
    SELECT COALESCE(array_agg(r), ARRAY[]::text[]) INTO v_removed
        FROM unnest(v_current) r WHERE NOT (r = ANY(p_roles));

    -- 5. Apply
    DELETE FROM public.user_roles
        WHERE user_id = p_user_id AND NOT (role = ANY(p_roles));
    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (p_user_id, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    -- 6. Active role
    UPDATE public.user_profiles SET active_role = p_active_role WHERE user_id = p_user_id;

    -- 7. Audit
    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
        v_caller, 'ROLES_UPDATED', 'user_roles', p_user_id,
        jsonb_build_object(
            'added', to_jsonb(v_added),
            'removed', to_jsonb(v_removed),
            'active_role', p_active_role,
            'division', p_division
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, text[], text, text) TO authenticated, service_role;

-- ── 4. Assert the boundary ─────────────────────────────────────────────
-- PME must never ride on the admin helper. If someone later adds it to
-- proposals_caller_is_admin(), this is where they find out why not.
DO $$
BEGIN
    IF pg_get_functiondef('public.proposals_caller_is_admin()'::regprocedure) LIKE '%PME%' THEN
        RAISE EXCEPTION 'PME must not be part of proposals_caller_is_admin(): it would inherit every admin policy';
    END IF;
END $$;
