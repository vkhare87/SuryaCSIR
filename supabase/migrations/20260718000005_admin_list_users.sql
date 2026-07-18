-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000005_admin_list_users
-- ManageUsersTab queried public.user_roles directly for the roster —
-- but per 20260712000002_auth_rbac.sql's own documented design, there is
-- deliberately no admin-select policy on user_roles (an earlier version
-- had one and hit infinite recursion, Postgres 42P17). The RLS "select
-- own row" policy meant every user in the admin roster except the caller
-- showed zero roles. Fix per that same file's stated intent: "Admin
-- features that need to list other users' roles go through SECURITY
-- DEFINER RPCs ... or the service role."
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    user_id       uuid,
    email         text,
    active_role   text,
    roles         text[],
    division_code text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    RETURN QUERY
    SELECT
        up.user_id,
        up.email,
        up.active_role,
        COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles,
        (array_agg(ur.division_code) FILTER (WHERE ur.division_code IS NOT NULL))[1] AS division_code
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
    GROUP BY up.user_id, up.email, up.active_role
    ORDER BY up.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
