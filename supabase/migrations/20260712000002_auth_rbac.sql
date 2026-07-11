-- ============================================================
-- Stage 02 / 08 — Auth / RBAC
-- Contains : user_roles, user_profiles, auth auto-registration
--            trigger, access_requests + approve/reject RPCs,
--            admin_set_user_roles RPC.
-- Depends  : 01 extensions_helpers
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

-- Composite PK supports multi-role per user.
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role                 text NOT NULL CHECK (role IN (
                             'Director', 'DivisionHead', 'Scientist', 'Technician',
                             'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
                             'DefaultUser', 'HOD', 'Student', 'ProjectStaff', 'Guest',
                             'EmpoweredCommittee'
                         )),
    division_code        text NULL,
    must_change_password boolean NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_roles_division_code_idx
    ON public.user_roles(division_code);

CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                text NULL,
    must_change_password boolean NOT NULL DEFAULT true,
    active_role          text NULL,
    last_seen_at         timestamptz NULL
);

-- ──────────────────────────────────────────────────────────────
-- 2. AUTO-REGISTRATION TRIGGER
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role, must_change_password)
    VALUES (NEW.id, 'DefaultUser', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_profiles (user_id, email, must_change_password)
    VALUES (NEW.id, NEW.email, true)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ──────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTIONS
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_role(check_role text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = check_role
    )
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS — user_roles / user_profiles
-- ──────────────────────────────────────────────────────────────
-- NOTE: there is intentionally no "select all rows" admin policy on
-- user_roles. An earlier version had one (user_has_role() re-triggers RLS
-- on user_roles from inside a policy context, causing infinite recursion —
-- Postgres error 42P17). The "select own row" policy is sufficient for the
-- login flow (AuthContext only ever queries the caller's own user_id).
-- Admin features that need to list other users' roles go through
-- SECURITY DEFINER RPCs (admin_set_user_roles below) or the service role.

ALTER TABLE public.user_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own"
    ON public.user_roles FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY "user_roles_insert_admin"
    ON public.user_roles FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_update_admin"
    ON public.user_roles FOR UPDATE TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_delete_admin"
    ON public.user_roles FOR DELETE TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_update_own_last_seen"
    ON public.user_roles FOR UPDATE TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "user_profiles_select_own"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_profiles_update_own"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_select_admin"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_profiles_manage_admin"
    ON public.user_profiles FOR ALL TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

-- ──────────────────────────────────────────────────────────────
-- 5. AUDIT LOG (shared sink — not PMS-exclusive despite the name)
-- ──────────────────────────────────────────────────────────────
-- Originated with PMS but is the audit sink for admin_set_user_roles below
-- and all PMS RPCs (stage 04). Created here so both can depend on it without
-- a forward reference.

CREATE TABLE IF NOT EXISTS public.pms_audit_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    action      text NOT NULL,
    entity_type text NOT NULL,
    entity_id   uuid NOT NULL,
    details     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pms_audit_logs_entity_idx
    ON public.pms_audit_logs(entity_type, entity_id);

ALTER TABLE public.pms_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.pms_audit_logs FOR SELECT TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- ──────────────────────────────────────────────────────────────
-- 6. ACCESS REQUESTS — self-service role requests for DefaultUser accounts
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email              text,
    requested_roles    text[] NOT NULL,
    requested_division text NULL,
    justification      text NOT NULL DEFAULT '',
    status             text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    review_note        text NULL,
    reviewed_by        uuid NULL REFERENCES auth.users(id),
    reviewed_at        timestamptz NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- At most one open request per user.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
    ON public.access_requests(user_id) WHERE status = 'PENDING';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_select_own" ON public.access_requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "access_requests_insert_own" ON public.access_requests
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "access_requests_select_admin" ON public.access_requests
    FOR SELECT TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY "access_requests_update_admin" ON public.access_requests
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- Approve: grant chosen roles, drop DefaultUser, set active_role, mark approved.
CREATE OR REPLACE FUNCTION public.approve_access_request(
    p_request_id uuid, p_roles text[], p_division text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user uuid;
    v_role text;
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    SELECT user_id INTO v_user FROM public.access_requests
        WHERE id = p_request_id AND status = 'PENDING';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'request not found or not pending';
    END IF;

    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_user, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'DefaultUser';
    UPDATE public.user_profiles SET active_role = p_roles[1] WHERE user_id = v_user;

    UPDATE public.access_requests
        SET status = 'APPROVED', review_note = NULL, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_access_request(
    p_request_id uuid, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    UPDATE public.access_requests
        SET status = 'REJECTED', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id AND status = 'PENDING';
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7. ONGOING ROLE MANAGEMENT (post-onboarding)
-- ──────────────────────────────────────────────────────────────
-- access_requests covers first-time onboarding only; this RPC handles
-- ongoing changes (e.g. a Scientist who becomes HOD), with lockout guards
-- so an admin can never strip the system's last administrator.

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
