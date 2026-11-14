-- ============================================================
-- 20261112000008_sweep_parity
-- Enterprise P1 / EI4 — every deadline rule in src/lib/dashboard/myActions.ts
-- also raises a notification from the nightly sweep, with nobody logged in.
-- Body is 20261102000005 plus the branches marked P1 / EI4.
-- Not ported, by design: "draft proposal not yet submitted" (no deadline),
-- a contract worker's own end-date reminder (contract_staff has no login),
-- and contribution requests (notified when created and when submitted).
-- Tests: scripts/db/sweepParity.db.test.ts.
-- ============================================================
BEGIN;

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

        UNION ALL
        -- ── P1 / EI4: rules that lived only in myActions.ts ─────────────
        -- Progress report owed on a project the user leads, due within 30 days
        -- or past. A called review is notified when it is called.
        SELECT pi.user_id, 'project-review', 'warning',
               'Progress report due — ' || p."ProjectNo",
               s.body || ' · ' || s.period_label || ' · due ' || to_char(s.due_date, 'DD Mon YYYY'),
               '/reports/new',
               'project-slot:' || s.id
          FROM project_review_slots s
          JOIN projects p ON p."ProjectID" = s.project_id
          JOIN LATERAL (SELECT coalesce((SELECT pr.pi_user_id FROM proposals pr WHERE pr.id = p.proposal_id),
                                        (SELECT st.user_id FROM staff st WHERE st."ID" = p.pi_staff_id)) AS user_id) pi ON true
         WHERE s.status = 'PENDING' AND s.kind = 'PROGRESS_REPORT'
           AND s.due_date <= public.ist_today() + 30
           AND pi.user_id IS NOT NULL

        UNION ALL
        -- Change-request step whose turn it is → the desk that records it
        -- (project_change_caller_may_act, without the MasterAdmin override).
        SELECT ur.user_id, 'project-change', 'info',
               'Change request to record — ' || p."ProjectNo",
               initcap(lower(replace(r.kind, '_', ' '))) || ' · ' || initcap(lower(replace(s.kind, '_', ' '))),
               '/projects/' || r.project_id || '?tab=changes',
               'change-step:' || s.id
          FROM project_change_steps s
          JOIN project_change_requests r ON r.id = s.change_id AND s.round = r.round
          JOIN projects p ON p."ProjectID" = r.project_id
          JOIN user_roles ur ON ur.role = CASE s.kind WHEN 'FINANCE' THEN 'FinanceAdmin'
                                                      WHEN 'DIRECTOR_APPROVAL' THEN 'Director'
                                                      WHEN 'DIRECTOR_FORWARD' THEN 'Director'
                                                      ELSE 'PME' END
         WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
           AND NOT EXISTS (SELECT 1 FROM project_change_steps e
                            WHERE e.change_id = s.change_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')

        UNION ALL
        -- Completion-report step whose turn it is → its desk.
        SELECT ur.user_id, 'project-closure', 'info',
               'Completion report to record — ' || p."ProjectNo",
               initcap(lower(replace(s.kind, '_', ' '))),
               '/projects/' || r.project_id || '?tab=closure',
               'closure-step:' || s.id
          FROM project_completion_steps s
          JOIN project_completion_reports r ON r.id = s.report_id AND s.round = r.round
          JOIN projects p ON p."ProjectID" = r.project_id
          JOIN user_roles ur ON ur.role = CASE s.kind WHEN 'FINANCE' THEN 'FinanceAdmin'
                                                      WHEN 'DIRECTOR_APPROVAL' THEN 'Director'
                                                      WHEN 'DIRECTOR_FORWARD' THEN 'Director'
                                                      ELSE 'PME' END
         WHERE s.status = 'PENDING' AND r.status IN ('SUBMITTED', 'UNDER_REVIEW')
           AND NOT EXISTS (SELECT 1 FROM project_completion_steps e
                            WHERE e.report_id = s.report_id AND e.round = s.round AND e.seq < s.seq AND e.status = 'PENDING')

        UNION ALL
        -- Completion report owed by the PI (my_closure_items 'due').
        SELECT pi.user_id, 'project-closure', 'warning',
               'Completion report due — ' || p."ProjectNo",
               'Write what the project did and learned; it closes the project',
               '/projects/' || p."ProjectID" || '?tab=closure',
               'closure-due:' || p."ProjectID" || ':' || coalesce(p.end_date::text, '')
          FROM projects p
          LEFT JOIN project_completion_reports r ON r.project_id = p."ProjectID"
          JOIN LATERAL (SELECT coalesce((SELECT pr.pi_user_id FROM proposals pr WHERE pr.id = p.proposal_id),
                                        (SELECT st.user_id FROM staff st WHERE st."ID" = p.pi_staff_id)) AS user_id) pi ON true
         WHERE (p.stage = 'CLOSING' OR (p.stage IN ('ACTIVE', 'ON_HOLD') AND p.end_date < public.ist_today())
                OR (p.stage = 'FORECLOSED' AND p.proposal_id IS NOT NULL))
           AND coalesce(r.status, 'DRAFT') IN ('DRAFT', 'RETURNED')
           AND pi.user_id IS NOT NULL

        UNION ALL
        -- Proposal desk: vetting and sanction → PME and MasterAdmin;
        -- a recommended in-house proposal → the Director.
        SELECT ur.user_id, 'proposal', 'info',
               CASE p.status WHEN 'SUBMITTED' THEN 'Proposal awaiting vetting'
                             WHEN 'RECOMMENDED' THEN 'Recommended — awaiting your approval'
                             ELSE 'Approved — record the sanction' END,
               p.title,
               '/proposals/' || p.id,
               'proposal-desk:' || p.id || ':' || p.status || ':'
                   || (SELECT count(*) FROM proposal_status_history h WHERE h.proposal_id = p.id)
          FROM proposals p
          JOIN user_roles ur
            ON (p.status IN ('SUBMITTED', 'APPROVED', 'OM_ISSUED') AND ur.role IN ('PME', 'MasterAdmin'))
            OR (p.status = 'RECOMMENDED' AND p.track = 'ULIP' AND ur.role = 'Director')

        UNION ALL
        -- Progress report awaiting review → division heads of its division,
        -- and the institute-wide reviewers.
        SELECT DISTINCT ur.user_id, 'progress-report', 'info',
               'Progress report awaiting review',
               pr.project_name || ' · ' || pr.period_label,
               '/reports/' || pr.id,
               'progress-review:' || pr.id || ':'
                   || (SELECT count(*) FROM project_report_history h WHERE h.report_id = pr.id)
          FROM project_reports pr
          JOIN user_roles ur
            ON (ur.role IN ('HOD', 'DivisionHead') AND ur.division_code = pr.division_code)
            OR ur.role IN ('Director', 'HRAdmin', 'MasterAdmin')
         WHERE pr.status IN ('SUBMITTED', 'UNDER_REVIEW')

        UNION ALL
        -- Committee action item → its assignee: a staff ID, or a name that
        -- exactly one staff member carries.
        SELECT st.user_id, 'action-item', 'info',
               'Committee action item',
               a.task || ' · due ' || to_char(a.deadline, 'DD Mon YYYY'),
               '/committees',
               'action-item:' || a.id
          FROM action_items a
          JOIN staff st ON st."ID" = coalesce(
                 (SELECT s1."ID" FROM staff s1 WHERE s1."ID" = a.assigned_to),
                 (SELECT min(s2."ID") FROM staff s2
                   WHERE public.person_name_key(s2."Name") = public.person_name_key(a.assigned_to)
                  HAVING count(*) = 1))
         WHERE a.status <> 'Completed' AND st.user_id IS NOT NULL

        UNION ALL
        -- Superannuation (DOB + 60) within 6 months → institute-wide watchers,
        -- and division heads of the person's division. A DOB that does not
        -- parse raises nothing.
        SELECT DISTINCT ur.user_id, 'retirement', 'info',
               'Superannuation approaching',
               coalesce(st."Name", st."ID") || coalesce(' · ' || nullif(st."Designation", ''), '')
                   || ' · ' || to_char(d.on_date, 'DD Mon YYYY'),
               '/staff/analytics',
               'retirement:' || st."ID" || ':' || d.on_date
          FROM staff st
         CROSS JOIN LATERAL (SELECT (st.dob_date + interval '60 years')::date AS on_date) d
          JOIN user_roles ur
            ON ur.role IN ('Director', 'HRAdmin', 'MasterAdmin')
            OR (ur.role IN ('HOD', 'DivisionHead') AND ur.division_code = st."Division")
         WHERE d.on_date BETWEEN public.ist_today() AND (public.ist_today() + interval '6 months')::date
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
