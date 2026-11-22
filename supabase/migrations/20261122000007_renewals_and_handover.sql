-- 20261122000007_renewals_and_handover
-- Roadmap WP-2 A1 (expiry rules) and the leaver list.
--
-- 1. phd_students.fellowship_end — the one date that ends a PhD's money. It
--    lived only inside the free-text FellowshipDetails; now it is a date HR
--    can keep. FellowshipDetails stays for the fellowship's name.
-- 2. renewal_watch_sweep() — two rules, run daily:
--    * Patent renewal: an Indian patent's renewal fee for year k+1 falls due
--      on the k-th anniversary of filing (Patents Act s.53, Rule 80), from the
--      2nd anniversary to the 19th. Granted patents only: fees before grant
--      are paid together at grant. Told 60 days ahead: the linked inventors
--      and the head of the patent's division (held or acting).
--      ponytail: the year count assumes an Indian filing date; a foreign or
--      PCT filing has its own schedule. Add a jurisdiction column when one
--      appears in the IP register.
--    * Fellowship end: told 180 days ahead while the thesis is not yet
--      submitted (not submitted, viva, defended, awarded or discontinued):
--      the supervisor, the co-supervisor and the head of the student's
--      division.
--    The due date is in each dedupe key, so a renewal paid (next year) or a
--    fellowship extended (new date) earns a fresh notice.
-- 3. staff_handover(staff) and leaving_staff(months) — what a person holds
--    that someone else must take over, and who is leaving. Both are invoker:
--    row-level security decides what the caller sees.
-- Tests: scripts/db/renewalsHandover.db.test.ts.

ALTER TABLE public.phd_students ADD COLUMN IF NOT EXISTS fellowship_end date;

CREATE OR REPLACE FUNCTION public.renewal_watch_sweep()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
    v_m integer;
