-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000006_user_directory
-- useUserDirectory.ts queried user_roles directly to resolve a user_id to
-- a name/role for EvidencePanel (evaluators of any role, not just admins)
-- and the committee-member UserPicker (admin-gated page). Same RLS gap as
-- admin_list_users: user_roles has no broad-select policy, so a non-admin
-- evaluator got back only their own row — EvidencePanel could never
-- resolve the appraisee's identity.
--
-- Unlike admin_list_users (account-management fields, admin-only), this
-- exposes only identity (email, roles) — comparable sensitivity to the
-- staff table, which is already SELECT-open to all authenticated users —
-- so no role gate, any signed-in user may call it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.user_directory()
RETURNS TABLE (
    user_id uuid,
    email   text,
    roles   text[]
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT
        up.user_id,
        up.email,
        COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS roles
    FROM public.user_profiles up
    LEFT JOIN public.user_roles ur ON ur.user_id = up.user_id
    GROUP BY up.user_id, up.email;
$$;

GRANT EXECUTE ON FUNCTION public.user_directory() TO authenticated;
