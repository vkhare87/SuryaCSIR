-- ═══════════════════════════════════════════════════════════════════════
-- 20260725000001_security_hardening
-- Fixes from the 2026-07-25 full-application security audit.
--
--   CRIT-1  user_roles_update_own_last_seen let ANY authenticated user
--           rewrite their own role row → self-granted MasterAdmin.
--   B5      user_profiles_update_own let a user clear their own
--           must_change_password flag and set an active_role they do
--           not hold.
--   HIGH-3  audit_log was readable by every authenticated user.
--           (tickets/responses/events are scoped in ...000002, which has
--           to normalise their identity columns first.)
--   HIGH-4  documents_insert did not constrain access_tier, so any user
--           could self-publish into the institute-wide RAG corpus.
--   MED-7   user_directory() returned every account's email + role set to
--           every caller, including Guest / DefaultUser.
--   MED-10  import_events exposed uploader identity institute-wide.
--
-- Rerun: idempotent (DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. CRIT-1: close the role self-escalation hole ─────────────────────
-- The policy was named for a `last_seen` column that does not exist on
-- user_roles (it lives on user_profiles, which is where AuthContext
-- actually writes it). It granted nothing the app uses, and its WITH CHECK
-- pinned only user_id — leaving `role` and `division_code` freely writable
-- by the row's owner. Supabase default-grants UPDATE on all columns to
-- `authenticated`, so this was directly exploitable from any logged-in
-- browser console.
DROP POLICY IF EXISTS "user_roles_update_own_last_seen" ON public.user_roles;

-- Defence in depth: every legitimate write to user_roles already goes
-- through a SECURITY DEFINER RPC (admin_set_user_roles,
-- approve_access_request), which runs as the definer and is unaffected by
-- this revoke. Nothing in the app writes this table directly.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- ── 2. B5: user_profiles is not a free-form self-service table ──────────
-- last_seen_at and active_role are the only columns a user legitimately
-- writes about themselves. must_change_password is a forced-rotation flag
-- and email is identity — neither may be self-edited.
REVOKE UPDATE ON public.user_profiles FROM authenticated;
GRANT  UPDATE (active_role, last_seen_at) ON public.user_profiles TO authenticated;

-- active_role drives caller_is_div_manager() and every client route guard.
-- Column grants stop a user writing must_change_password, but not writing
-- an active_role they do not hold — so validate it at write time.
CREATE OR REPLACE FUNCTION public.user_profiles_validate_active_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.active_role IS NOT NULL
       AND NEW.active_role IS DISTINCT FROM OLD.active_role
       AND NOT EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = NEW.user_id AND role = NEW.active_role
       )
    THEN
        RAISE EXCEPTION 'active_role % is not assigned to this user', NEW.active_role;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_validate_active_role ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_validate_active_role
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.user_profiles_validate_active_role();

-- The one sanctioned way to clear the forced-rotation flag. The client
-- calls this only after supabase.auth.updateUser() has actually succeeded
-- (see src/pages/ChangePassword.tsx). Note this is a UX gate, not an
-- authorization boundary — the hard control is GoTrue's "require current
-- password for update" setting, which must be enabled in the Supabase
-- Auth dashboard (see docs/ARCHITECTURE-REMEDIATION.md, A8).
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.user_profiles
       SET must_change_password = false
     WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;

