-- ============================================================
-- 20261112000020_pms_2026_proforma
-- Enterprise P4 / ES1 — the 2026 proforma's rules (PMS Guidelines 2026,
-- Annexure-A) for reports with proforma_version = '2026'.
--
--   * Questionnaire B for Pay Level 13 and above: pms_reports.questionnaire_b,
--     set at creation from the scientist's designation.
--   * The report goes to the Evaluation Committee of the scientist's grade
--     (tier I: Sci B–D, II: E, III: F, IV: G and above).
--   * ONE panel score per report (pms_panel_scores), recorded by the
--     Reporting Officer with pen picture, integrity, adverse remarks,
--     critical assessment and quorum (at least half the panel present).
--     Members can no longer file separate scores on a 2026 report.
--   * The Empowered Committee concurs with, upgrades or downgrades the panel
--     score, with reasons and quorum (chair + half the members):
--     pms_finalize_report_2026. The old finalize refuses a 2026 report.
-- Designation → pay level / tier are CSIR facts kept as dated rules
-- (csir_rules, verified = false until checked against the guideline).
-- LEGACY reports keep every old rule unchanged.
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

INSERT INTO public.csir_rules (rule_key, value, unit, effective_from, source_ref) VALUES
    ('pms.designation_pay_level',
     '{"Scientist-B":10,"Scientist":11,"Scientist-C":11,"Senior Scientist":12,"Scientist-D":12,"Principal Scientist":13,"Scientist-E":13,"Scientist-F":13,"Scientist-G":14,"Chief Scientist":14}',
     'pay level', '2026-01-01', 'PMS Guidelines 2026, Annexure-A'),
    ('pms.designation_committee_tier',
     '{"Scientist-B":"I","Scientist":"I","Scientist-C":"I","Senior Scientist":"I","Scientist-D":"I","Principal Scientist":"II","Scientist-E":"II","Scientist-F":"III","Scientist-G":"IV","Chief Scientist":"IV"}',
     NULL, '2026-01-01', 'PMS Guidelines 2026, Evaluation Committees'),
    ('pms.questionnaire_b_min_pay_level', '13', 'pay level', '2026-01-01', 'PMS Guidelines 2026, Annexure-A Part II')
ON CONFLICT (rule_key, effective_from) DO NOTHING;

-- "Scientist - E", "scientist-e" → "Scientist-E"
CREATE OR REPLACE FUNCTION public.pms_designation_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT initcap(regexp_replace(btrim(coalesce(p, '')), '\s*-\s*', '-', 'g'));
$$;

