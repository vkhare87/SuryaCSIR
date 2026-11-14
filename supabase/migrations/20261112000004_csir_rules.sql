-- ============================================================
-- 20261112000004_csir_rules
-- Enterprise P1 / EA4 — CSIR rules as dated data.
--
-- A rule value (₹5 lakh, 20%, 6 years …) is a row with the date it took
-- effect and the OM paragraph it came from. csir_rule() answers for any
-- date, so an old file is judged by the rule of its day. Rows are only ever
-- added: csir_rule_set() closes the previous row and appends the new one.
-- A value read from the guideline summary, not the OM, is verified = false.
--
-- The starting rows live here, not in supabase/seed: proposal readiness and
-- the RCE route read two of them, so a database without them cannot run.
-- Source: CSIR OM No. 33/GIM&FGP/2025-CPD, 25 April 2025 ("§n").
-- Not loaded: project_staff.positions — the summary table is damaged; it is
-- entered from the OM with csir_rule_set().
-- Tests: scripts/db/rules.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.csir_rules (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key       text NOT NULL CHECK (btrim(rule_key) <> ''),
    value          jsonb NOT NULL,
    unit           text,
    effective_from date NOT NULL,
    effective_to   date,
    source_ref     text NOT NULL CHECK (btrim(source_ref) <> ''),
    verified       boolean NOT NULL DEFAULT false,
    note           text,
    created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_key, effective_from),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE public.csir_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "csir_rules_select" ON public.csir_rules;
CREATE POLICY "csir_rules_select" ON public.csir_rules FOR SELECT TO authenticated
    USING (public.caller_is_verified());
-- No write policy and no write grant: rows change only through csir_rule_set().
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.csir_rules FROM authenticated, anon;
REVOKE ALL ON public.csir_rules FROM anon;
GRANT SELECT ON public.csir_rules TO authenticated;
GRANT ALL ON public.csir_rules TO service_role;

-- The value of a rule on a date. Raises when there is none: a missing rule
-- is a data error, never a silent default.
CREATE OR REPLACE FUNCTION public.csir_rule(p_key text, p_on date DEFAULT public.ist_today())
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
    v jsonb;
BEGIN
    SELECT r.value INTO v
      FROM public.csir_rules r
     WHERE r.rule_key = p_key
       AND r.effective_from <= p_on
       AND (r.effective_to IS NULL OR r.effective_to >= p_on)
     ORDER BY r.effective_from DESC
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no CSIR rule % on %', p_key, p_on;
    END IF;
    RETURN v;
END;
$$;

