-- P7 Numbers and screens: EI1 metric registry, EV7 snapshots, EP9 theme / TRL
-- lens, EV4 weekly digest.
--
-- metrics            one row per number the institute quotes. Each points at
--                    a function metric_<key>(scope jsonb) → numeric. Scope keys:
--                    division (divCode), year (outputs), stage (patents).
-- metric_value       the only way a screen, a pack or Ask SURYA reads a number.
--                    Invoker: RLS decides what the caller counts.
-- metric_table       every metric for the institute and each division, at once.
-- metric_snapshots   frozen values per (metric, scope, as_on). Written once and
--                    never changed, so a pack "as on 31 March" prints the same
--                    any day. metric_snapshot_run() writes institute and
--                    division scopes, monthly by pg_cron (as on the last day of
--                    the month just ended).
-- projects.theme_code / trl_target / trl_reached    set by PME or the PI.
-- metric_digest_run  weekly notification of the role's numbers and the change
--                    since the last snapshot. No model call, so it runs
--                    without the RAG host.

BEGIN;

-- ── EP9 project lens ───────────────────────────────────────────────────
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS theme_code  text CHECK (theme_code ~ '^0[1-9]$'),
    ADD COLUMN IF NOT EXISTS trl_target  smallint CHECK (trl_target BETWEEN 1 AND 9),
    ADD COLUMN IF NOT EXISTS trl_reached smallint CHECK (trl_reached BETWEEN 1 AND 9);

CREATE OR REPLACE FUNCTION public.project_set_lens(p_project_id text, p_theme_code text, p_trl_target integer, p_trl_reached integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT coalesce(public.caller_is_pme() OR public.caller_has_role('MasterAdmin')
           OR EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = p_project_id AND p.pi_staff_id = public.caller_staff_id()), false) THEN
        RAISE EXCEPTION 'Only PME or the PI sets the theme and TRL';
    END IF;
    UPDATE public.projects
       SET theme_code = nullif(btrim(p_theme_code), ''), trl_target = p_trl_target, trl_reached = p_trl_reached
     WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
END;
$$;

-- ── EI1 registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metrics (
    key         text PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
    label       text NOT NULL,
    definition  text NOT NULL,
    unit        text NOT NULL CHECK (unit IN ('count', 'inr', 'pct')),
    scope_kinds text[] NOT NULL DEFAULT '{institute,division}',
    fn          regproc NOT NULL,
    owner_role  text NOT NULL,
    sort        smallint NOT NULL DEFAULT 0
);
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metrics_select ON public.metrics;
CREATE POLICY metrics_select ON public.metrics FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.metrics TO authenticated;
GRANT ALL ON public.metrics TO service_role;