-- The staff designation of the scientist behind a report.
CREATE OR REPLACE FUNCTION public.pms_report_designation(p_report_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.pms_designation_key(s."Designation")
    FROM public.pms_reports r JOIN public.staff s ON s.user_id = r.scientist_id
   WHERE r.id = p_report_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.pms_report_designation(uuid) FROM PUBLIC, anon, authenticated;

-- ── Questionnaire B ────────────────────────────────────────────────────
ALTER TABLE public.pms_reports ADD COLUMN IF NOT EXISTS questionnaire_b boolean NOT NULL DEFAULT false;

-- Trigger: set once, on creation, from the scientist's designation. Definer
-- because the staff row is read for the report's scientist; the insert
-- itself is gated by reports_insert.
CREATE OR REPLACE FUNCTION public.pms_reports_set_questionnaire_b()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.questionnaire_b := coalesce((
            SELECT (public.csir_rule('pms.designation_pay_level') ->> public.pms_designation_key(s."Designation"))::int
                   >= public.csir_rule('pms.questionnaire_b_min_pay_level')::int
              FROM public.staff s WHERE s.user_id = NEW.scientist_id LIMIT 1), false);
    ELSE
        NEW.questionnaire_b := OLD.questionnaire_b;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pms_reports_set_questionnaire_b() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pms_reports_questionnaire_b ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_questionnaire_b BEFORE INSERT OR UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_reports_set_questionnaire_b();

-- ── Assign: the committee of the scientist's grade ─────────────────────
-- Body is 20260712000004 plus the tier check for 2026 reports and the
-- committee recorded on the report.
CREATE OR REPLACE FUNCTION public.pms_assign_evaluators(p_report_id uuid, p_committee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_uid    uuid;
    v_tier   text;
    v_want   text;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can assign evaluators'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Report must be SUBMITTED before assigning evaluators';
    END IF;

    IF NOT pms_committee_panel_valid(p_committee_id) THEN
        RAISE EXCEPTION 'Evaluation Committee panel is invalid: needs an odd number of members including a Reporting Officer, a Reviewing Officer, and an Empowered Committee member';
    END IF;

    IF v_report.proforma_version = '2026' THEN
        SELECT tier INTO v_tier FROM pms_evaluation_committees WHERE id = p_committee_id;
        v_want := public.csir_rule('pms.designation_committee_tier') ->> public.pms_report_designation(p_report_id);
        IF v_want IS NULL THEN
            RAISE EXCEPTION 'The scientist''s designation does not name a grade; correct it on the staff record first';
        END IF;
        IF v_tier IS DISTINCT FROM v_want THEN
            RAISE EXCEPTION 'This report goes to a tier % committee (the scientist''s grade); this committee is tier %',
                v_want, coalesce(v_tier, 'not set');
        END IF;
    END IF;

    FOR v_uid IN
        SELECT user_id FROM pms_evaluation_committee_members WHERE committee_id = p_committee_id
    LOOP
        INSERT INTO pms_evaluations (report_id, evaluator_id)
        VALUES (p_report_id, v_uid)
        ON CONFLICT (report_id, evaluator_id) DO NOTHING;

        INSERT INTO pms_notifications (user_id, type, title, body, report_id)
        VALUES (v_uid, 'assigned_evaluator',
                'You have been assigned to evaluate a report',
                'A scientist''s appraisal report has been assigned to your Evaluation Committee.',
                p_report_id);
    END LOOP;

    UPDATE pms_reports
        SET status = 'UNDER_EVALUATION_COMMITTEE_REVIEW', committee_id = p_committee_id, updated_at = now()
        WHERE id = p_report_id AND status = 'SUBMITTED';

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'ASSIGN_EVALUATORS', 'pms_reports', p_report_id,
            jsonb_build_object('committee_id', p_committee_id));
END;
$$;

-- ── One panel score ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pms_panel_scores (
    report_id                   uuid PRIMARY KEY REFERENCES public.pms_reports(id) ON DELETE RESTRICT,
    committee_id                uuid NOT NULL REFERENCES public.pms_evaluation_committees(id),
    score                       integer NOT NULL CHECK (score BETWEEN 0 AND 100),
    reasons_for_outstanding     text,
    reasons_below_threshold     text,
    suggestions_for_improvement text,
    pen_picture                 jsonb NOT NULL DEFAULT '{}',
    integrity                   text NOT NULL CHECK (integrity IN ('Impeccable', 'Beyond Doubt', 'To be Monitored')),
    adverse_remarks             text,
    critical_assessment         text,
    quorum_present              integer NOT NULL,
    members_total               integer NOT NULL,
    signed_scan_path            text,
    recorded_by                 uuid NOT NULL REFERENCES auth.users(id),
    recorded_at                 timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pms_panel_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pms_panel_scores_select" ON public.pms_panel_scores;
-- Like the committee decision: the scientist once communicated, other
-- readers of the report always.
CREATE POLICY "pms_panel_scores_select" ON public.pms_panel_scores FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = pms_panel_scores.report_id
                     AND (r.scientist_id <> (SELECT auth.uid()) OR r.status IN ('FINALIZED', 'UNDER_GRIEVANCE_REVIEW'))));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_panel_scores FROM authenticated, anon;
REVOKE ALL ON public.pms_panel_scores FROM anon;
GRANT SELECT ON public.pms_panel_scores TO authenticated;
DROP TRIGGER IF EXISTS trg_lock_pms_panel_scores ON public.pms_panel_scores;
CREATE TRIGGER trg_lock_pms_panel_scores BEFORE INSERT OR UPDATE OR DELETE ON public.pms_panel_scores
    FOR EACH ROW EXECUTE FUNCTION public.pms_block_locked_cycle_children();