-- MasterAdmin adds a value from a date on. The earlier open row ends the day
-- before. A row is never edited in place, and a date may not be inserted
-- before the latest row — history stays as it was read.
CREATE OR REPLACE FUNCTION public.csir_rule_set(
    p_key text, p_value jsonb, p_unit text, p_effective_from date, p_source_ref text, p_verified boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT coalesce(public.caller_has_role('MasterAdmin'), false) THEN
        RAISE EXCEPTION 'Only MasterAdmin can change a CSIR rule';
    END IF;
    IF coalesce(btrim(p_key), '') = '' OR p_value IS NULL OR p_effective_from IS NULL THEN
        RAISE EXCEPTION 'Give the rule, its value and the date it takes effect';
    END IF;
    IF coalesce(btrim(p_source_ref), '') = '' THEN
        RAISE EXCEPTION 'Name the OM paragraph the value comes from';
    END IF;
    IF EXISTS (SELECT 1 FROM public.csir_rules WHERE rule_key = p_key AND effective_from >= p_effective_from) THEN
        RAISE EXCEPTION 'Rule % already has a value from % or later', p_key, p_effective_from;
    END IF;

    UPDATE public.csir_rules
       SET effective_to = p_effective_from - 1
     WHERE rule_key = p_key AND (effective_to IS NULL OR effective_to >= p_effective_from);

    INSERT INTO public.csir_rules (rule_key, value, unit, effective_from, source_ref, verified, created_by)
    VALUES (btrim(p_key), p_value, nullif(btrim(p_unit), ''), p_effective_from, btrim(p_source_ref),
            coalesce(p_verified, false), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.csir_rule(text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.csir_rule_set(text, jsonb, text, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.csir_rule(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csir_rule_set(text, jsonb, text, date, text, boolean) TO authenticated, service_role;

-- ── Starting values (all unverified until checked against the OM) ──────
INSERT INTO public.csir_rules (rule_key, value, unit, effective_from, source_ref) VALUES
    ('project.major_equipment_threshold_inr',              '500000',                                         'INR',    '2025-04-25', '§3.1'),
    ('project.cost_overrun_dg_limit_pct',                  '20',                                             'pct',    '2025-04-25', '§6.4'),
    ('project_staff.tenure_cap_years',                     '6',                                              'years',  '2025-04-25', '§3.3'),
    ('project_staff.tenure_cap_years_short_industry',      '7',                                              'years',  '2025-04-25', '§3.3'),
    ('project_staff.paid_leave_days_per_year',             '12',                                             'days',   '2025-04-25', '§3.3'),
    ('project_staff.maternity_leave_days',                 '180',                                            'days',   '2025-04-25', '§3.3'),
    ('project_staff.paternity_leave_days',                 '15',                                             'days',   '2025-04-25', '§3.3'),
    ('project_staff.age_relaxation_years',                 '{"SC":5,"ST":5,"PwBD":5,"Women":5,"OBC":3}',     'years',  '2025-04-25', '§3.3'),
    ('project_staff.waitlist_validity_months',             '12',                                             'months', '2025-04-25', '§3.3'),
    ('project_staff.waitlist_min_project_months',          '18',                                             'months', '2025-04-25', '§3.3'),
    ('project_staff.direct_engagement_max_project_months', '12',                                             'months', '2025-04-25', '§3.3'),
    ('project_staff.selection_quorum',                     '{"chair":1,"members":2}',                        NULL,     '2025-04-25', '§3.3'),
    ('committee.minutes_due_days',                         '{"LSG":2,"TFM":7}',                              'days',   '2025-04-25', '§5'),
    ('monitoring.cpd_halfyearly_due',                      '["04-15","09-15"]',                              NULL,     '2025-04-25', '§5')
ON CONFLICT (rule_key, effective_from) DO NOTHING;

-- ── Switch the two literal checks to the registry ──────────────────────
-- Body is 20261111000001 with only the ₹5 lakh literal replaced.
CREATE OR REPLACE FUNCTION public.proposal_readiness(p_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.proposal_missing_fields(p) || array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'EQUIPMENT'
                         AND b.amount >= public.csir_rule('project.major_equipment_threshold_inr')::numeric)
          AND NOT EXISTS (SELECT 1 FROM public.proposal_documents d
                           WHERE d.proposal_id = p.id AND d.doc_type = 'quotation')
         THEN 'equipment_quotation' END,
    CASE WHEN p.track = 'HQ' AND coalesce(p.category_code, '') NOT IN ('MMP', 'FCP')
          AND EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'WORKS')
         THEN 'works_not_allowed' END
  ], NULL)
  FROM public.proposals p WHERE p.id = p_id;
$$;

-- Body is 20261112000001 with only the 20% literal replaced; now STABLE,
-- since it reads a table.
CREATE OR REPLACE FUNCTION public.project_change_step_kinds(p_track text, p_kind text, p_increase_pct numeric)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_track = 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN p_kind = 'TIME_OVERRUN' THEN
         ARRAY['PME_VETTING', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' AND coalesce(p_increase_pct, 0) <= public.csir_rule('project.cost_overrun_dg_limit_pct')::numeric THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'RCE' THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE',
               'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind IN ('REPHASING', 'REAPPROPRIATION', 'REALLOCATION') THEN
         ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']
    WHEN p_kind = 'FORECLOSURE' THEN ARRAY['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL']
  END;
$$;

COMMIT;
