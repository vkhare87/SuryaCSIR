-- ============================================================
-- 20261113000002_workload_and_careers
-- Enterprise P5 / EH5 deployment and workload · EH4 workforce planning ·
-- EH6 career timeline.
--
-- staff_workload(staff)     per person: running projects, how many as PI,
--                           value managed, time split from the latest work
--                           plan, and overload (more than 4 running
--                           projects — roadmap B3).
-- workforce_outlook(years)  retirements by year and discipline, flagged when
--                           the person is the only holder of their core area,
--                           and the vacant posts — one list for planning.
-- staff_career_events       appointments, promotions, transfers, deputation,
--                           training, assessments and retirement as dated
--                           events, imported from the establishment record.
--                           Not a service book and not payroll. Empty until
--                           Establishment supplies an export.
-- All reads are invoker: RLS on staff, projects and posts decides.
-- Tests: scripts/db/people.db.test.ts.
-- ============================================================
BEGIN;

-- ── EH5 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_workload(p_staff_id text DEFAULT NULL)
RETURNS TABLE (staff_id text, name text, division text, active_projects integer, as_pi integer,
               sanctioned_value numeric, awp_year text, awp_time_pct jsonb, overload boolean)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH people AS (
    SELECT s."ID", s."Name", s."Division" FROM public.staff s
     WHERE (p_staff_id IS NULL OR s."ID" = p_staff_id)
), running AS (
    SELECT pe."ID" AS staff_id, f.role, f.amount
      FROM people pe
     CROSS JOIN LATERAL public.staff_profile_facts(pe."ID") f
     WHERE f.section = 'PROJECT'
       AND (f.date_from IS NULL OR f.date_from <= public.ist_today())
       AND (f.date_to IS NULL OR f.date_to >= public.ist_today())
)
SELECT pe."ID", pe."Name", pe."Division",
       (SELECT count(*)::int FROM running r WHERE r.staff_id = pe."ID"),
       (SELECT count(*)::int FROM running r WHERE r.staff_id = pe."ID" AND r.role = 'PI'),
       (SELECT coalesce(sum(r.amount), 0) FROM running r WHERE r.staff_id = pe."ID" AND r.role = 'PI'),
       w.reporting_year,
       coalesce(w.activity_split, '[]'::jsonb),
       -- ponytail: fixed at 4 (roadmap B3); make it a csir_rules row if the lab sets one.
       (SELECT count(*) FROM running r WHERE r.staff_id = pe."ID") > 4
  FROM people pe
  LEFT JOIN LATERAL (
      SELECT a.reporting_year, a.activity_split FROM public.pms_awps a
       WHERE a.staff_id = pe."ID" ORDER BY a.reporting_year DESC LIMIT 1) w ON true
 ORDER BY 4 DESC, 2;
$$;

-- ── EH4 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workforce_outlook(p_years integer DEFAULT 5)
RETURNS TABLE (kind text, year integer, discipline text, division text, ref text, label text, single_holder boolean)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH retiring AS (
    SELECT s."ID", s."Name", s."Designation", s."Division", nullif(btrim(s."CoreArea"), '') AS area,
           (s.dob_date + interval '60 years')::date AS on_date
      FROM public.staff s
     WHERE s.dob_date IS NOT NULL
       AND (s.dob_date + interval '60 years')::date BETWEEN public.ist_today()
           AND (public.ist_today() + make_interval(years => greatest(coalesce(p_years, 5), 1)))::date
)
SELECT 'RETIREMENT', extract(year FROM r.on_date)::int, r.area, r."Division", r."ID",
       r."Name" || coalesce(' · ' || nullif(r."Designation", ''), '') || ' · retires ' || to_char(r.on_date, 'DD Mon YYYY'),
       -- Only holder of the core area among those who stay past the horizon.
       r.area IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.staff o
            WHERE o."ID" <> r."ID" AND lower(btrim(o."CoreArea")) = lower(r.area)
              AND (o.dob_date IS NULL OR (o.dob_date + interval '60 years')::date > r.on_date))
  FROM retiring r
UNION ALL
SELECT 'VACANCY', extract(year FROM coalesce(p.vacant_since, public.ist_today()))::int, p.discipline, p.division_code, p.post_code,
       p.designation || ' · ' || lower(p.state) || coalesce(' since ' || to_char(p.vacant_since, 'DD Mon YYYY'), ''), false
  FROM public.sanctioned_posts p
 WHERE p.state IN ('VACANT', 'ADVERTISED', 'ABEYANCE')