-- The metric functions. Invoker; a NULL division means the institute.
CREATE OR REPLACE FUNCTION public.metric_staff_headcount(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.staff s WHERE p_scope->>'division' IS NULL OR s."Division" = p_scope->>'division';
$$;

CREATE OR REPLACE FUNCTION public.metric_posts(p_scope jsonb, p_col text)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(sum(CASE p_col WHEN 'sanctioned' THEN d.sanctioned WHEN 'filled' THEN d.filled ELSE d.vacant END), 0)
      FROM public.division_strength d WHERE p_scope->>'division' IS NULL OR d.division_code = p_scope->>'division';
$$;
CREATE OR REPLACE FUNCTION public.metric_posts_sanctioned(p_scope jsonb) RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$ SELECT public.metric_posts(p_scope, 'sanctioned') $$;
CREATE OR REPLACE FUNCTION public.metric_posts_filled(p_scope jsonb)     RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$ SELECT public.metric_posts(p_scope, 'filled') $$;
CREATE OR REPLACE FUNCTION public.metric_posts_vacant(p_scope jsonb)     RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$ SELECT public.metric_posts(p_scope, 'vacant') $$;

CREATE OR REPLACE FUNCTION public.metric_projects_active(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.projects p
     WHERE p.stage = 'ACTIVE' AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_projects_sanctioned_value(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT coalesce(sum(p.sanctioned_cost), 0) FROM public.projects p
     WHERE p.stage = 'ACTIVE' AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;

-- Spent (project_expenditure) over sanctioned, active projects that have any
-- spend recorded. NULL when none has: no figure is not zero spend.
CREATE OR REPLACE FUNCTION public.metric_projects_utilisation_pct(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    WITH a AS (
        SELECT p.sanctioned_cost AS cost, (SELECT sum(e.amount) FROM public.project_expenditure e WHERE e.project_id = p."ProjectID") AS spent
          FROM public.projects p
         WHERE p.stage = 'ACTIVE' AND p.sanctioned_cost > 0
           AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division')
    )
    SELECT round(100 * sum(spent) / nullif(sum(cost), 0), 1) FROM a WHERE spent IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.metric_review_slots_overdue(p_scope jsonb, p_reports boolean)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.project_review_slots s JOIN public.projects p ON p."ProjectID" = s.project_id
     WHERE s.status = 'PENDING' AND s.due_date < public.ist_today()
       AND (s.kind = 'PROGRESS_REPORT') = p_reports
       AND p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
       AND (p_scope->>'division' IS NULL OR p."DivisionCode" = p_scope->>'division');
$$;
CREATE OR REPLACE FUNCTION public.metric_reports_overdue(p_scope jsonb) RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$ SELECT public.metric_review_slots_overdue(p_scope, true) $$;
CREATE OR REPLACE FUNCTION public.metric_reviews_overdue(p_scope jsonb) RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$ SELECT public.metric_review_slots_overdue(p_scope, false) $$;

CREATE OR REPLACE FUNCTION public.metric_outputs_per_year(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.scientific_outputs o
     WHERE o.year = coalesce((p_scope->>'year')::int, extract(year FROM public.ist_today())::int)
       AND (p_scope->>'division' IS NULL OR o.division_code = p_scope->>'division');
$$;

CREATE OR REPLACE FUNCTION public.metric_patents(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.ip_intelligence i
     WHERE i.type = 'Patent'
       AND (p_scope->>'stage' IS NULL OR lower(i.status) = lower(p_scope->>'stage'))
       AND (p_scope->>'division' IS NULL OR i.division_code = p_scope->>'division');
$$;

-- ponytail: CurrentStatus is free text ("DAC III completed", "Thesis
-- Submitted"); finished = thesis submitted, viva or degree. Replace with the
-- milestone table once every scholar has milestones.
CREATE OR REPLACE FUNCTION public.metric_students_in_progress(p_scope jsonb)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT count(*) FROM public.phd_students s
     WHERE coalesce(s."CurrentStatus", '') !~* '(thesis submitted|viva|awarded)'
       AND (p_scope->>'division' IS NULL OR s."DivisionCode" = p_scope->>'division');
$$;

INSERT INTO public.metrics (key, label, definition, unit, scope_kinds, fn, owner_role, sort) VALUES
  ('staff_headcount',  'Staff', 'Rows in the staff register', 'count', '{institute,division}', 'public.metric_staff_headcount', 'HRAdmin', 10),
  ('posts_sanctioned', 'Sanctioned posts', 'Posts in the post register, not abolished', 'count', '{institute,division}', 'public.metric_posts_sanctioned', 'HRAdmin', 20),
  ('posts_filled',     'Filled posts', 'Posts with a holder', 'count', '{institute,division}', 'public.metric_posts_filled', 'HRAdmin', 21),
  ('posts_vacant',     'Vacant posts', 'Posts without a holder (vacant or advertised)', 'count', '{institute,division}', 'public.metric_posts_vacant', 'HRAdmin', 22),
  ('projects_active',  'Active projects', 'Projects at stage ACTIVE', 'count', '{institute,division}', 'public.metric_projects_active', 'PME', 30),
  ('projects_sanctioned_value', 'Sanctioned value of active projects', 'Sum of sanctioned cost, active projects', 'inr', '{institute,division}', 'public.metric_projects_sanctioned_value', 'PME', 31),
  ('projects_utilisation_pct', 'Utilisation', 'Expenditure recorded over sanctioned cost, active projects with any expenditure', 'pct', '{institute,division}', 'public.metric_projects_utilisation_pct', 'PME', 32),
  ('reports_overdue',  'Progress reports overdue', 'Progress-report slots pending past their due date', 'count', '{institute,division}', 'public.metric_reports_overdue', 'PME', 33),
  ('reviews_overdue',  'Reviews overdue', 'Review slots (committee, council, stage gate …) pending past their due date', 'count', '{institute,division}', 'public.metric_reviews_overdue', 'PME', 34),
  ('outputs_per_year', 'Publications this year', 'Scientific outputs in the calendar year (scope year, else this year)', 'count', '{institute,division}', 'public.metric_outputs_per_year', 'Director', 40),
  ('patents',          'Patents', 'Patents in the IP register (scope stage: Filed, Published, Granted)', 'count', '{institute,division}', 'public.metric_patents', 'Director', 41),
  ('students_in_progress', 'PhD students in progress', 'Scholars whose status is not thesis submitted, viva or awarded', 'count', '{institute,division}', 'public.metric_students_in_progress', 'Director', 50)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, definition = EXCLUDED.definition, unit = EXCLUDED.unit,
    scope_kinds = EXCLUDED.scope_kinds, fn = EXCLUDED.fn, owner_role = EXCLUDED.owner_role, sort = EXCLUDED.sort;

CREATE OR REPLACE FUNCTION public.metric_value(p_key text, p_scope jsonb DEFAULT '{}')
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v_fn  regproc;
    v_out numeric;
BEGIN
    SELECT fn INTO v_fn FROM public.metrics WHERE key = p_key;
    IF v_fn IS NULL THEN RAISE EXCEPTION 'Unknown metric %', p_key; END IF;
    EXECUTE format('SELECT %s($1)', v_fn) INTO v_out USING coalesce(p_scope, '{}'::jsonb);
    RETURN v_out;
END;
$$;

-- Every metric for the institute (division NULL) and each division.
CREATE OR REPLACE FUNCTION public.metric_table()
RETURNS TABLE (metric_key text, division text, value numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT m.key, NULL::text, public.metric_value(m.key, '{}') FROM public.metrics m
    UNION ALL
    SELECT m.key, d."divCode", public.metric_value(m.key, jsonb_build_object('division', d."divCode"))
      FROM public.metrics m CROSS JOIN public.divisions d WHERE 'division' = ANY (m.scope_kinds);
$$;

-- ── EV7 snapshots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metric_snapshots (
    metric_key text NOT NULL REFERENCES public.metrics(key) ON DELETE CASCADE,
    scope      jsonb NOT NULL DEFAULT '{}',
    as_on      date NOT NULL,
    value      numeric,
    taken_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (metric_key, scope, as_on)
);
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metric_snapshots_select ON public.metric_snapshots;
CREATE POLICY metric_snapshots_select ON public.metric_snapshots FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.metric_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.metric_snapshots TO authenticated;
GRANT ALL ON public.metric_snapshots TO service_role;

-- Definer: a snapshot is the whole institute, whoever triggers it. An
-- existing (metric, scope, as_on) row is never overwritten.
CREATE OR REPLACE FUNCTION public.metric_snapshot_run(p_as_on date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin takes a snapshot';
    END IF;
    INSERT INTO public.metric_snapshots (metric_key, scope, as_on, value)
    SELECT t.metric_key, CASE WHEN t.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', t.division) END,
           coalesce(p_as_on, public.ist_today() - 1), t.value
      FROM public.metric_table() t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- ── EV4 weekly digest ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.metric_digest_run()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n integer;
    v_week text := to_char(public.ist_today(), 'IYYY-IW');
BEGIN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin runs the digest';
    END IF;
    WITH readers AS (
        -- One digest per user: the widest role wins (institute before division).
        SELECT DISTINCT ON (r.user_id) r.user_id, r.role,
               CASE WHEN r.role IN ('HOD', 'DivisionHead') THEN r.division_code END AS division
          FROM public.user_roles r
         WHERE r.role IN ('Director', 'MasterAdmin', 'HRAdmin', 'PME', 'HOD', 'DivisionHead')
         ORDER BY r.user_id, (r.role IN ('HOD', 'DivisionHead')), r.role
    ), wanted AS (
        SELECT rd.user_id, rd.division, m.key, m.label, m.unit, m.sort
          FROM readers rd JOIN public.metrics m
            ON (rd.role IN ('Director', 'MasterAdmin', 'HOD', 'DivisionHead'))
            OR (rd.role = 'HRAdmin' AND m.owner_role = 'HRAdmin')
            OR (rd.role = 'PME' AND m.owner_role = 'PME')
    ), vals AS (
        SELECT w.*, public.metric_value(w.key, CASE WHEN w.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', w.division) END) AS now_v,
               (SELECT s.value FROM public.metric_snapshots s
                 WHERE s.metric_key = w.key
                   AND s.scope = CASE WHEN w.division IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('division', w.division) END
                 ORDER BY s.as_on DESC LIMIT 1) AS last_v
          FROM wanted w
    )
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    SELECT v.user_id, 'metric-digest', 'info',
           'Weekly numbers' || coalesce(' · ' || v.division, ''),
           string_agg(v.label || ' ' || coalesce(CASE v.unit WHEN 'pct' THEN v.now_v || '%' WHEN 'inr' THEN '₹' || to_char(v.now_v, 'FM99,99,99,99,999') ELSE v.now_v::text END, '—')
                      || CASE WHEN v.last_v IS NOT NULL AND v.now_v IS NOT NULL AND v.now_v <> v.last_v
                              THEN ' (' || CASE WHEN v.now_v > v.last_v THEN '+' ELSE '' END || (v.now_v - v.last_v) || ')' ELSE '' END,
                      ' · ' ORDER BY v.sort),
           '/divisions', 'rule', 'metric-digest:' || v_week
      FROM vals v
     GROUP BY v.user_id, v.division
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.project_set_lens(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metric_value(text, jsonb)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metric_table()                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metric_snapshot_run(date)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metric_digest_run()              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_set_lens(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_value(text, jsonb)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_table()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_snapshot_run(date)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metric_digest_run()            TO service_role;

-- 1st of the month 00:30 UTC (06:00 IST): as on the last day of last month.
SELECT cron.schedule('metric-snapshot', '30 0 1 * *', 'select public.metric_snapshot_run()');
-- Monday 02:00 UTC (07:30 IST).
SELECT cron.schedule('metric-digest', '0 2 * * 1', 'select public.metric_digest_run()');

COMMIT;
