-- ═══════════════════════════════════════════════════════════════════════
-- 20261020000001_notifications
-- WP-2 A1 / REVIEW-2026-10-20 G1–G3 — a notification spine the server fills.
--
-- Until now "what needs doing" was derived only in the browser
-- (src/lib/dashboard/myActions.ts), so nobody heard about a deadline unless
-- they happened to log in. This adds:
--
--   1. `notifications` — one general per-user feed. Rows come from the daily
--      rule sweep (source='rule') and, later, from background agents
--      (source='agent', with a `proposed_action` the user accepts/dismisses).
--   2. `notifications_sweep()` — ports the user-id rules from myActions.ts
--      to SQL, plus the new MoU-expiry rule. Idempotent via dedupe_key.
--   3. A pg_cron job running the sweep daily at 01:30 UTC = 07:00 IST.
--
-- The committee action-item rule stays client-side: it matches staff names
-- fuzzily (staffNameMatchesAuthor), which SQL would do worse.
--
-- Rerun: idempotent.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            text NOT NULL,
    severity        text NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info','warning','critical')),
    title           text NOT NULL,
    body            text NOT NULL DEFAULT '',
    link            text,
    source          text NOT NULL DEFAULT 'rule'
                    CHECK (source IN ('rule','agent')),
    -- Stable identity of the thing being announced, so a re-run of the sweep
    -- is a no-op. Encode a "round" in it when the same item can legitimately
    -- need announcing again (e.g. a second revision request).
    dedupe_key      text NOT NULL,
    status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','read','accepted','dismissed')),
    proposed_action jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, dedupe_key)
);

-- The bell reads "my rows, newest first".
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON public.notifications (user_id, created_at DESC);

DROP TRIGGER IF EXISTS notifications_set_updated_at ON public.notifications;
CREATE TRIGGER notifications_set_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. RLS + grants ────────────────────────────────────────────────────
-- Owner reads own rows and moves their status. Nobody inserts or deletes
-- from the client: rows are written by the sweep (SECURITY DEFINER) and,
-- later, by the agent worker (service_role).
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 20260726000004 set default privileges to GRANT ALL on new tables. Narrow
-- them here: a user must not be able to rewrite `link` on their own row
-- (that turns the bell into an open redirect) or forge a row at all.
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.notifications TO authenticated;
GRANT  UPDATE (status, updated_at) ON public.notifications TO authenticated;
GRANT  ALL ON public.notifications TO service_role;

-- ── 3. Defensive date parse for the HR text columns ────────────────────
-- contract_staff."ContractEndDate" is text mirrored from Excel. Accepts the
-- same shapes as src/utils/dateUtils.ts parseDate (DD/MM/YYYY, DD.MM.YYYY,
-- ISO); anything else — including impossible dates like 31/02 — is NULL,
-- never an error that would abort the whole sweep.
CREATE OR REPLACE FUNCTION public.try_parse_date(p text)
RETURNS date
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    m text[];
BEGIN
    p := btrim(p);
    -- A bare number is an Excel serial that escaped conversion, not a date.
    IF p IS NULL OR p = '' OR p ~ '^\d{1,6}$' THEN
        RETURN NULL;
    END IF;
    m := regexp_match(p, '^(\d{1,2})[./](\d{1,2})[./](\d{4})$');
    IF m IS NOT NULL THEN
        RETURN make_date(m[3]::int, m[2]::int, m[1]::int);
    END IF;
    RETURN p::date;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