ORDER BY 2, 1, 3;
$$;

-- ── EH6 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_career_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id     text NOT NULL REFERENCES public.staff("ID") ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('APPOINTMENT', 'PROMOTION', 'TRANSFER', 'DEPUTATION', 'TRAINING', 'ASSESSMENT', 'RETIREMENT')),
    effective_on date NOT NULL,
    detail       jsonb NOT NULL DEFAULT '{}',
    order_ref    text,
    source       text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('IMPORT', 'MANUAL')),
    created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (staff_id, kind, effective_on)
);
ALTER TABLE public.staff_career_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_career_events_select" ON public.staff_career_events;
CREATE POLICY "staff_career_events_select" ON public.staff_career_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = staff_career_events.staff_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_career_events FROM authenticated, anon;
REVOKE ALL ON public.staff_career_events FROM anon;
GRANT SELECT ON public.staff_career_events TO authenticated;

-- HR loads events from the establishment export: [{staff_id, kind,
-- effective_on, detail?, order_ref?}]. A repeat of the same staff / kind /
-- date updates the detail. Returns the number of rows written.
CREATE OR REPLACE FUNCTION public.career_events_import(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n   integer;
    v_bad text;
BEGIN
    IF NOT coalesce(public.caller_has_role('HRAdmin') OR public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only HR loads career events';
    END IF;
    IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Send a list of events'; END IF;
    SELECT string_agg(DISTINCT coalesce(x.staff_id, '(blank)'), ', ') INTO v_bad
      FROM jsonb_to_recordset(p_rows) AS x(staff_id text)
     WHERE NOT EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = x.staff_id);
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'Unknown staff IDs: %', v_bad; END IF;

    INSERT INTO public.staff_career_events (staff_id, kind, effective_on, detail, order_ref, source, created_by)
    SELECT x.staff_id, upper(btrim(x.kind)), x.effective_on, coalesce(x.detail, '{}'), nullif(btrim(x.order_ref), ''), 'IMPORT', auth.uid()
      FROM jsonb_to_recordset(p_rows) AS x(staff_id text, kind text, effective_on date, detail jsonb, order_ref text)
    ON CONFLICT (staff_id, kind, effective_on) DO UPDATE
       SET detail = EXCLUDED.detail, order_ref = EXCLUDED.order_ref;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Career events join the person's timeline (body is 20261112000011 plus
-- the career branch).
CREATE OR REPLACE VIEW public.entity_timeline WITH (security_invoker = true) AS
SELECT 'project'::text AS entity_type, e.project_id AS entity_id, e.at, e.actor AS actor_user_id,
       e.kind, e.summary, 'project_events'::text AS source
  FROM public.project_events e
UNION ALL
SELECT lower(a.entity_type), a.entity_id::text, a.created_at, a.user_id, a.action, a.action, 'pms_audit_logs'
  FROM public.pms_audit_logs a
UNION ALL
SELECT 'contribution_request', c.request_id::text, c.created_at, c.actor_id,
       c.action, coalesce(c.note, coalesce(c.from_status || ' → ', '') || c.to_status), 'contribution_request_events'
  FROM public.contribution_request_events c
UNION ALL
SELECT l.entity_type, l.entity_id::text, l.created_at,
       CASE WHEN l.actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.actor_id::uuid END,
       l.action, l.entity_type || ' ' || l.action, 'audit_log'
  FROM public.audit_log l
UNION ALL
SELECT 'staff', p.staff_id, p.changed_at, p.user_id,
       'profile', 'Profile updated: ' || (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(p.changes) k),
       'staff_profile_changes'
  FROM public.staff_profile_changes p
UNION ALL
SELECT 'staff', c.staff_id, c.effective_on::timestamptz, c.created_by,
       lower(c.kind), initcap(lower(c.kind)) || coalesce(' — ' || nullif(c.detail ->> 'summary', ''), '')
           || coalesce(' (' || c.order_ref || ')', ''), 'staff_career_events'
  FROM public.staff_career_events c;

REVOKE ALL ON FUNCTION public.staff_workload(text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workforce_outlook(integer)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.career_events_import(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_workload(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workforce_outlook(integer)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.career_events_import(jsonb) TO authenticated, service_role;

COMMIT;