-- merge_user_preferences (20260714000001) writes user_profiles.preferences
-- and was SECURITY INVOKER, relying on the update_own RLS policy. The
-- column grant above no longer includes `preferences`, so it becomes
-- SECURITY DEFINER — it was already self-scoped to auth.uid(), which is the
-- same guarantee the RLS policy gave it.
CREATE OR REPLACE FUNCTION public.merge_user_preferences(p_patch jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.user_profiles
    SET preferences = preferences || p_patch
    WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.merge_user_preferences(jsonb) TO authenticated;

-- Admins force a rotation on someone else's next login (MasterAdminView's
-- "reset password" action). Previously a direct UPDATE, which the column
-- grant above now blocks for everyone including admins.
CREATE OR REPLACE FUNCTION public.admin_force_password_reset(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.user_profiles SET must_change_password = true WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user not found';
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PASSWORD_RESET_FLAGGED', 'user_profiles', p_user_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_password_reset(uuid) TO authenticated;

-- ── 3. HIGH-3 (part): audit_log is an admin surface ────────────────────
-- Its PMS sibling pms_audit_logs was already admin-gated
-- (20260712000002_auth_rbac.sql); this one was left USING(true) with the
-- comment "admin gate is UI-side". It records every admin action on
-- committees, meetings, tickets and calendar entries.
DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated
USING (
    public.caller_is_admin()
    OR public.caller_has_role('Director')
);

-- ── 4. HIGH-4: access_tier is not caller-choosable ─────────────────────
-- documents_can_read() grants access_tier='institute' to every
-- authenticated user, and documents_insert only checked ownership — so a
-- Guest or Student could upload a file, register it institute-wide, and
-- have the RAG worker index it into the corpus /ask presents as grounded
-- institute knowledge. Non-admins may now only self-register at the two
-- owner-private tiers; promotion is an admin action.
DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (
      public.caller_is_admin()
      OR public.caller_has_role('Director')
      OR access_tier IN ('owner', 'confidential')
    )
  );

-- Admins promote a reviewed document to a shared tier. Kept as an RPC
-- rather than a broader UPDATE policy so the tier change is the only
-- thing that can happen, and it is audited.
CREATE OR REPLACE FUNCTION public.documents_set_access_tier(
    p_document_id uuid,
    p_tier        text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (public.caller_is_admin() OR public.caller_has_role('Director')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF p_tier NOT IN ('owner', 'confidential', 'division', 'institute') THEN
        RAISE EXCEPTION 'invalid access tier: %', p_tier;
    END IF;

    UPDATE public.documents SET access_tier = p_tier WHERE id = p_document_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'document not found';
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DOCUMENT_TIER_CHANGED', 'documents', p_document_id,
            jsonb_build_object('access_tier', p_tier));
END;
$$;

GRANT EXECUTE ON FUNCTION public.documents_set_access_tier(uuid, text) TO authenticated;

-- ── 5. MED-7: scope the identity directory ─────────────────────────────
-- The original justification ("comparable sensitivity to the staff table,
-- which is already SELECT-open") was invalidated the same day by
-- 20260718000001_rls_scope_reads.sql, which scoped `staff`. Left open this
-- became the widest identity leak in the schema and a ready-made list of
-- who holds MasterAdmin.
--
-- Callers that legitimately need to resolve other users are admins and
-- PMS committee members (EvidencePanel, evaluator queues, UserPicker).
-- Everyone else resolves only themselves.
CREATE OR REPLACE FUNCTION public.caller_sees_directory()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.caller_is_admin()
        OR public.caller_has_role('Director')
        OR EXISTS (SELECT 1 FROM public.pms_evaluation_committee_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members  WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_grievance_members            WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.pms_evaluations                  WHERE evaluator_id = auth.uid());
$$;

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
    WHERE public.caller_sees_directory() OR up.user_id = auth.uid()
    GROUP BY up.user_id, up.email;
$$;

GRANT EXECUTE ON FUNCTION public.caller_sees_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_directory()        TO authenticated;

-- ── 6. MED-10: import_events carries uploader identity ─────────────────
-- uploaded_by_email is PII and the ledger is a Data Management surface;
-- match the insert policy's own role gate.
DROP POLICY IF EXISTS "import_events_select" ON public.import_events;
CREATE POLICY "import_events_select" ON public.import_events FOR SELECT TO authenticated
USING (
    public.caller_is_admin()
    OR public.caller_has_role('Director')
    OR uploaded_by = auth.uid()
);
