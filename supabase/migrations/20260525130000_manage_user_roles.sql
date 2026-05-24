-- Manage user roles: admins edit any user's role assignments after onboarding.
-- access_requests covers first-time onboarding only; this RPC handles ongoing
-- changes (e.g. a Scientist who becomes HOD).

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
    p_user_id     uuid,
    p_roles       text[],
    p_active_role text,
    p_division    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_allowed     text[] := ARRAY[
        'Director','DivisionHead','HOD','Scientist','Technician',
        'HRAdmin','FinanceAdmin','SystemAdmin','MasterAdmin','Student',
        'ProjectStaff','Guest','DefaultUser','EmpoweredCommittee'
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

GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, text[], text, text) TO authenticated;
