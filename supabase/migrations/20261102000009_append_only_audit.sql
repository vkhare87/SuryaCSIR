-- ============================================================
-- 20261102000009_append_only_audit
-- Security review 2026-11-01, SEC-05.
--
-- audit_log, tickets, ticket_events and ticket_responses were FOR ALL
-- (DELETE included) to Director / SystemAdmin / MasterAdmin, so the roles
-- whose actions are recorded could erase the record. No client code writes
-- any of them: rows come from audit_row_change() and the helpdesk RPCs,
-- all SECURITY DEFINER, which run as the owner and need neither policy nor
-- grant. So client write access goes entirely, as on pms_audit_logs.
-- SELECT policies are unchanged.
-- ============================================================

DROP POLICY IF EXISTS "audit_log_write"        ON public.audit_log;
DROP POLICY IF EXISTS "tickets_write"          ON public.tickets;
DROP POLICY IF EXISTS "ticket_events_write"    ON public.ticket_events;
DROP POLICY IF EXISTS "ticket_responses_write" ON public.ticket_responses;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log        FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.tickets          FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_events    FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ticket_responses FROM authenticated, anon;