BEGIN
    WITH heads AS (
        SELECT user_id, division_code FROM public.user_roles WHERE role IN ('HOD', 'DivisionHead')
        UNION
        SELECT acting_user_id, division_code FROM public.acting_assignments
         WHERE role IN ('HOD', 'DivisionHead') AND public.ist_today() BETWEEN from_on AND to_on
    ), due AS (
        SELECT ip.id, ip.title, ip.division_code, (f.on_date + make_interval(years => k))::date AS due_on, k
          FROM public.ip_intelligence ip
         CROSS JOIN LATERAL (SELECT public.try_parse_date(ip.filing_date) AS on_date) f
         CROSS JOIN LATERAL generate_series(2, 19) k
         WHERE ip.type = 'Patent' AND ip.status = 'Granted' AND f.on_date IS NOT NULL
           AND (f.on_date + make_interval(years => k))::date BETWEEN public.ist_today() AND public.ist_today() + 60
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT DISTINCT w.user_id, 'patent-renewal', 'warning',
           'Patent renewal due: ' || d.title,
           d.id || ' · fee for year ' || (d.k + 1) || ' due ' || to_char(d.due_on, 'DD Mon YYYY'),
           '/intelligence', 'rule', 'patent-renewal:' || d.id || ':' || d.due_on
      FROM due d
     CROSS JOIN LATERAL (
            SELECT st.user_id FROM public.ip_inventors i JOIN public.staff st ON st."ID" = i.staff_id
             WHERE i.ip_id = d.id AND st.user_id IS NOT NULL
            UNION
            SELECT h.user_id FROM heads h WHERE h.division_code = d.division_code) w
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    WITH heads AS (
        SELECT user_id, division_code FROM public.user_roles WHERE role IN ('HOD', 'DivisionHead')
        UNION
        SELECT acting_user_id, division_code FROM public.acting_assignments
         WHERE role IN ('HOD', 'DivisionHead') AND public.ist_today() BETWEEN from_on AND to_on
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT DISTINCT w.user_id, 'fellowship-end', 'warning',
           'Fellowship ends soon: ' || coalesce(nullif(s."StudentName", ''), s."EnrollmentNo"),
           s."EnrollmentNo" || coalesce(' · ' || nullif(s."CurrentStatus", ''), '')
               || ' · fellowship ends ' || to_char(s.fellowship_end, 'DD Mon YYYY'),
           '/phd', 'rule', 'fellowship-end:' || s."EnrollmentNo" || ':' || s.fellowship_end
      FROM public.phd_students s
     CROSS JOIN LATERAL (
            SELECT st.user_id FROM public.staff st
             WHERE st."ID" IN (s.supervisor_staff_id, s.cosupervisor_staff_id) AND st.user_id IS NOT NULL
            UNION
            SELECT h.user_id FROM heads h WHERE h.division_code = s."DivisionCode") w
     WHERE s.fellowship_end BETWEEN public.ist_today() AND public.ist_today() + 180
       AND coalesce(s."CurrentStatus", '') !~* '(thesis submitted|viva|defended|awarded|discontinued)'
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_m = ROW_COUNT;
    RETURN v_n + v_m;
END;
$$;

REVOKE ALL ON FUNCTION public.renewal_watch_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renewal_watch_sweep() TO service_role;

-- 01:55 UTC = 07:25 IST, after the AMC sweep, before the working day.
SELECT cron.schedule('renewal-watch-sweep', '55 1 * * *', 'select public.renewal_watch_sweep()');

-- ── Leaver list ────────────────────────────────────────────────────────
-- What this person holds that must pass to someone else. One row per item.
CREATE OR REPLACE FUNCTION public.staff_handover(p_staff_id text)
RETURNS TABLE(kind text, ref text, label text, link text, due date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH me AS (SELECT s."ID" AS sid, s.user_id AS uid, s."Name" AS name FROM public.staff s WHERE s."ID" = p_staff_id)
    SELECT 'INSTRUMENT', e."UInsID", coalesce(nullif(e."Name", ''), e."UInsID") || coalesce(' · ' || nullif(e."Location", ''), ''),
           '/facilities/' || e."UInsID", NULL::date
      FROM public.equipment e, me
     WHERE (me.uid IS NOT NULL AND e.owner_user_id = me.uid)
        OR EXISTS (SELECT 1 FROM public.equipment_in_charge c
                    WHERE c.equipment_id = e."UInsID" AND c.staff_id = me.sid
                      AND (c.to_on IS NULL OR c.to_on >= public.ist_today()))
    UNION ALL
    SELECT 'PROJECT', p."ProjectID", p."ProjectNo" || ' · ' || coalesce(p."ProjectName", ''),
           '/projects/' || p."ProjectID", p.end_date
      FROM public.projects p, me
     WHERE p.pi_staff_id = me.sid AND coalesce(p.stage, 'ACTIVE') IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
    UNION ALL
    SELECT 'STUDENT', s."EnrollmentNo",
           coalesce(nullif(s."StudentName", ''), s."EnrollmentNo") || coalesce(' · ' || nullif(s."CurrentStatus", ''), '')
               || CASE WHEN s.cosupervisor_staff_id = me.sid THEN ' · co-supervisor' ELSE '' END,
           '/phd', s.fellowship_end
      FROM public.phd_students s, me
     WHERE me.sid IN (s.supervisor_staff_id, s.cosupervisor_staff_id)
       AND coalesce(s."CurrentStatus", '') !~* '(awarded)'
    UNION ALL
    SELECT 'ACTION_ITEM', a.id::text, a.task, '/committees', a.deadline
      FROM public.action_items a, me
     WHERE a.status <> 'Completed' AND (a.assigned_staff_id = me.sid OR a.assigned_to = me.sid)
    UNION ALL
    SELECT 'COMMITTEE', m.committee_id::text, c.name || ' · ' || initcap(lower(replace(m.seat, '_', ' '))),
           '/committees/' || m.committee_id, m.to_on
      FROM public.committee_memberships m JOIN public.committees c ON c.id = m.committee_id, me
     WHERE m.staff_id = me.sid AND (m.to_on IS NULL OR m.to_on >= public.ist_today())
    UNION ALL
    SELECT 'PROPOSAL', pr.id::text, pr.title || ' · ' || initcap(lower(replace(pr.status, '_', ' '))),
           '/proposals/' || pr.id, NULL::date
      FROM public.proposals pr, me
     WHERE pr.pi_user_id = me.uid
       AND pr.status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED')
    UNION ALL
    SELECT 'TICKET', t.id::text, t.token || ' · ' || t.subject, '/helpdesk/' || t.id, NULL::date
      FROM public.tickets t, me
     WHERE t.assigned_to = me.uid AND t.status IN ('Open', 'InProgress')
    UNION ALL
    SELECT 'STEWARD', ds.id::text, 'Data steward · ' || ds.domain || coalesce(' · ' || ds.division_code, ''), '/data', NULL::date
      FROM public.data_stewards ds, me
     WHERE ds.user_id = me.uid
    ORDER BY 1, 5 NULLS LAST, 3;
$$;

-- Who leaves within the window, and how much each holds.
-- ponytail: retirement is DOB + 60 years, the rule the sweep and the outlook
-- already use; a dated TRANSFER / DEPUTATION / RETIREMENT career event wins
-- when it comes sooner. Resignations are not recorded as dated events yet.
CREATE OR REPLACE FUNCTION public.leaving_staff(p_months integer DEFAULT 12)
RETURNS TABLE(staff_id text, name text, designation text, division text, leaving_on date, reason text, items integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH horizon AS (
        SELECT (public.ist_today() + make_interval(months => least(greatest(coalesce(p_months, 12), 1), 60)))::date AS until
    ), events AS (
        SELECT s."ID" AS sid, (s.dob_date + interval '60 years')::date AS on_date, 'Retirement' AS reason
          FROM public.staff s
         WHERE s.dob_date IS NOT NULL
        UNION ALL
        SELECT e.staff_id, e.effective_on, initcap(lower(e.kind))
          FROM public.staff_career_events e
         WHERE e.kind IN ('TRANSFER', 'DEPUTATION', 'RETIREMENT')
    ), first_out AS (
        SELECT DISTINCT ON (ev.sid) ev.sid, ev.on_date, ev.reason
          FROM events ev, horizon h
         WHERE ev.on_date BETWEEN public.ist_today() AND h.until
         ORDER BY ev.sid, ev.on_date
    )
    SELECT s."ID", s."Name", s."Designation", s."Division", f.on_date, f.reason,
           (SELECT count(*)::int FROM public.staff_handover(s."ID"))
      FROM first_out f JOIN public.staff s ON s."ID" = f.sid
     ORDER BY f.on_date, s."Name";
$$;

REVOKE ALL ON FUNCTION public.staff_handover(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leaving_staff(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_handover(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leaving_staff(integer) TO authenticated, service_role;
