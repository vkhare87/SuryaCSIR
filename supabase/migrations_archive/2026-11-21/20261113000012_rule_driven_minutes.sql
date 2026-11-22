-- Plan-vs-code gaps (review 2026-11-13).
-- 1. Task Force minutes are due committee.minutes_due_days->TFM days after the
--    meeting (§5), read from the rule registry instead of a fixed 7. The
--    review months stay fixed: no rule row holds them yet.
--    The value is checked: no row for today → 7 (§5); a row whose TFM is not
--    a whole number of days from 1 to 90 → error, never a silent default.
--    Read by a definer helper so every caller gets the same value, whatever
--    csir_rules RLS lets them see.

BEGIN;

CREATE OR REPLACE FUNCTION public.committee_minutes_days(p_body text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v jsonb;
BEGIN
    -- No caller input reaches a write: reads one registry value, same for everyone.
    IF p_body NOT IN ('TFM', 'LSG') THEN RAISE EXCEPTION 'Unknown committee: %', p_body; END IF;
    v := public.csir_rules_value_or_null('committee.minutes_due_days', public.ist_today()) -> p_body;
    IF v IS NULL THEN RETURN CASE p_body WHEN 'TFM' THEN 7 ELSE 2 END; END IF;
    IF jsonb_typeof(v) <> 'number' OR (v::text)::numeric <> trunc((v::text)::numeric)
       OR (v::text)::numeric NOT BETWEEN 1 AND 90 THEN
        RAISE EXCEPTION 'CSIR rule committee.minutes_due_days.% must be whole days from 1 to 90, not %', p_body, v;
    END IF;
    RETURN (v::text)::int;
END;
$$;
REVOKE ALL ON FUNCTION public.committee_minutes_days(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.committee_minutes_days(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.project_slot_plan(p_track text, p_category text)
RETURNS TABLE (kind text, body text, months int[], minutes_days int)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH r AS (
    -- §5 minutes deadline from the rule registry, checked (committee_minutes_days).
    SELECT public.committee_minutes_days('TFM') AS tfm
  )
  SELECT v.kind, v.body, v.months, v.minutes_days FROM (VALUES
    ('PROGRESS_REPORT',      'Progress report',                 ARRAY[3, 9],        NULL::int, true),
    ('REVIEW_COMMITTEE',     'ULIP review committee',           ARRAY[3, 9],        NULL,      p_track IN ('ULIP', 'OLP')),
    ('RESEARCH_COUNCIL',     'Research Council',                ARRAY[3, 9],        NULL,      p_track = 'HQ'),
    ('TASK_FORCE',           'Task Force',                      ARRAY[3, 6, 9, 12], (SELECT tfm FROM r),         p_track = 'HQ' AND p_category IN ('MMP','FBR','NCP','FIR','FTT','FTC')),
    ('TASK_FORCE',           'Task Force (FCP)',                ARRAY[3, 9],        (SELECT tfm FROM r),         p_track = 'HQ' AND p_category = 'FCP'),
    ('MONITORING_COMMITTEE', 'External Monitoring Committee',   ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('FBR','NCP','FIR')),
    ('STAGE_GATE',           'Stage-gate review',               ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('MMP','FTT','FTC'))
  ) v(kind, body, months, minutes_days, applies)
  WHERE applies;
$$;

COMMIT;
