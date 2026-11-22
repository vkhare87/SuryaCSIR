-- 20261115000001_ask_scope_guard
-- Ask SURYA scope guard (docs/superpowers/specs/2026-11-15-ask-surya-scope-guard-design.md).
--
--   1. query_log.pinned — a person's saved questions. History reads query_log;
--      nothing else is stored.
--   2. Column grants: a person may update only feedback and pinned on their own
--      rows. Before this the owner-update policy let them rewrite any column,
--      so they could blank refusal_reason and erase their own strikes.
--   3. ask_scope_sweep() — more than 5 out-of-scope refusals on one IST day
--      tells every HRAdmin, once per person per day. The notice names the
--      person and the count, never the question text.
--
-- Rerun: idempotent.

-- ── 1. Saved questions ────────────────────────────────────────────────
ALTER TABLE public.query_log ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- ── 2. Only feedback and pinned are the owner's to change ─────────────
REVOKE UPDATE ON public.query_log FROM PUBLIC, anon, authenticated;
GRANT UPDATE (feedback, pinned) ON public.query_log TO authenticated;

-- ── 2b. The caller's own held roles, for the guard in rag/scope.py ────
-- Filters on auth.uid() itself rather than trusting user_roles' SELECT policy
-- to stay own-rows-only: a future admin read-all policy must not hand an
-- admin's guard every user's roles. Invoker: it reads nothing RLS would hide.
CREATE OR REPLACE FUNCTION public.caller_roles()
RETURNS TABLE (role text, division_code text)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT ur.role, ur.division_code FROM public.user_roles ur
     WHERE ur.user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.caller_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_roles() TO authenticated, service_role;

-- ── 3. Strikes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS query_log_strikes_idx
    ON public.query_log (user_id, created_at)
    WHERE refusal_reason = 'out_of_scope';

CREATE OR REPLACE FUNCTION public.ask_scope_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_day date := public.ist_today() - 1;
    v_n   integer;
BEGIN
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT hr.user_id, 'ask-scope', 'warning',
           'Repeated out-of-scope Ask SURYA requests',
           coalesce(nullif(st."Name", ''), u.email, s.user_id::text)
               || ' · ' || s.n || ' refused requests on ' || to_char(v_day, 'DD Mon YYYY'),
           NULL, 'rule',
           'ask-scope:' || s.user_id || ':' || to_char(v_day, 'YYYY-MM-DD')
      FROM (SELECT q.user_id, count(*) AS n
              FROM public.query_log q
             WHERE q.refusal_reason = 'out_of_scope'
               AND (q.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_day
             GROUP BY q.user_id
            HAVING count(*) > 5) s
      JOIN auth.users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
            SELECT "Name" FROM public.staff
             WHERE user_id = s.user_id
                OR (user_id IS NULL AND lower("Email") = lower(u.email))
             ORDER BY (user_id = s.user_id) DESC NULLS LAST
             LIMIT 1) st ON true
     CROSS JOIN (SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'HRAdmin') hr
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ask_scope_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ask_scope_sweep() TO service_role;

-- 01:50 UTC = 07:20 IST, after the other morning sweeps.
SELECT cron.schedule('ask-scope-sweep', '50 1 * * *', 'select public.ask_scope_sweep()');

-- ── 4. Assert the outcome ─────────────────────────────────────────────
DO $$
BEGIN
    IF has_column_privilege('authenticated', 'public.query_log', 'refusal_reason', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE query_log.refusal_reason — strikes could be erased';
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.query_log', 'feedback', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated cannot UPDATE query_log.feedback — thumbs up/down would break';
    END IF;
    IF has_function_privilege('authenticated', 'public.ask_scope_sweep()', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can EXECUTE ask_scope_sweep()';
    END IF;
END $$;
