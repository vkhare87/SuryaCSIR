-- ═══════════════════════════════════════════════════════════════════════
-- 20260726000002_relock_rpc_execute
-- 20260718000007 locked every public function to authenticated +
-- service_role and set ALTER DEFAULT PRIVILEGES FOR ROLE postgres so future
-- functions would inherit it. That default only applies to objects created
-- BY postgres — `supabase db push` connects as its own migration login role,
-- so functions added by later migrations are created with Postgres's stock
-- grant of EXECUTE to PUBLIC instead.
--
-- Confirmed live on 2026-07-26: with the anon key and no session,
-- pms_caller_track() and pms_finalize_senior_report() were both callable.
-- Neither leaks data on its own (anon resolves to no staff row and fails
-- every authorization branch), but this is the exact hole 20260718000007
-- was written to close, so restore the invariant for every function at once
-- rather than patching the two newest.
--
-- Rerun-safe: pure GRANT/REVOKE, no DDL.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Cover both creator roles so the next migration's functions inherit the
-- lock no matter which login the CLI uses.
DO $$
DECLARE
    v_role text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['postgres', current_user] LOOP
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', v_role);
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role', v_role);
    END LOOP;
END;
$$;
