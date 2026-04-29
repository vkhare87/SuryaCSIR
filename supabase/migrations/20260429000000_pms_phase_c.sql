-- Phase C: notifications table, missing RLS, chairman & committee RPCs

-- ──────────────────────────────────────────────────────────────────
-- 1. PMS NOTIFICATIONS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  report_id   uuid REFERENCES pms_reports(id) ON DELETE CASCADE,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pms_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select" ON pms_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR pms_is_admin());
CREATE POLICY "notifications_update" ON pms_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
-- INSERT is SECURITY DEFINER only (via RPCs below)

-- ──────────────────────────────────────────────────────────────────
-- 2. MISSING RLS: pms_evaluations UPDATE (evaluator updates own scores)
-- ──────────────────────────────────────────────────────────────────
CREATE POLICY "evaluations_update" ON pms_evaluations FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 3. FUNCTION: pms_save_chairman_review
-- Validates CHAIRMAN_REVIEW status, inserts review, advances to
-- EMPOWERED_COMMITTEE_REVIEW, notifies committee members
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pms_save_chairman_review(
  p_report_id      uuid,
  p_min            numeric,
  p_max            numeric,
  p_comments       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report pms_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status <> 'CHAIRMAN_REVIEW' THEN
    RAISE EXCEPTION 'Report is not in CHAIRMAN_REVIEW status';
  END IF;

  INSERT INTO pms_chairman_reviews (report_id, chairman_id, recommended_min, recommended_max, comments)
  VALUES (p_report_id, auth.uid(), p_min, p_max, p_comments)
  ON CONFLICT (report_id) DO UPDATE
    SET recommended_min = EXCLUDED.recommended_min,
        recommended_max = EXCLUDED.recommended_max,
        comments        = EXCLUDED.comments;

  UPDATE pms_reports
     SET status = 'EMPOWERED_COMMITTEE_REVIEW', updated_at = now()
   WHERE id = p_report_id;

  INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'CHAIRMAN_REVIEW_SUBMITTED', 'pms_reports', p_report_id,
          jsonb_build_object('min', p_min, 'max', p_max));

  -- Notify all EmpoweredCommittee members (via user_roles table)
  INSERT INTO pms_notifications (user_id, type, title, body, report_id)
  SELECT ur.user_id,
         'committee_review_needed',
         'Report ready for committee decision',
         'A report has been reviewed by the chairman and needs your final decision.',
         p_report_id
    FROM user_roles ur
   WHERE ur.role = 'EmpoweredCommittee';
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. FUNCTION: pms_finalize_report
-- Validates EMPOWERED_COMMITTEE_REVIEW status, inserts decision,
-- advances to FINALIZED, notifies scientist
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pms_finalize_report(
  p_report_id     uuid,
  p_final_score   numeric,
  p_justification text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report pms_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status <> 'EMPOWERED_COMMITTEE_REVIEW' THEN
    RAISE EXCEPTION 'Report is not in EMPOWERED_COMMITTEE_REVIEW status';
  END IF;
  IF length(trim(p_justification)) < 50 THEN
    RAISE EXCEPTION 'Justification must be at least 50 characters';
  END IF;

  INSERT INTO pms_committee_decisions (report_id, decided_by, final_score, justification)
  VALUES (p_report_id, auth.uid(), p_final_score, p_justification)
  ON CONFLICT (report_id) DO UPDATE
    SET final_score    = EXCLUDED.final_score,
        justification  = EXCLUDED.justification,
        decided_by     = EXCLUDED.decided_by;

  UPDATE pms_reports
     SET status = 'FINALIZED', updated_at = now()
   WHERE id = p_report_id;

  INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'REPORT_FINALIZED', 'pms_reports', p_report_id,
          jsonb_build_object('final_score', p_final_score));

  -- Notify scientist
  INSERT INTO pms_notifications (user_id, type, title, body, report_id)
  VALUES (v_report.scientist_id, 'report_finalized',
          'Your appraisal report has been finalized',
          'The Empowered Committee has reviewed your report and assigned a final score.',
          p_report_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 5. Replace pms_assign_evaluators to also send notifications
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pms_assign_evaluators(
  p_report_id uuid,
  p_user_ids  uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report pms_reports%ROWTYPE;
  v_uid    uuid;
BEGIN
  SELECT * INTO v_report FROM pms_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'Report must be SUBMITTED before assigning evaluators';
  END IF;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    INSERT INTO pms_evaluations (report_id, evaluator_id)
    VALUES (p_report_id, v_uid)
    ON CONFLICT (report_id, evaluator_id) DO NOTHING;

    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_uid, 'assigned_evaluator',
            'You have been assigned to evaluate a report',
            'A scientist''s appraisal report has been assigned to you for evaluation.',
            p_report_id);
  END LOOP;

  UPDATE pms_reports
     SET status = 'UNDER_COLLEGIUM_REVIEW', updated_at = now()
   WHERE id = p_report_id AND status = 'SUBMITTED';

  INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'ASSIGN_EVALUATORS', 'pms_reports', p_report_id,
          jsonb_build_object('count', array_length(p_user_ids, 1)));
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 6. Replace auto-advance trigger to also notify chairman
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pms_check_evaluation_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report_id uuid;
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
       SET status = 'CHAIRMAN_REVIEW', updated_at = now()
     WHERE id = v_report_id AND status = 'UNDER_COLLEGIUM_REVIEW';

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.evaluator_id, 'AUTO_ADVANCE_CHAIRMAN_REVIEW', 'pms_reports', v_report_id,
            jsonb_build_object('trigger', 'all_evaluations_complete'));

    -- Notify CHAIRMAN members of the collegium for this cycle
    INSERT INTO pms_notifications (user_id, type, title, body, report_id)
    SELECT pcm.user_id,
           'chairman_review_needed',
           'Report ready for chairman review',
           'All evaluators have completed their scores. Your score range recommendation is needed.',
           v_report_id
      FROM pms_reports pr
      JOIN pms_collegiums pc ON pc.cycle_id = pr.cycle_id
      JOIN pms_collegium_members pcm ON pcm.collegium_id = pc.id AND pcm.role = 'CHAIRMAN'
     WHERE pr.id = v_report_id;
  END IF;
  RETURN NEW;
END;
$$;
