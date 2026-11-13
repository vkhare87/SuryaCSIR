-- ============================================================
-- 20261112000024_pms_2026_from_guideline
-- Enterprise P4, checked against the CSIR PMS Guidelines 2026 text
-- (effective reporting year 2026-27; "applicable to all scientists up to
-- Scientist 'F'"). Corrections to 20261112000018 / 20:
--   1. Only a STANDARD-track report is a 2026 report. Scientist-G and above
--      (ANNEXURE_I / II) keep their own pen-picture flow (LEGACY rules).
--   2. Integrity is a free-text entry per Appendix-B (GOI OM 51/5/72-Estt "A",
--      20 May 1972) — e.g. a certificate, or "not watched long enough" — not
--      a three-value scale.
--   3. The pen picture is the guideline's 15 behavioural items (A Personal
--      attributes, B Professional competence, C Managerial capabilities, five
--      each), each rated Excellent / Very Good / Good / Needs to be improved,
--      no marks. Stored in pms_pen_picture_items; the panel score requires
--      every item rated.
--   4. Part III "Remarks by Evaluation Committee" (pms_panel_scores.remarks).
--   5. Part I pre-fill adds e-mail, CSIR core subject area, specialisation
--      and the Reporting Officer.
-- No 2026 report existed when this was written, so nothing is migrated.
-- Tests: scripts/db/pmsAssessment.db.test.ts.
-- ============================================================
BEGIN;

-- ── 1. 2026 = standard track only ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pms_reports_guard_2026_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            -- pms_caller_track() is what trg_pms_reports_track will set.
            NEW.proforma_version := CASE WHEN coalesce(public.pms_caller_track(), 'STANDARD') = 'STANDARD'
                                         THEN '2026' ELSE 'LEGACY' END;
            NEW.committee_id := NULL;
            NEW.deemed_accepted_at := NULL;
        ELSIF NEW.proforma_version IS DISTINCT FROM OLD.proforma_version
           OR NEW.committee_id IS DISTINCT FROM OLD.committee_id
           OR NEW.deemed_accepted_at IS DISTINCT FROM OLD.deemed_accepted_at THEN
            RAISE EXCEPTION 'proforma, committee and acceptance are written only by the PMS workflow';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ── 2–4. Panel score: free-text integrity, remarks, the 15 items ───────
ALTER TABLE public.pms_panel_scores DROP CONSTRAINT IF EXISTS pms_panel_scores_integrity_check;
ALTER TABLE public.pms_panel_scores ADD CONSTRAINT pms_panel_scores_integrity_check CHECK (btrim(integrity) <> '');
ALTER TABLE public.pms_panel_scores ADD COLUMN IF NOT EXISTS remarks text;

CREATE TABLE IF NOT EXISTS public.pms_pen_picture_items (
    item_key   text PRIMARY KEY,
    group_code text NOT NULL CHECK (group_code IN ('A', 'B', 'C')),
    group_name text NOT NULL,
    label      text NOT NULL,
    sort       smallint NOT NULL
);
ALTER TABLE public.pms_pen_picture_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pms_pen_picture_items_select" ON public.pms_pen_picture_items;
CREATE POLICY "pms_pen_picture_items_select" ON public.pms_pen_picture_items FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pms_pen_picture_items FROM authenticated, anon;
REVOKE ALL ON public.pms_pen_picture_items FROM anon;
GRANT SELECT ON public.pms_pen_picture_items TO authenticated;

INSERT INTO public.pms_pen_picture_items (item_key, group_code, group_name, label, sort) VALUES
    ('personality',        'A', 'Personal attributes',      'Personality', 1),
    ('maturity',           'A', 'Personal attributes',      'Maturity and logical thinking', 2),
    ('selfConfidence',     'A', 'Personal attributes',      'Level of self-confidence', 3),
    ('initiative',         'A', 'Personal attributes',      'Initiative and drive', 4),
    ('mentalAlertness',    'A', 'Personal attributes',      'Mental alertness', 5),
    ('orgRolePerception',  'B', 'Professional competence',  'Perception of organizational role', 1),
    ('jobCompetence',      'B', 'Professional competence',  'Competence to handle the job', 2),
    ('communication',      'B', 'Professional competence',  'Ability to communicate (both in speech and writing)', 3),
    ('dedication',         'B', 'Professional competence',  'Dedication and commitment to the job', 4),
    ('comprehension',      'B', 'Professional competence',  'Comprehension and appreciation of new development related to the job', 5),
    ('collegiality',       'C', 'Managerial capabilities',  'Ability to get along with colleagues', 1),
    ('responsibility',     'C', 'Managerial capabilities',  'Willingness to accept responsibility', 2),
    ('decisionMaking',     'C', 'Managerial capabilities',  'Decision making ability', 3),
    ('crisisHandling',     'C', 'Managerial capabilities',  'Crisis handling', 4),
    ('leadership',         'C', 'Managerial capabilities',  'Qualities of leadership', 5)
