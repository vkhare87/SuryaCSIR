-- ══════════════════════════════════════════════════════════════
-- PMS 2026 GUIDELINES REFACTOR
-- Implements the notified 2026 CSIR PMS guidelines, replacing the
-- legacy 2012 scheme:
--   * Collegium → Evaluation Committee (tiers I/II/III)
--   * 0.5–1.1 decimal scale → 0–100 integer scale (hard cutover:
--     legacy scores are nulled)
--   * Chairman review stage dropped
--   * Part V Annual Work Plan (AWP)
--   * 90-day minimum-duty rule, non-submission certificates
--   * Financial-year deadlines + Nov 30 absolute system lock
--   * Representation → Grievance Redressal Committee flow
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- 1. RENAME: Collegium → Evaluation Committee
-- ──────────────────────────────────────────────────────────────

ALTER TABLE pms_collegiums RENAME TO pms_evaluation_committees;
ALTER TABLE pms_collegium_members RENAME TO pms_evaluation_committee_members;
ALTER TABLE pms_evaluation_committee_members RENAME COLUMN collegium_id TO committee_id;

-- Tier: I evaluates Scientists B/C/D, II evaluates E, III evaluates F
ALTER TABLE pms_evaluation_committees
    ADD COLUMN tier text CHECK (tier IN ('I','II','III'));

-- Panel member roles: Reporting Officer, Reviewing Officer, Empowered Committee member
ALTER TABLE pms_evaluation_committee_members
    DROP CONSTRAINT IF EXISTS pms_collegium_members_role_check;
UPDATE pms_evaluation_committee_members
    SET role = CASE role
        WHEN 'CHAIRMAN' THEN 'REVIEWING_OFFICER'
        WHEN 'MEMBER'   THEN 'EC_MEMBER'
        ELSE role
    END;
ALTER TABLE pms_evaluation_committee_members
    ADD CONSTRAINT pms_ec_members_role_check
    CHECK (role IN ('REPORTING_OFFICER','REVIEWING_OFFICER','EC_MEMBER'));

-- Replacement membership helper (old one references renamed tables)
CREATE OR REPLACE FUNCTION pms_is_evaluation_committee_member(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
          FROM pms_evaluation_committee_members pcm
          JOIN pms_evaluation_committees pc ON pc.id = pcm.committee_id
         WHERE pc.cycle_id = p_cycle_id
           AND pcm.user_id = auth.uid()
    );
$$;

-- Re-point policies that used the old helper, then drop it
DROP POLICY IF EXISTS "reports_select" ON pms_reports;
CREATE POLICY "reports_select" ON pms_reports FOR SELECT TO authenticated
    USING (
        scientist_id = auth.uid()
        OR pms_is_admin()
        OR pms_is_evaluation_committee_member(cycle_id)
        OR EXISTS (SELECT 1 FROM pms_evaluations WHERE report_id = pms_reports.id AND evaluator_id = auth.uid())
    );

DROP POLICY IF EXISTS "sections_select" ON pms_report_sections;
CREATE POLICY "sections_select" ON pms_report_sections FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id
              AND (
                  r.scientist_id = auth.uid() OR pms_is_admin()
                  OR pms_is_evaluation_committee_member(r.cycle_id)
                  OR EXISTS (SELECT 1 FROM pms_evaluations e WHERE e.report_id = r.id AND e.evaluator_id = auth.uid())
              )
        )
    );

DROP FUNCTION IF EXISTS pms_is_collegium_member(uuid);

-- ──────────────────────────────────────────────────────────────
-- 2. EMPOWERED COMMITTEE CONFIGURATION (3/5/7 members + Chairman)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_empowered_committee_members (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id    uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    is_chairman boolean NOT NULL DEFAULT false,
    UNIQUE (cycle_id, user_id)
);

