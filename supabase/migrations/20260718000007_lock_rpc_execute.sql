-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000007_lock_rpc_execute
-- Postgres default-grants EXECUTE on functions to PUBLIC. Combined with
-- SECURITY DEFINER RPCs (helpdesk_create_ticket, pms_*, admin_*), this let
-- an UNAUTHENTICATED client (anon key only) insert rows — confirmed live
-- during the 2026-07-18 UX drive. Lock every public function to
-- authenticated + service_role, and make that the default for future
-- functions too.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future functions created by migrations (run as postgres) inherit the lock.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
