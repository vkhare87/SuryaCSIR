-- Plan-vs-code gaps (review 2026-11-13).
-- 1. Task Force minutes are due committee.minutes_due_days->TFM days after the
--    meeting (§5), read from the rule registry instead of a fixed 7. The
--    review months stay fixed: no rule row holds them yet.

BEGIN;

CREATE OR REPLACE FUNCTION public.project_slot_plan(p_track text, p_category text)
RETURNS TABLE (kind text, body text, months int[], minutes_days int)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH r AS (
    -- §5 minutes deadline from the rule registry; 7 if no row for today.
    SELECT coalesce((public.csir_rules_value_or_null('committee.minutes_due_days', public.ist_today()) ->> 'TFM')::int, 7) AS tfm
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
