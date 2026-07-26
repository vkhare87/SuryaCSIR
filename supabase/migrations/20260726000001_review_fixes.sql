-- ═══════════════════════════════════════════════════════════════════════
-- 20260726000001_review_fixes
-- Fixes from the Codex review of PR #10 (commit 851e7477). All four
-- findings were valid; three are defects introduced by the 2026-07-25 pass
-- itself.
--
--   P1  helpdesk_add_response authorised the AUTHOR but never the TICKET.
--   P1  clear_must_change_password could be called directly, retiring the
--       forced-rotation flag without any password ever changing.
--   P2  sync_staff_key never re-resolved a key once set, so renaming the
--       PI/supervisor left visibility with the previous person.
--   (the fourth, a client passing staff."ID" into a uuid RPC parameter, is
--    fixed in src/pages/helpdesk/TicketDetail.tsx)
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. helpdesk_add_response: authorise against the ticket ─────────────
-- 20260725000002/000004 added authorisation to _update_status and
-- _assign_ticket and held up _add_response as the function that "already had
-- the right check". It did not. It verified that p_author_id is the caller —
-- which stops actor forgery — but never that the caller has anything to do
-- with the ticket. Being SECURITY DEFINER it bypasses RLS, so anyone who
-- learned a ticket UUID could post into a private HRGrievance thread that
-- tickets_select exists to hide.
--
-- The predicate mirrors tickets_select exactly: if you cannot read the
-- ticket, you cannot write to it.
CREATE OR REPLACE FUNCTION public.helpdesk_add_response(
    p_ticket_id uuid, p_author_id uuid, p_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_response_id  uuid;
    v_submitted_by uuid;
    v_assigned_to  uuid;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF p_author_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;

    SELECT submitted_by, assigned_to INTO v_submitted_by, v_assigned_to
      FROM public.tickets WHERE id = p_ticket_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- COALESCE is load-bearing. assigned_to is nullable, so on an unassigned
    -- ticket `v_assigned_to = auth.uid()` is NULL, the whole OR-chain
    -- collapses to NULL, `NOT NULL` is NULL, and `IF NULL THEN` does not
    -- execute — the guard reads correctly and lets everyone through. Caught
    -- by T14 on the first CI run that reached it.
    IF NOT COALESCE(
        v_submitted_by = auth.uid()
        OR v_assigned_to = auth.uid()
        OR public.caller_is_admin()
        OR public.caller_has_role('Director')
    , false) THEN
        RAISE EXCEPTION 'not authorized to respond to this ticket';
    END IF;

    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$;

-- ── 2. Tie the rotation flag to an actual password change ──────────────
-- 20260725000001 moved must_change_password behind an RPC because the column
-- grant was revoked, and its own comment conceded the RPC was "a UX gate,
-- not an authorization boundary". That was too generous: the RPC is granted
-- to authenticated and scopes only to auth.uid(), so any flagged user could
-- call it straight from the console and keep an admin-assigned temporary
-- password indefinitely. The control it was meant to enforce simply did not.
--
-- Fix: remember what the password hash was when the flag went up, and refuse
-- to clear the flag until it differs. A sha256 of the bcrypt hash, never the
-- hash itself — enough to detect change, useless to anyone who reads it.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS password_fingerprint text;

COMMENT ON COLUMN public.user_profiles.password_fingerprint IS
    'sha256 of auth.users.encrypted_password captured when must_change_password '
    'was raised. NULL when not awaiting rotation. See 20260726000001.';

-- Baseline anyone already flagged, so the check has something to compare
-- against instead of failing open on its first run.
UPDATE public.user_profiles up
   SET password_fingerprint = encode(digest(u.encrypted_password, 'sha256'), 'hex')
  FROM auth.users u
 WHERE u.id = up.user_id
   AND up.must_change_password
   AND up.password_fingerprint IS NULL;

-- search_path must include `extensions`: Supabase installs pgcrypto there,
-- not in public, so a body pinned to `public` alone cannot resolve digest().
-- The backfill above works because a migration runs with the default
-- search_path — only the pinned function bodies need it spelled out.
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_current text;
    v_stored  text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

    SELECT encode(digest(u.encrypted_password, 'sha256'), 'hex')
      INTO v_current FROM auth.users u WHERE u.id = auth.uid();

    SELECT password_fingerprint
      INTO v_stored FROM public.user_profiles WHERE user_id = auth.uid();

    -- Unchanged hash ⇒ supabase.auth.updateUser() never succeeded ⇒ the
    -- caller is trying to skip the rotation, not report finishing it.
    IF v_stored IS NOT NULL AND v_current IS NOT DISTINCT FROM v_stored THEN
        RAISE EXCEPTION 'password has not been changed yet';
    END IF;

    UPDATE public.user_profiles
       SET must_change_password = false,
           password_fingerprint = NULL
     WHERE user_id = auth.uid();
END;
$$;

-- Raising the flag must record the baseline, or the check above has nothing
-- to compare and falls open.
CREATE OR REPLACE FUNCTION public.admin_force_password_reset(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    UPDATE public.user_profiles up
       SET must_change_password = true,
           password_fingerprint = encode(digest(u.encrypted_password, 'sha256'), 'hex')
      FROM auth.users u
     WHERE u.id = up.user_id
       AND up.user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user not found';
    END IF;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PASSWORD_RESET_FLAGGED', 'user_profiles', p_user_id, '{}'::jsonb);
END;
$$;

-- Same for accounts created by the auth trigger, which ship flagged.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role, must_change_password)
    VALUES (NEW.id, 'DefaultUser', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_profiles (user_id, email, must_change_password, password_fingerprint)
    VALUES (NEW.id, NEW.email, true,
            encode(digest(COALESCE(NEW.encrypted_password, ''), 'sha256'), 'hex'))
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ── 3. Re-resolve staff keys when the source name changes ──────────────
-- 20260725000005's trigger only filled a key that was NULL. The import
-- pipeline upserts name columns without the keys, so correcting a typo or
-- reassigning a PI left the old pi_staff_id in place: RLS kept granting the
-- previous person access and hid the row from the new one — quietly, and in
-- the direction that leaks rather than the direction that annoys.
CREATE OR REPLACE FUNCTION public.sync_staff_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        -- Name moved ⇒ the cached key is about the wrong person. Drop it
        -- first so the resolve below runs; leaving it stale is the bug.
        IF TG_OP = 'UPDATE'
           AND NEW."PrincipalInvestigator" IS DISTINCT FROM OLD."PrincipalInvestigator"
           AND NEW.pi_staff_id IS NOT DISTINCT FROM OLD.pi_staff_id THEN
            NEW.pi_staff_id := NULL;
        END IF;
        IF NEW.pi_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.pi_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."PrincipalInvestigator");
        END IF;

    ELSIF TG_TABLE_NAME = 'phd_students' THEN
        IF TG_OP = 'UPDATE'
           AND NEW."SupervisorName" IS DISTINCT FROM OLD."SupervisorName"
           AND NEW.supervisor_staff_id IS NOT DISTINCT FROM OLD.supervisor_staff_id THEN
            NEW.supervisor_staff_id := NULL;
        END IF;
        IF NEW.supervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.supervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."SupervisorName");
        END IF;

        IF TG_OP = 'UPDATE'
           AND NEW."CoSupervisorName" IS DISTINCT FROM OLD."CoSupervisorName"
           AND NEW.cosupervisor_staff_id IS NOT DISTINCT FROM OLD.cosupervisor_staff_id THEN
            NEW.cosupervisor_staff_id := NULL;
        END IF;
        IF NEW.cosupervisor_staff_id IS NULL THEN
            SELECT staff_id INTO NEW.cosupervisor_staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."CoSupervisorName");
        END IF;

    ELSIF TG_TABLE_NAME = 'project_staff' THEN
        IF TG_OP = 'UPDATE'
           AND NEW."StaffName" IS DISTINCT FROM OLD."StaffName"
           AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id THEN
            NEW.staff_id := NULL;
        END IF;
        IF NEW.staff_id IS NULL THEN
            SELECT staff_id INTO NEW.staff_id FROM public.unique_staff_names
             WHERE name = trim(NEW."StaffName");
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