CREATE OR REPLACE FUNCTION public.pms_record_panel_score(
    p_report_id uuid, p_score integer, p_reasons_outstanding text, p_reasons_below text, p_suggestions text,
    p_pen_picture jsonb, p_integrity text, p_adverse_remarks text, p_critical_assessment text, p_quorum_present integer,
    p_signed_scan_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
    v_total  integer;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF NOT coalesce(public.pms_is_admin() OR EXISTS (
            SELECT 1 FROM public.pms_evaluation_committee_members m
             WHERE m.committee_id = v_report.committee_id AND m.user_id = auth.uid() AND m.role = 'REPORTING_OFFICER'), false) THEN
        RAISE EXCEPTION 'The Reporting Officer records the panel''s score';
    END IF;
    IF v_report.proforma_version <> '2026' THEN RAISE EXCEPTION 'Older reports are scored by each member, as before'; END IF;
    IF v_report.status <> 'UNDER_EVALUATION_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'The report is not with the Evaluation Committee';
    END IF;
    IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN RAISE EXCEPTION 'The score is a whole number from 0 to 100'; END IF;
    IF p_score >= 90 AND coalesce(btrim(p_reasons_outstanding), '') = '' THEN
        RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
    END IF;
    IF p_score <= 75 AND (coalesce(btrim(p_reasons_below), '') = '' OR coalesce(btrim(p_suggestions), '') = '') THEN
        RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
    END IF;
    SELECT count(*) INTO v_total FROM public.pms_evaluation_committee_members WHERE committee_id = v_report.committee_id;
    IF p_quorum_present IS NULL OR p_quorum_present > v_total OR p_quorum_present * 2 < v_total THEN
        RAISE EXCEPTION 'Quorum: at least half of the % members must be present', v_total;
    END IF;

    INSERT INTO public.pms_panel_scores (report_id, committee_id, score, reasons_for_outstanding, reasons_below_threshold,
        suggestions_for_improvement, pen_picture, integrity, adverse_remarks, critical_assessment,
        quorum_present, members_total, signed_scan_path, recorded_by)
    VALUES (p_report_id, v_report.committee_id, p_score, nullif(btrim(p_reasons_outstanding), ''), nullif(btrim(p_reasons_below), ''),
        nullif(btrim(p_suggestions), ''), coalesce(p_pen_picture, '{}'), p_integrity, nullif(btrim(p_adverse_remarks), ''),
        nullif(btrim(p_critical_assessment), ''), p_quorum_present, v_total, p_signed_scan_path, auth.uid());

    -- The members' rows close with the panel; the existing trigger moves the
    -- report to the Empowered Committee.
    UPDATE public.pms_evaluations SET status = 'COMPLETED', updated_at = now() WHERE report_id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PANEL_SCORE_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('score', p_score, 'quorum', p_quorum_present, 'members', v_total));
END;
$$;

-- On a 2026 report a member cannot file their own score or close their row.
CREATE OR REPLACE FUNCTION public.pms_evaluations_guard_2026()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND (NEW.total_score IS NOT NULL OR NEW.status = 'COMPLETED')
       AND EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = NEW.report_id AND r.proforma_version = '2026') THEN
        RAISE EXCEPTION 'A 2026 report gets one panel score, recorded by the Reporting Officer';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pms_evaluations_guard_2026 ON public.pms_evaluations;
CREATE TRIGGER trg_pms_evaluations_guard_2026 BEFORE INSERT OR UPDATE ON public.pms_evaluations
    FOR EACH ROW EXECUTE FUNCTION public.pms_evaluations_guard_2026();

-- ── Empowered Committee: concur, upgrade or downgrade ──────────────────
ALTER TABLE public.pms_committee_decisions
    ADD COLUMN IF NOT EXISTS ec_action           text CHECK (ec_action IN ('CONCUR', 'UPGRADE', 'DOWNGRADE')),
    ADD COLUMN IF NOT EXISTS panel_score         integer,
    ADD COLUMN IF NOT EXISTS general_comments    text,
    ADD COLUMN IF NOT EXISTS critical_assessment text,
    ADD COLUMN IF NOT EXISTS quorum_present      integer,
    ADD COLUMN IF NOT EXISTS members_total       integer;

CREATE OR REPLACE FUNCTION public.pms_decisions_require_action()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.ec_action IS NULL
       AND EXISTS (SELECT 1 FROM public.pms_reports r WHERE r.id = NEW.report_id AND r.proforma_version = '2026') THEN
        RAISE EXCEPTION 'A 2026 report is finalized with pms_finalize_report_2026 (concur, upgrade or downgrade)';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pms_decisions_require_action ON public.pms_committee_decisions;
CREATE TRIGGER trg_pms_decisions_require_action BEFORE INSERT ON public.pms_committee_decisions
    FOR EACH ROW EXECUTE FUNCTION public.pms_decisions_require_action();

