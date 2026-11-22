-- ═══════════════════════════════════════════════════════════════════════
-- 20260725000003_lock_internal_helpers
-- A1.2 — found by scripts/check_security_definer.py on its first run.
--
-- 20260718000007_lock_rpc_execute granted EXECUTE on every public function
-- to `authenticated`, and made that the default for future functions. That
-- was the right fix for the problem it addressed (anon could call
-- SECURITY DEFINER RPCs), but it is indiscriminate: it also exposed helper
-- functions that only ever run *inside* another SECURITY DEFINER function.
--
-- A SECURITY DEFINER function executes as its owner, so a caller needs no
-- EXECUTE grant of its own to reach a helper it calls internally. Revoking
-- the grant therefore costs nothing and removes three directly-callable,
-- RLS-bypassing entry points.
--
-- route_ticket is the one that mattered: it reads user_roles, staff and
-- divisions as the definer, so any authenticated user could call it with
-- arbitrary arguments and enumerate handler user_ids — including which
-- account holds HRAdmin or SystemAdmin — regardless of the RLS on those
-- tables. It is called only from helpdesk_create_ticket. The client has its
-- own pure-TypeScript mirror (src/lib/helpdesk/routing.ts) for the
-- "will be routed to…" preview and never invokes the RPC.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.route_ticket(text, text)
    FROM authenticated, anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.pms_committee_panel_valid(uuid)
    FROM authenticated, anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.pms_empowered_committee_valid(uuid)
    FROM authenticated, anon, PUBLIC;

-- service_role keeps EXECUTE — the ingest/RAG workers run under it and the
-- revoke above is about narrowing the *caller-facing* surface, not the
-- trusted backend one.
GRANT EXECUTE ON FUNCTION public.route_ticket(text, text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_committee_panel_valid(uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.pms_empowered_committee_valid(uuid)     TO service_role;

COMMENT ON FUNCTION public.route_ticket(text, text) IS
    'Internal helper for helpdesk_create_ticket. Not callable by authenticated — '
    'it resolves handler identities with RLS bypassed. See 20260725000003.';
