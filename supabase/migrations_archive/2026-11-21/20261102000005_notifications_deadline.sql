-- ============================================================
-- 20261102000005_notifications_deadline
-- BUG-08: the self-appraisal reminder used the cycle end_date (31 Mar) as the
-- deadline, so it fired ~6 weeks early and named the wrong date. It now uses
-- pms_deadline(SELF_APPRAISAL) (15 May) or a later condoned date, on the IST
-- day. Body is 20261020000001 with only that rule changed.
-- Tests: scripts/db/notifications.db.test.ts.
-- ============================================================
BEGIN;

-- The institute's day. Identical to the definition in
-- 20261102000002_pms_authorization_and_time; whichever lands first creates it.
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION public.notifications_sweep()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    WITH due (user_id, kind, severity, title, body, link, dedupe_key) AS (
        -- PMS self-appraisal still in draft and its submission deadline
        -- (15 May, or the condoned date) falls within 14 days. The due date is
        -- in the key, so a condonation earns its own reminder.
        SELECT r.scientist_id, 'pms-draft', 'warning',
               'PMS report in draft',
               'Complete and submit your appraisal report by ' || to_char(d.due, 'DD Mon YYYY'),
               '/pms/reports/' || r.id || '/edit',
               'pms-draft:' || r.id || ':' || d.due
          FROM pms_reports r
          JOIN appraisal_cycles c ON c.id = r.cycle_id
          JOIN LATERAL (
              SELECT greatest(
                       public.pms_deadline(c.id, 'SELF_APPRAISAL'),
                       (SELECT cd.condoned_until FROM pms_condonations cd WHERE cd.report_id = r.id)
                     ) AS due
          ) d ON true
         WHERE r.status = 'DRAFT'
           AND c.status = 'OPEN'
           AND d.due BETWEEN public.ist_today() AND public.ist_today() + 14

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

COMMIT;
