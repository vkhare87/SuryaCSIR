-- ═══════════════════════════════════════════════════════════════════════
-- 20260726000002_baseline_grants
-- Make the migration history able to rebuild a working database.
--
-- Found by the CI `db` job on its first successful run:
--
--   ERROR: permission denied for table tickets
--   HINT:  Grant the required privileges to the current role with:
--          GRANT SELECT ON public.tickets TO authenticated;
--
-- Not an RLS failure — a GRANT failure. RLS is only consulted *after* the
-- role holds table privileges, so with no grant every policy in the schema
-- is dead code.
--
-- Why it never showed up: the live project's tables were created by hand
-- through the Dashboard (see supabase/ops/README.md, "Adopting the Supabase
-- CLI on an existing project"), so they picked up Supabase's default
-- privileges at creation time. The repo reproduces the tables, the RLS and
-- the RPCs — but never the grants. `supabase db reset` therefore builds a
-- database that looks correct and denies everything.
--
-- That is the same drift that caused the 2026-07-12 restructure, inverted:
-- previously the repo lagged the database, here the database holds state the
-- repo cannot recreate. Disaster recovery from these migrations alone would
-- have produced an application where no user could read a single row.
--
-- ── Deliberately NOT Supabase's default ────────────────────────────────
-- Supabase's stock bootstrap grants ALL to `anon` as well. Nothing here
-- serves anonymous callers: every policy is `TO authenticated`, the one
-- exception (labs_read_authenticated) tests auth.role() = 'authenticated',
-- and 20260718000007 already revoked function EXECUTE from anon after
-- confirming an anon key could reach SECURITY DEFINER RPCs. So anon is
-- granted nothing here.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT ALL ON ALL TABLES     IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA public TO authenticated, service_role;

-- Tables added by future migrations inherit the same treatment, so this file
-- does not need revisiting every time the schema grows.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ── Re-apply the deliberate narrowings ─────────────────────────────────
-- GRANT ALL above is blunt and would silently undo the column-level limits
-- from 20260725000001. Restate them; this file runs after it, so these are
-- the ones that stick.

-- CRIT-1: every legitimate write to user_roles goes through a SECURITY
-- DEFINER RPC (admin_set_user_roles, approve_access_request), which runs as
-- the definer and is unaffected. Nothing writes this table directly.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- B5: last_seen_at and active_role are the only columns a user legitimately
-- writes about themselves. must_change_password is a forced-rotation flag
-- (and is further gated on an actual password change by 20260726000001);
-- email is identity; preferences goes through merge_user_preferences.
REVOKE UPDATE ON public.user_profiles FROM authenticated;
GRANT  UPDATE (active_role, last_seen_at) ON public.user_profiles TO authenticated;

-- A3b: reconciliation views aggregate personnel data across RLS boundaries.
-- Admins read them through admin_staff_link_gaps(), never directly.
REVOKE ALL ON public.staff_link_gaps    FROM authenticated;
REVOKE ALL ON public.unique_staff_names FROM authenticated;

-- ── Assert the outcome, so a future blanket GRANT cannot quietly undo it ─
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.tickets', 'SELECT') IS NOT TRUE THEN
        RAISE EXCEPTION 'authenticated still cannot SELECT public.tickets — RLS would never be consulted';
    END IF;

    IF has_table_privilege('authenticated', 'public.user_roles', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE user_roles — CRIT-1 has been reopened';
    END IF;

    IF has_column_privilege('authenticated', 'public.user_profiles', 'must_change_password', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE must_change_password — B5 has been reopened';
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.user_profiles', 'active_role', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated cannot UPDATE active_role — the role switcher is broken';
    END IF;

    RAISE NOTICE 'baseline grants applied; CRIT-1 and B5 narrowings intact';
END $$;