-- ── 4. The sweep ───────────────────────────────────────────────────────
-- Reads every user's work queue by design, so it is cron-only: EXECUTE is
-- revoked from every client role below, and it is listed in the EXEMPT map
-- of scripts/check_security_definer.py with that reason.
-- Returns the number of rows inserted (0 on a same-day re-run).
CREATE OR REPLACE FUNCTION public.notifications_sweep()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    WITH due (user_id, kind, severity, title, body, link, dedupe_key) AS (
        -- PMS self-appraisal still in draft and its open cycle ends within 14 days.
        SELECT r.scientist_id, 'pms-draft', 'warning',
               'PMS report in draft',
               'Complete and submit your appraisal report by ' || to_char(c.end_date, 'DD Mon YYYY'),
               '/pms/reports/' || r.id || '/edit',
               'pms-draft:' || r.id
          FROM pms_reports r
          JOIN appraisal_cycles c ON c.id = r.cycle_id
         WHERE r.status = 'DRAFT'
           AND c.status = 'OPEN'
           AND c.end_date <= current_date + 14

        UNION ALL
        -- PMS evaluation assigned and not completed.
        SELECT e.evaluator_id, 'pms-evaluation', 'info',
               'PMS evaluation pending',
               'A report is awaiting your evaluation',
               '/pms/evaluate/' || e.id,
               'pms-evaluation:' || e.id
          FROM pms_evaluations e
         WHERE e.status <> 'COMPLETED'

        UNION ALL
        -- Proposal sent back to its PI. The history count makes each
        -- revision round its own notification.
        SELECT p.pi_user_id, 'proposal-revision', 'warning',
               'Proposal revision requested',
               p.title,
               '/proposals/' || p.id || '/edit',
               'proposal-revision:' || p.id || ':'
                   || (SELECT count(*) FROM proposal_status_history h WHERE h.proposal_id = p.id)
          FROM proposals p
         WHERE p.status = 'REVISION_REQUESTED'

        UNION ALL
        -- Progress report in draft / sent back, due within 14 days (or overdue).
        SELECT pr.submitted_by, 'progress-report', 'warning',
               CASE pr.status WHEN 'REVISION_REQUESTED' THEN 'Progress report needs revision'
                              ELSE 'Progress report in draft' END,
               pr.project_name || ' · ' || pr.period_label || ' · due ' || to_char(pr.due_date, 'DD Mon YYYY'),
               '/reports/' || pr.id,
               'progress-report:' || pr.id || ':'
                   || (SELECT count(*) FROM project_report_history h WHERE h.report_id = pr.id)
          FROM project_reports pr
         WHERE pr.status IN ('DRAFT','REVISION_REQUESTED')
           AND pr.due_date <= current_date + 14

        UNION ALL
        -- Helpdesk ticket waiting on its handler. assigned_to is an auth
        -- user id since 20260725000004, so no staff mapping is needed.
        SELECT t.assigned_to, 'ticket', 'info',
               'Helpdesk ticket assigned to you',
               t.token || ' · ' || t.subject,
               '/helpdesk/' || t.id,
               'ticket:' || t.id
          FROM tickets t
         WHERE t.assigned_to IS NOT NULL
           AND t.status IN ('Open','InProgress')

        UNION ALL
        -- Contract engagement ending within 60 days → HRAdmin + MasterAdmin.
        -- SystemAdmin is platform-only and cannot open /staff/project.
        SELECT w.user_id, 'contract-end', 'warning',
               'Contract ending soon',
               coalesce(cs."Name", cs.id) || coalesce(' · ' || nullif(cs."Designation", ''), '')
                   || ' · ends ' || to_char(d.end_on, 'DD Mon YYYY'),
               '/staff/project',
               'contract-end:' || cs.id || ':' || d.end_on
          FROM contract_staff cs
         CROSS JOIN LATERAL (SELECT try_parse_date(cs."ContractEndDate") AS end_on) d
         CROSS JOIN (SELECT DISTINCT user_id FROM user_roles
                      WHERE role IN ('HRAdmin','MasterAdmin')) w
         WHERE d.end_on BETWEEN current_date AND current_date + 60

        UNION ALL
        -- NEW (review A1): active MoU expiring within 90 days → Director +
        -- MasterAdmin. valid_until is in the key so a renewed MoU alerts again.
        SELECT w.user_id, 'mou-expiry', 'warning',
               'MoU expiring soon',
               m.partner_name || ' · valid until ' || to_char(m.valid_until, 'DD Mon YYYY'),
               '/partnerships',
               'mou-expiry:' || m.id || ':' || m.valid_until
          FROM mous m
         CROSS JOIN (SELECT DISTINCT user_id FROM user_roles
                      WHERE role IN ('Director','MasterAdmin')) w
         WHERE m.status = 'Active'
           AND m.valid_until BETWEEN current_date AND current_date + 90
    ),
    ins AS (
        INSERT INTO notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        SELECT user_id, kind, severity, title, body, link, 'rule', dedupe_key
          FROM due
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::int FROM ins;
$$;

REVOKE EXECUTE ON FUNCTION public.notifications_sweep() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notifications_sweep() TO service_role;

-- ── 5. Schedule ────────────────────────────────────────────────────────
-- pg_cron upserts by job name, so re-running this file reschedules the same
-- job instead of adding a second one.
SELECT cron.schedule('notifications-sweep', '30 1 * * *', 'select public.notifications_sweep()');

-- ── 6. Assert the outcome ──────────────────────────────────────────────
DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.notifications', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated can INSERT notifications — rows could be forged';
    END IF;

    IF has_column_privilege('authenticated', 'public.notifications', 'link', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated can UPDATE notifications.link — open redirect';
    END IF;

    IF NOT has_column_privilege('authenticated', 'public.notifications', 'status', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated cannot UPDATE notifications.status — the bell cannot mark read';
    END IF;

    IF has_function_privilege('authenticated', 'public.notifications_sweep()', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can EXECUTE notifications_sweep()';
    END IF;

    RAISE NOTICE 'notifications: grants narrowed, sweep cron-only';
END $$;