CREATE OR REPLACE FUNCTION public.pms_finalize_report_2026(
    p_report_id uuid, p_action text, p_final_score integer, p_reasons text, p_suggestions text,
    p_general_comments text, p_critical_assessment text, p_quorum_present integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_panel   public.pms_panel_scores%ROWTYPE;
    v_members integer;
    v_score   integer;
    v_out     text;
    v_below   text;
    v_sugg    text;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF NOT coalesce(public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid()), false) THEN
        RAISE EXCEPTION 'Only Empowered Committee members can finalize reports';
    END IF;
    IF v_report.proforma_version <> '2026' THEN RAISE EXCEPTION 'Older reports are finalized with pms_finalize_report'; END IF;
    IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
    END IF;
    IF NOT public.pms_empowered_committee_valid(v_report.cycle_id) THEN
        RAISE EXCEPTION 'Empowered Committee configuration is invalid: needs 3, 5, or 7 members plus the Director/DG as Chairman';
    END IF;
    SELECT * INTO v_panel FROM public.pms_panel_scores WHERE report_id = p_report_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The Evaluation Committee has not recorded its panel score'; END IF;

    SELECT count(*) FILTER (WHERE NOT is_chairman) INTO v_members
      FROM public.pms_empowered_committee_members WHERE cycle_id = v_report.cycle_id;
    IF p_quorum_present IS NULL OR p_quorum_present > v_members + 1 OR (p_quorum_present - 1) * 2 < v_members THEN
        RAISE EXCEPTION 'Quorum: the Chairman and at least half of the % members must be present', v_members;
    END IF;

    IF p_action = 'CONCUR' THEN
        v_score := v_panel.score;
        v_out := v_panel.reasons_for_outstanding;
        v_below := v_panel.reasons_below_threshold;
        v_sugg := v_panel.suggestions_for_improvement;
    ELSIF p_action IN ('UPGRADE', 'DOWNGRADE') THEN
        IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 100 THEN
            RAISE EXCEPTION 'The score is a whole number from 0 to 100';
        END IF;
        IF (p_action = 'UPGRADE' AND p_final_score <= v_panel.score) OR (p_action = 'DOWNGRADE' AND p_final_score >= v_panel.score) THEN
            RAISE EXCEPTION 'To % the score must be % than the panel''s %', lower(p_action),
                CASE p_action WHEN 'UPGRADE' THEN 'higher' ELSE 'lower' END, v_panel.score;
        END IF;
        IF length(coalesce(btrim(p_reasons), '')) < 20 THEN
            RAISE EXCEPTION 'Give the reasons for changing the panel''s score';
        END IF;
        v_score := p_final_score;
        v_out := CASE WHEN v_score >= 90 THEN btrim(p_reasons) END;
        v_below := CASE WHEN v_score <= 75 THEN btrim(p_reasons) END;
        v_sugg := nullif(btrim(p_suggestions), '');
        IF v_score <= 75 AND v_sugg IS NULL THEN
            RAISE EXCEPTION 'Scores of 75 or below require suggestions_for_improvement';
        END IF;
    ELSE
        RAISE EXCEPTION 'Concur, upgrade or downgrade';
    END IF;

    INSERT INTO public.pms_committee_decisions
        (report_id, decided_by, final_score, justification, reasons_for_outstanding, reasons_below_threshold,
         suggestions_for_improvement, ec_action, panel_score, general_comments, critical_assessment,
         quorum_present, members_total)
    VALUES (p_report_id, auth.uid(), v_score,
            CASE WHEN p_action = 'CONCUR'
                 THEN 'The Empowered Committee concurs with the Evaluation Committee''s score of ' || v_panel.score || '.'
                 ELSE 'The Empowered Committee ' || lower(p_action) || 's the score from ' || v_panel.score || ' to ' || v_score
                      || ': ' || btrim(p_reasons) END,
            v_out, v_below, v_sugg, p_action, v_panel.score, nullif(btrim(p_general_comments), ''),
            nullif(btrim(p_critical_assessment), ''), p_quorum_present, v_members + 1);

    UPDATE public.pms_reports SET status = 'FINALIZED', score_communicated_at = now(), updated_at = now()
     WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('final_score', v_score, 'ec_action', p_action, 'panel_score', v_panel.score));
    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized', 'Your appraisal report has been finalized',
            'The Empowered Committee has assigned your final score. You may submit a representation within 15 days.',
            p_report_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_record_panel_score(uuid, integer, text, text, text, jsonb, text, text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_finalize_report_2026(uuid, text, integer, text, text, text, text, integer)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_record_panel_score(uuid, integer, text, text, text, jsonb, text, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_finalize_report_2026(uuid, text, integer, text, text, text, text, integer)              TO authenticated, service_role;

COMMIT;
