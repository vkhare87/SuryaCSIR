-- ═══════════════════════════════════════════════════════════════════════
-- 20261020000002_scheduled_queries
-- WP-2 E4 / REVIEW-2026-10-20 G4–G5 — the first background agent.
--
-- A user saves an Ask SURYA question with a cadence. The RAG worker
-- (`python worker.py --briefs`, run by the host scheduler) answers each due
-- question AS ITS OWNER — a short-lived token for that user, so RLS scopes
-- the answer exactly as if they had asked — and posts the answer to the
-- owner's `notifications` feed with source='agent'.
--
-- Suggest-only: the agent reads and posts. It never calls a state-changing
-- RPC; the user opens, accepts or dismisses the notification, and that
-- decision stays on the notification row (status, updated_at).
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scheduled_queries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question    text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 3 AND 1000),
    cadence     text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly')),
    last_run_at timestamptz,
    last_error  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_queries_owner_idx ON public.scheduled_queries (owner);

ALTER TABLE public.scheduled_queries ENABLE ROW LEVEL SECURITY;

-- Owner manages their own schedule. Only the worker (service_role) writes
-- last_run_at / last_error, so the client gets no UPDATE.
DROP POLICY IF EXISTS "scheduled_queries_select_own" ON public.scheduled_queries;
CREATE POLICY "scheduled_queries_select_own" ON public.scheduled_queries
    FOR SELECT TO authenticated USING (owner = auth.uid());

DROP POLICY IF EXISTS "scheduled_queries_insert_own" ON public.scheduled_queries;
CREATE POLICY "scheduled_queries_insert_own" ON public.scheduled_queries
    FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "scheduled_queries_delete_own" ON public.scheduled_queries;
CREATE POLICY "scheduled_queries_delete_own" ON public.scheduled_queries
    FOR DELETE TO authenticated USING (owner = auth.uid());

REVOKE ALL ON public.scheduled_queries FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, DELETE ON public.scheduled_queries TO authenticated;
GRANT  ALL ON public.scheduled_queries TO service_role;
