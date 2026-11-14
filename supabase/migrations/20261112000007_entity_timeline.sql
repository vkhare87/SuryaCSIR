-- ============================================================
-- 20261112000007_entity_timeline
-- Enterprise P1 / EA3 — one timeline over the event tables.
--
-- security_invoker: each source keeps its own RLS, so a reader sees only the
-- events they could already read. There is no HR audit table yet; the
-- committee / helpdesk audit_log stands in for "admin" events.
-- audit_log.actor_id is text (a staff ID on old rows, a user id since
-- 20260725000004), so only uuid-shaped values become actor_user_id.
-- Tests: scripts/db/identity.db.test.ts (timeline block).
-- ============================================================
BEGIN;

CREATE OR REPLACE VIEW public.entity_timeline WITH (security_invoker = true) AS
SELECT 'project'::text AS entity_type, e.project_id AS entity_id, e.at, e.actor AS actor_user_id,
       e.kind, e.summary, 'project_events'::text AS source
  FROM public.project_events e
UNION ALL
SELECT lower(a.entity_type), a.entity_id::text, a.created_at, a.user_id,
       a.action, a.action, 'pms_audit_logs'
  FROM public.pms_audit_logs a
UNION ALL
SELECT 'contribution_request', c.request_id::text, c.created_at, c.actor_id,
       c.action, coalesce(c.note, coalesce(c.from_status || ' → ', '') || c.to_status), 'contribution_request_events'
  FROM public.contribution_request_events c
UNION ALL
SELECT l.entity_type, l.entity_id::text, l.created_at,
       CASE WHEN l.actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.actor_id::uuid END,
       l.action, l.entity_type || ' ' || l.action, 'audit_log'
  FROM public.audit_log l;

REVOKE ALL ON public.entity_timeline FROM PUBLIC, anon;
GRANT SELECT ON public.entity_timeline TO authenticated, service_role;

COMMIT;