ON CONFLICT (item_key) DO NOTHING;

-- Replaces the 20261112000020 signature (adds p_remarks; integrity is text).
DROP FUNCTION IF EXISTS public.pms_record_panel_score(uuid, integer, text, text, text, jsonb, text, text, text, integer, text);
CREATE OR REPLACE FUNCTION public.pms_record_panel_score(
    p_report_id uuid, p_score integer, p_reasons_outstanding text, p_reasons_below text, p_suggestions text,
    p_pen_picture jsonb, p_integrity text, p_adverse_remarks text, p_critical_assessment text, p_remarks text,
    p_quorum_present integer, p_signed_scan_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report  public.pms_reports%ROWTYPE;
    v_total   integer;
    v_missing text;
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
    SELECT string_agg(i.label, ', ' ORDER BY i.group_code, i.sort) INTO v_missing
      FROM public.pms_pen_picture_items i
     WHERE coalesce(p_pen_picture -> 'ratings' ->> i.item_key, '') NOT IN ('Excellent', 'Very Good', 'Good', 'Needs to be improved');
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'Rate every pen-picture item: %', v_missing; END IF;
    IF coalesce(btrim(p_integrity), '') = '' THEN
        RAISE EXCEPTION 'The integrity entry is mandatory (Appendix-B)';
    END IF;
    SELECT count(*) INTO v_total FROM public.pms_evaluation_committee_members WHERE committee_id = v_report.committee_id;
    IF p_quorum_present IS NULL OR p_quorum_present > v_total OR p_quorum_present * 2 < v_total THEN
        RAISE EXCEPTION 'Quorum: at least half of the % members must be present', v_total;
    END IF;

    INSERT INTO public.pms_panel_scores (report_id, committee_id, score, reasons_for_outstanding, reasons_below_threshold,
        suggestions_for_improvement, pen_picture, integrity, adverse_remarks, critical_assessment, remarks,
        quorum_present, members_total, signed_scan_path, recorded_by)
    VALUES (p_report_id, v_report.committee_id, p_score, nullif(btrim(p_reasons_outstanding), ''), nullif(btrim(p_reasons_below), ''),
        nullif(btrim(p_suggestions), ''), p_pen_picture, btrim(p_integrity), nullif(btrim(p_adverse_remarks), ''),
        nullif(btrim(p_critical_assessment), ''), nullif(btrim(p_remarks), ''), p_quorum_present, v_total, p_signed_scan_path, auth.uid());

    UPDATE public.pms_evaluations SET status = 'COMPLETED', updated_at = now() WHERE report_id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'PANEL_SCORE_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('score', p_score, 'quorum', p_quorum_present, 'members', v_total));
END;
$$;
REVOKE ALL ON FUNCTION public.pms_record_panel_score(uuid, integer, text, text, text, jsonb, text, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_record_panel_score(uuid, integer, text, text, text, jsonb, text, text, text, text, integer, text) TO authenticated, service_role;

-- ── 5. Part I pre-fill: the guideline's identification fields ──────────
CREATE OR REPLACE FUNCTION public.pms_part1_from_staff(p_scientist uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT jsonb_strip_nulls(jsonb_build_object(
        'name', s."Name", 'employeeId', s."ID", 'group', s."Group", 'designation', s."Designation",
        'division', s."Division", 'dateOfBirth', s.dob_date, 'dateOfJoining', s.doj_date,
        'inPresentGradeSince', s.doapp_date, 'category', s."Cat", 'email', s."Email",
        'reportingOfficer', (SELECT ro."Name" FROM public.staff ro WHERE ro."ID" = nullif(s."ReportingID", '')),
        'coreSubjectArea', nullif(s."CoreArea", ''), 'specialization', nullif(s."Expertise", ''),
        'highestQualification', nullif(s."HighestQualification", '')))
      FROM public.staff s WHERE s.user_id = p_scientist LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.pms_part1_from_staff(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