-- Valid = 3, 5, or 7 ordinary members plus exactly one Chairman (Director/DG)
CREATE OR REPLACE FUNCTION pms_empowered_committee_valid(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT COUNT(*) FILTER (WHERE NOT is_chairman) IN (3,5,7)
       AND COUNT(*) FILTER (WHERE is_chairman) = 1
      FROM pms_empowered_committee_members
     WHERE cycle_id = p_cycle_id;
$$;

-- Panel valid = odd member count with at least one of each role
CREATE OR REPLACE FUNCTION pms_committee_panel_valid(p_committee_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT COUNT(*) % 2 = 1
       AND COUNT(*) FILTER (WHERE role = 'REPORTING_OFFICER') >= 1
       AND COUNT(*) FILTER (WHERE role = 'REVIEWING_OFFICER') >= 1
       AND COUNT(*) FILTER (WHERE role = 'EC_MEMBER') >= 1
      FROM pms_evaluation_committee_members
     WHERE committee_id = p_committee_id;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. STATUS ENUM — drop chairman stage, add 2026 states
-- ──────────────────────────────────────────────────────────────

ALTER TABLE pms_reports DROP CONSTRAINT IF EXISTS pms_reports_status_check;
UPDATE pms_reports SET status = 'UNDER_EVALUATION_COMMITTEE_REVIEW' WHERE status = 'UNDER_COLLEGIUM_REVIEW';
UPDATE pms_reports SET status = 'EMPOWERED_COMMITTEE_REVIEW'        WHERE status = 'CHAIRMAN_REVIEW';
ALTER TABLE pms_reports ADD CONSTRAINT pms_reports_status_check
    CHECK (status IN (
        'DRAFT','SUBMITTED','UNDER_EVALUATION_COMMITTEE_REVIEW',
        'EMPOWERED_COMMITTEE_REVIEW','FINALIZED',
        'NOT_ASSESSED','UNDER_GRIEVANCE_REVIEW'
    ));

-- ──────────────────────────────────────────────────────────────
-- 4. PMS_REPORTS — Part I fields, duty days, 0–100 integer score
-- ──────────────────────────────────────────────────────────────

ALTER TABLE pms_reports
    ADD COLUMN previous_pms_submitted_on_time boolean,
    ADD COLUMN previous_pms_submission_date   date,
    ADD COLUMN duty_days                      integer CHECK (duty_days >= 0),
    ADD COLUMN system_remark                  text,
    ADD COLUMN score_communicated_at          timestamptz,
    ADD COLUMN non_submission_certificate_path text;

-- Hard cutover: legacy 0.5–1.1 scores are not convertible to 0–100
ALTER TABLE pms_reports DROP CONSTRAINT IF EXISTS pms_reports_self_score_check;
ALTER TABLE pms_reports ALTER COLUMN self_score TYPE integer USING NULL;
ALTER TABLE pms_reports ADD CONSTRAINT pms_reports_self_score_check
    CHECK (self_score BETWEEN 0 AND 100);

-- ──────────────────────────────────────────────────────────────
-- 5. SCORES → 0–100 INTEGERS + mandatory-reason columns
-- ──────────────────────────────────────────────────────────────

ALTER TABLE pms_evaluations
    ADD COLUMN total_score                 integer CHECK (total_score BETWEEN 0 AND 100),
    ADD COLUMN reasons_for_outstanding     text,
    ADD COLUMN reasons_below_threshold     text,
    ADD COLUMN suggestions_for_improvement text;

ALTER TABLE pms_committee_decisions DROP CONSTRAINT IF EXISTS pms_committee_decisions_final_score_check;
ALTER TABLE pms_committee_decisions ALTER COLUMN final_score TYPE integer USING NULL;
ALTER TABLE pms_committee_decisions ADD CONSTRAINT pms_committee_decisions_final_score_check
    CHECK (final_score BETWEEN 0 AND 100);
ALTER TABLE pms_committee_decisions
    ADD COLUMN reasons_for_outstanding     text,
    ADD COLUMN reasons_below_threshold     text,
    ADD COLUMN suggestions_for_improvement text;

-- ──────────────────────────────────────────────────────────────
-- 6. DROP CHAIRMAN REVIEW STAGE
-- ──────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS pms_chairman_reviews CASCADE;
DROP FUNCTION IF EXISTS pms_save_chairman_review(uuid, numeric, numeric, text);

-- ──────────────────────────────────────────────────────────────
-- 7. PART V — ANNUAL WORK PLAN
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_awp_activities (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id                 uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE,
    nature_of_activity        text NOT NULL,
    role                      text NOT NULL,
    time_committed_percentage numeric(5,2) NOT NULL CHECK (time_committed_percentage BETWEEN 0 AND 100),
    milestones                jsonb NOT NULL DEFAULT '[]',
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pms_awp_activities_report_id_idx ON pms_awp_activities(report_id);

CREATE TRIGGER trg_pms_awp_activities_updated_at
    BEFORE UPDATE ON pms_awp_activities
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 8. REPRESENTATION + GRIEVANCE REDRESSAL COMMITTEE
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pms_representations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id    uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE UNIQUE,
    scientist_id uuid NOT NULL,
    grounds      text NOT NULL CHECK (length(trim(grounds)) >= 20),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED')),
    resolution   text,
    resolved_by  uuid,
    resolved_at  timestamptz
);

CREATE TABLE IF NOT EXISTS pms_grievance_members (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
    user_id  uuid NOT NULL,
    UNIQUE (cycle_id, user_id)
);

CREATE OR REPLACE FUNCTION pms_is_grievance_member(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM pms_grievance_members
        WHERE cycle_id = p_cycle_id AND user_id = auth.uid()
    );
$$;

-- ──────────────────────────────────────────────────────────────
-- 9. FINANCIAL-YEAR DEADLINES + NOV 30 ABSOLUTE LOCK
-- ──────────────────────────────────────────────────────────────

-- Reporting year ends Mar 31 of year Y ⇒ May 15 / Jun 30 / Jul 31 / Nov 30 of Y
CREATE OR REPLACE FUNCTION pms_deadline(p_cycle_id uuid, p_kind text)
RETURNS date LANGUAGE sql STABLE AS $$
    SELECT CASE p_kind
        WHEN 'SELF_APPRAISAL'       THEN make_date(extract(year FROM end_date)::int, 5, 15)
        WHEN 'EC_COMPLETION'        THEN make_date(extract(year FROM end_date)::int, 6, 30)
        WHEN 'EMPOWERED_COMPLETION' THEN make_date(extract(year FROM end_date)::int, 7, 31)
        WHEN 'SYSTEM_LOCK'          THEN make_date(extract(year FROM end_date)::int, 11, 30)
    END
    FROM appraisal_cycles WHERE id = p_cycle_id;
$$;

CREATE OR REPLACE FUNCTION pms_cycle_locked(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT now()::date > pms_deadline(p_cycle_id, 'SYSTEM_LOCK');
$$;

-- Absolute lock: applies to everyone, including admins and RPCs
CREATE OR REPLACE FUNCTION pms_block_locked_cycle_reports()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cycle_id uuid;
BEGIN
    v_cycle_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cycle_id ELSE NEW.cycle_id END;
    IF pms_cycle_locked(v_cycle_id) THEN
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION pms_block_locked_cycle_children()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_report_id uuid;
    v_cycle_id  uuid;
BEGIN
    v_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
    SELECT cycle_id INTO v_cycle_id FROM pms_reports WHERE id = v_report_id;
    IF v_cycle_id IS NOT NULL AND pms_cycle_locked(v_cycle_id) THEN
        RAISE EXCEPTION 'PMS cycle is locked (system-wide lock after November 30)';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_lock_pms_reports
    BEFORE INSERT OR UPDATE OR DELETE ON pms_reports
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_reports();

CREATE TRIGGER trg_lock_pms_report_sections
    BEFORE INSERT OR UPDATE OR DELETE ON pms_report_sections
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

CREATE TRIGGER trg_lock_pms_annexures
    BEFORE INSERT OR UPDATE OR DELETE ON pms_annexures
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

CREATE TRIGGER trg_lock_pms_evaluations
    BEFORE INSERT OR UPDATE OR DELETE ON pms_evaluations
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

CREATE TRIGGER trg_lock_pms_committee_decisions
    BEFORE INSERT OR UPDATE OR DELETE ON pms_committee_decisions
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

CREATE TRIGGER trg_lock_pms_awp_activities
    BEFORE INSERT OR UPDATE OR DELETE ON pms_awp_activities
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

CREATE TRIGGER trg_lock_pms_representations
    BEFORE INSERT OR UPDATE OR DELETE ON pms_representations
    FOR EACH ROW EXECUTE FUNCTION pms_block_locked_cycle_children();

-- ──────────────────────────────────────────────────────────────
-- 10. RPCs — 2026 state machine
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pms_submit_report(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report  pms_reports%ROWTYPE;
    v_cycle   appraisal_cycles%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.scientist_id <> auth.uid() THEN RAISE EXCEPTION 'Not your report'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF v_report.period_from IS NULL OR v_report.period_to IS NULL THEN
        RAISE EXCEPTION 'period_from and period_to must be set before submitting';
    END IF;

    SELECT * INTO v_cycle FROM appraisal_cycles WHERE id = v_report.cycle_id;
    IF v_cycle.status <> 'OPEN' THEN RAISE EXCEPTION 'Appraisal cycle is not OPEN'; END IF;

    IF now()::date > pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL') THEN
        RAISE EXCEPTION 'Self-appraisal deadline (May 15) has passed; contact administration';
    END IF;

    IF v_report.duty_days IS NOT NULL AND v_report.duty_days < 90 THEN
        RAISE EXCEPTION 'Physical duty days below 90; report is not assessable under 2026 guidelines';
    END IF;

    UPDATE pms_reports
        SET status = 'SUBMITTED', submitted_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SUBMIT', 'pms_reports', p_report_id, '{}');
END;
$$;

-- Assign an Evaluation Committee (whole panel becomes the evaluators)
DROP FUNCTION IF EXISTS pms_assign_evaluators(uuid, uuid[]);
CREATE OR REPLACE FUNCTION pms_assign_evaluators(
    p_report_id    uuid,
    p_committee_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
    v_uid    uuid;
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
        SET status = 'UNDER_EVALUATION_COMMITTEE_REVIEW', updated_at = now()
        WHERE id = p_report_id AND status = 'SUBMITTED';

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'ASSIGN_EVALUATORS', 'pms_reports', p_report_id,
            jsonb_build_object('committee_id', p_committee_id));
END;
$$;

-- Auto-advance to EMPOWERED_COMMITTEE_REVIEW when all evaluations complete
CREATE OR REPLACE FUNCTION pms_check_evaluation_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report_id uuid;
    v_cycle_id  uuid;
    v_total     int;
    v_done      int;
BEGIN
    v_report_id := NEW.report_id;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'COMPLETED')
        INTO v_total, v_done
        FROM pms_evaluations
        WHERE report_id = v_report_id;

    IF v_total > 0 AND v_total = v_done THEN
        UPDATE pms_reports
            SET status = 'EMPOWERED_COMMITTEE_REVIEW', updated_at = now()
            WHERE id = v_report_id AND status = 'UNDER_EVALUATION_COMMITTEE_REVIEW'
            RETURNING cycle_id INTO v_cycle_id;

        INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (NEW.evaluator_id, 'AUTO_ADVANCE_EMPOWERED_COMMITTEE', 'pms_reports', v_report_id,
                jsonb_build_object('trigger', 'all_evaluations_complete'));

        -- Notify configured Empowered Committee members (fallback: role holders)
        INSERT INTO pms_notifications (user_id, type, title, body, report_id)
        SELECT user_id,
               'committee_review_needed',
               'Report ready for Empowered Committee decision',
               'The Evaluation Committee has completed its appraisal. Your final decision is needed.',
               v_report_id
          FROM pms_empowered_committee_members
         WHERE cycle_id = v_cycle_id;

        IF NOT EXISTS (SELECT 1 FROM pms_empowered_committee_members WHERE cycle_id = v_cycle_id) THEN
            INSERT INTO pms_notifications (user_id, type, title, body, report_id)
            SELECT ur.user_id, 'committee_review_needed',
                   'Report ready for Empowered Committee decision',
                   'The Evaluation Committee has completed its appraisal. Your final decision is needed.',
                   v_report_id
              FROM user_roles ur
             WHERE ur.role = 'EmpoweredCommittee';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Finalize with 0–100 integer score and 2026 mandatory-reason rules
DROP FUNCTION IF EXISTS pms_finalize_report(uuid, numeric, text);
CREATE OR REPLACE FUNCTION pms_finalize_report(
    p_report_id           uuid,
    p_final_score         integer,
    p_justification       text,
    p_reasons_outstanding text DEFAULT NULL,
    p_reasons_below       text DEFAULT NULL,
    p_suggestions         text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
    END IF;
    IF NOT (pms_is_admin()
            OR EXISTS (SELECT 1 FROM pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid())
            OR public.user_has_role('EmpoweredCommittee')) THEN
        RAISE EXCEPTION 'Only Empowered Committee members can finalize reports';
    END IF;
    IF EXISTS (SELECT 1 FROM pms_empowered_committee_members WHERE cycle_id = v_report.cycle_id)
       AND NOT pms_empowered_committee_valid(v_report.cycle_id) THEN
        RAISE EXCEPTION 'Empowered Committee configuration is invalid: needs 3, 5, or 7 members plus the Director/DG as Chairman';
    END IF;
    IF p_final_score IS NULL OR p_final_score < 0 OR p_final_score > 100 THEN
        RAISE EXCEPTION 'Final score must be an integer between 0 and 100';
    END IF;
    IF length(trim(p_justification)) < 50 THEN
        RAISE EXCEPTION 'Justification must be at least 50 characters';
    END IF;
    IF p_final_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
        RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
    END IF;
    IF p_final_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                 OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
        RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
    END IF;

    INSERT INTO pms_committee_decisions
        (report_id, decided_by, final_score, justification,
         reasons_for_outstanding, reasons_below_threshold, suggestions_for_improvement)
    VALUES
        (p_report_id, auth.uid(), p_final_score, p_justification,
         p_reasons_outstanding, p_reasons_below, p_suggestions)
    ON CONFLICT (report_id) DO UPDATE
        SET final_score                 = EXCLUDED.final_score,
            justification               = EXCLUDED.justification,
            reasons_for_outstanding     = EXCLUDED.reasons_for_outstanding,
            reasons_below_threshold     = EXCLUDED.reasons_below_threshold,
            suggestions_for_improvement = EXCLUDED.suggestions_for_improvement,
            decided_by                  = EXCLUDED.decided_by;

    UPDATE pms_reports
        SET status = 'FINALIZED', score_communicated_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('final_score', p_final_score));

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your appraisal report has been finalized',
            'The Empowered Committee has assigned your final score. You may submit a representation within 15 days.',
            p_report_id);
END;
$$;

-- 90-day rule: HR/admin records the appraisee's physical duty days for the
-- reporting year (manual entry — no attendance module exists)
CREATE OR REPLACE FUNCTION pms_set_duty_days(
    p_report_id uuid,
    p_duty_days integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can record duty days'; END IF;
    IF p_duty_days IS NULL OR p_duty_days < 0 THEN RAISE EXCEPTION 'Duty days must be zero or more'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status IN ('FINALIZED','NOT_ASSESSED') THEN
        RAISE EXCEPTION 'Report is already terminal';
    END IF;

    UPDATE pms_reports SET duty_days = p_duty_days, updated_at = now() WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'DUTY_DAYS_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('duty_days', p_duty_days));
END;
$$;

-- 90-day rule: admin bypasses appraisal with an auto system remark
CREATE OR REPLACE FUNCTION pms_mark_not_assessed(
    p_report_id uuid,
    p_remark    text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can mark reports not assessed'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status IN ('FINALIZED','NOT_ASSESSED') THEN
        RAISE EXCEPTION 'Report is already terminal';
    END IF;
    IF v_report.duty_days IS NULL OR v_report.duty_days >= 90 THEN
        RAISE EXCEPTION 'Report can only be marked NOT_ASSESSED when recorded duty days are below 90';
    END IF;

    UPDATE pms_reports
        SET status = 'NOT_ASSESSED',
            system_remark = coalesce(p_remark,
                'Not assessed: physical duty days (' || v_report.duty_days || ') below the 90-day minimum for the reporting year (2026 PMS guidelines).'),
            updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'MARKED_NOT_ASSESSED', 'pms_reports', p_report_id,
            jsonb_build_object('duty_days', v_report.duty_days));

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_not_assessed',
            'Your PMS report was not assessed',
            'Your report was excluded from appraisal because physical duty days were below the 90-day minimum.',
            p_report_id);
END;
$$;

-- Missed May 15: admin uploads non-submission certificate; report is flagged to
-- the Evaluation Committee (zero score option / rating on Reporting Officer inputs)
CREATE OR REPLACE FUNCTION pms_record_non_submission(
    p_report_id uuid,
    p_cert_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    IF NOT pms_is_admin() THEN RAISE EXCEPTION 'Only PMS administrators can record non-submission'; END IF;

    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'DRAFT' THEN RAISE EXCEPTION 'Report is not in DRAFT status'; END IF;
    IF now()::date <= pms_deadline(v_report.cycle_id, 'SELF_APPRAISAL') THEN
        RAISE EXCEPTION 'Non-submission can only be recorded after the May 15 deadline';
    END IF;

    UPDATE pms_reports
        SET status = 'SUBMITTED',
            submitted_at = now(),
            non_submission_certificate_path = p_cert_path,
            system_remark = 'Self-appraisal not submitted by May 15. Evaluation Committee may award a zero score or rate strictly on Reporting Officer inputs.',
            updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'NON_SUBMISSION_RECORDED', 'pms_reports', p_report_id,
            jsonb_build_object('certificate', p_cert_path));

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'non_submission_flagged',
            'Non-submission certificate recorded',
            'You missed the self-appraisal deadline. Your appraisal will proceed on Reporting Officer inputs or a zero score.',
            p_report_id);
END;
$$;

-- Representation: 15-day window after electronic score communication
CREATE OR REPLACE FUNCTION pms_submit_representation(
    p_report_id uuid,
    p_grounds   text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.scientist_id <> auth.uid() THEN RAISE EXCEPTION 'Not your report'; END IF;
    IF v_report.status <> 'FINALIZED' THEN RAISE EXCEPTION 'Report is not FINALIZED'; END IF;
    IF v_report.score_communicated_at IS NULL
       OR now() > v_report.score_communicated_at + interval '15 days' THEN
        RAISE EXCEPTION 'Representation window (15 days after score communication) has closed';
    END IF;
    IF (SELECT COUNT(*) FROM pms_grievance_members WHERE cycle_id = v_report.cycle_id) <> 5 THEN
        RAISE EXCEPTION 'Grievance Redressal Committee (5 members) is not configured for this cycle';
    END IF;

    INSERT INTO pms_representations (report_id, scientist_id, grounds)
    VALUES (p_report_id, auth.uid(), p_grounds);

    UPDATE pms_reports
        SET status = 'UNDER_GRIEVANCE_REVIEW', updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPRESENTATION_SUBMITTED', 'pms_reports', p_report_id, '{}');

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    SELECT user_id, 'representation_submitted',
           'A representation needs Grievance Committee review',
           'A scientist has submitted a representation against their finalized PMS score.',
           p_report_id
      FROM pms_grievance_members
     WHERE cycle_id = v_report.cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION pms_resolve_representation(
    p_report_id           uuid,
    p_resolution          text,
    p_revised_score       integer DEFAULT NULL,
    p_reasons_outstanding text DEFAULT NULL,
    p_reasons_below       text DEFAULT NULL,
    p_suggestions         text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_report pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
    IF v_report.status <> 'UNDER_GRIEVANCE_REVIEW' THEN
        RAISE EXCEPTION 'Report is not under grievance review';
    END IF;
    IF NOT (pms_is_admin() OR pms_is_grievance_member(v_report.cycle_id)) THEN
        RAISE EXCEPTION 'Only Grievance Committee members can resolve representations';
    END IF;
    IF length(trim(p_resolution)) < 20 THEN
        RAISE EXCEPTION 'Resolution must be at least 20 characters';
    END IF;

    IF p_revised_score IS NOT NULL THEN
        IF p_revised_score < 0 OR p_revised_score > 100 THEN
            RAISE EXCEPTION 'Revised score must be an integer between 0 and 100';
        END IF;
        IF p_revised_score >= 90 AND length(trim(coalesce(p_reasons_outstanding, ''))) = 0 THEN
            RAISE EXCEPTION 'Scores of 90 or above require reasons_for_outstanding';
        END IF;
        IF p_revised_score <= 75 AND (length(trim(coalesce(p_reasons_below, ''))) = 0
                                       OR length(trim(coalesce(p_suggestions, ''))) = 0) THEN
            RAISE EXCEPTION 'Scores of 75 or below require reasons_below_threshold and suggestions_for_improvement';
        END IF;

        UPDATE pms_committee_decisions
            SET final_score                 = p_revised_score,
                reasons_for_outstanding     = p_reasons_outstanding,
                reasons_below_threshold     = p_reasons_below,
                suggestions_for_improvement = p_suggestions
            WHERE report_id = p_report_id;
    END IF;

    UPDATE pms_representations
        SET status = 'RESOLVED', resolution = p_resolution,
            resolved_by = auth.uid(), resolved_at = now()
        WHERE report_id = p_report_id;

    UPDATE pms_reports
        SET status = 'FINALIZED', updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'REPRESENTATION_RESOLVED', 'pms_reports', p_report_id,
            jsonb_build_object('revised_score', p_revised_score));

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'representation_resolved',
            'Your representation has been resolved',
            'The Grievance Redressal Committee has resolved your representation.',
            p_report_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 11. ROW LEVEL SECURITY — new tables
-- ──────────────────────────────────────────────────────────────

ALTER TABLE pms_awp_activities               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_representations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_grievance_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_empowered_committee_members  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "awp_select" ON pms_awp_activities FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id
              AND (
                  r.scientist_id = auth.uid() OR pms_is_admin()
                  OR pms_is_evaluation_committee_member(r.cycle_id)
                  OR EXISTS (SELECT 1 FROM pms_evaluations e WHERE e.report_id = r.id AND e.evaluator_id = auth.uid())
              )
        )
    );

CREATE POLICY "awp_write_owner_draft" ON pms_awp_activities FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    );

-- Representations are written only via SECURITY DEFINER RPCs
CREATE POLICY "representations_select" ON pms_representations FOR SELECT TO authenticated
    USING (
        scientist_id = auth.uid()
        OR pms_is_admin()
        OR EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND pms_is_grievance_member(r.cycle_id)
        )
    );

CREATE POLICY "grievance_members_select" ON pms_grievance_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "grievance_members_write"  ON pms_grievance_members FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());

CREATE POLICY "empowered_members_select" ON pms_empowered_committee_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "empowered_members_write"  ON pms_empowered_committee_members FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());
