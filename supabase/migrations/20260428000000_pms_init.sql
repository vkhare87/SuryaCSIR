-- PMS Phase A + C tables, RLS, triggers, functions

-- ──────────────────────────────────────────────────────────────────
-- 1. APPRAISAL CYCLES
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'OPEN'
              CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 2. PMS REPORTS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
  scientist_id  uuid NOT NULL,   -- FK → auth.users (Supabase Auth uid)
  status        text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN (
                  'DRAFT','SUBMITTED','UNDER_COLLEGIUM_REVIEW',
                  'CHAIRMAN_REVIEW','EMPOWERED_COMMITTEE_REVIEW','FINALIZED'
                )),
  period_from   date,
  period_to     date,
  self_score    numeric(3,2) CHECK (self_score BETWEEN 0.5 AND 1.1),
  submitted_at  timestamptz,
  signature_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, scientist_id)
);

-- ──────────────────────────────────────────────────────────────────
-- 3. PMS REPORT SECTIONS  (JSONB per section key)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_report_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE,
  section_key  text NOT NULL,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, section_key)
);

-- ──────────────────────────────────────────────────────────────────
-- 4. PMS ANNEXURES
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_annexures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_path   text NOT NULL,
  file_size   bigint NOT NULL,
  mime_type   text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 5. COLLEGIUMS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_collegiums (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  cycle_id    uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, cycle_id)
);

-- ──────────────────────────────────────────────────────────────────
-- 6. COLLEGIUM MEMBERS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_collegium_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collegium_id  uuid NOT NULL REFERENCES pms_collegiums(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  role          text NOT NULL CHECK (role IN ('CHAIRMAN','MEMBER')),
  UNIQUE (collegium_id, user_id)
);

-- ──────────────────────────────────────────────────────────────────
-- 7. PMS EVALUATIONS  (Phase C — tables exist from day one for RLS)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_evaluations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT,
  evaluator_id  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED')),
  scores        jsonb NOT NULL DEFAULT '{}',
  comments      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, evaluator_id)
);

-- ──────────────────────────────────────────────────────────────────
-- 8. PMS CHAIRMAN REVIEWS  (Phase C)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_chairman_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT UNIQUE,
  chairman_id       uuid NOT NULL,
  recommended_min   numeric(3,2) CHECK (recommended_min BETWEEN 0.5 AND 1.1),
  recommended_max   numeric(3,2) CHECK (recommended_max BETWEEN 0.5 AND 1.1),
  comments          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_range CHECK (recommended_min <= recommended_max)
);

-- ──────────────────────────────────────────────────────────────────
-- 9. PMS COMMITTEE DECISIONS  (Phase C)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_committee_decisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT UNIQUE,
  decided_by     uuid NOT NULL,
  final_score    numeric(3,2) CHECK (final_score BETWEEN 0.5 AND 1.1),
  justification  text NOT NULL CHECK (length(trim(justification)) >= 50),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 10. PMS AUDIT LOGS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pms_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_pms_reports_updated_at
  BEFORE UPDATE ON pms_reports
  FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

CREATE TRIGGER trg_pms_report_sections_updated_at
  BEFORE UPDATE ON pms_report_sections
  FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

CREATE TRIGGER trg_pms_evaluations_updated_at
  BEFORE UPDATE ON pms_evaluations
  FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- Auto-advance trigger: all evaluations COMPLETED → CHAIRMAN_REVIEW
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
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pms_evaluation_complete
  AFTER UPDATE OF status ON pms_evaluations
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED')
  EXECUTE FUNCTION pms_check_evaluation_complete();

-- ──────────────────────────────────────────────────────────────────
-- FUNCTION: pms_submit_report(report_id)
-- Atomic: validates ownership + DRAFT + cycle OPEN, transitions to SUBMITTED
-- ──────────────────────────────────────────────────────────────────
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

  UPDATE pms_reports
     SET status = 'SUBMITTED', submitted_at = now(), updated_at = now()
   WHERE id = p_report_id;

  INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'SUBMIT', 'pms_reports', p_report_id, '{}');
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- FUNCTION: pms_assign_evaluators(report_id, user_ids[])  (Phase C)
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
-- RLS POLICIES
-- ──────────────────────────────────────────────────────────────────

-- Helper: is current user an admin?
CREATE OR REPLACE FUNCTION pms_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
     WHERE user_id = auth.uid()
       AND role IN ('HRAdmin','SystemAdmin','MasterAdmin')
  );
$$;

-- Helper: is current user involved in collegium for given cycle?
CREATE OR REPLACE FUNCTION pms_is_collegium_member(p_cycle_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM pms_collegium_members pcm
      JOIN pms_collegiums pc ON pc.id = pcm.collegium_id
     WHERE pc.cycle_id = p_cycle_id
       AND pcm.user_id = auth.uid()
  );
$$;

ALTER TABLE appraisal_cycles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_report_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_annexures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_collegiums     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_collegium_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_evaluations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_chairman_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_committee_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_audit_logs     ENABLE ROW LEVEL SECURITY;

-- appraisal_cycles: all authenticated can read, admins can write
CREATE POLICY "cycles_select" ON appraisal_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_insert" ON appraisal_cycles FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "cycles_update" ON appraisal_cycles FOR UPDATE TO authenticated USING (pms_is_admin());
CREATE POLICY "cycles_delete" ON appraisal_cycles FOR DELETE TO authenticated USING (pms_is_admin());

-- pms_reports: owner, admins, assigned evaluators, chairman/committee
CREATE POLICY "reports_select" ON pms_reports FOR SELECT TO authenticated
  USING (
    scientist_id = auth.uid()
    OR pms_is_admin()
    OR pms_is_collegium_member(cycle_id)
    OR EXISTS (SELECT 1 FROM pms_evaluations WHERE report_id = pms_reports.id AND evaluator_id = auth.uid())
  );
CREATE POLICY "reports_insert" ON pms_reports FOR INSERT TO authenticated
  WITH CHECK (
    scientist_id = auth.uid()
    AND EXISTS (SELECT 1 FROM appraisal_cycles WHERE id = cycle_id AND status = 'OPEN')
  );
CREATE POLICY "reports_update" ON pms_reports FOR UPDATE TO authenticated
  USING (scientist_id = auth.uid() AND status = 'DRAFT')
  WITH CHECK (scientist_id = auth.uid());

-- pms_report_sections: same access as parent report
CREATE POLICY "sections_select" ON pms_report_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND (
           r.scientist_id = auth.uid()
           OR pms_is_admin()
           OR pms_is_collegium_member(r.cycle_id)
           OR EXISTS (SELECT 1 FROM pms_evaluations e WHERE e.report_id = r.id AND e.evaluator_id = auth.uid())
         )
    )
  );
CREATE POLICY "sections_insert" ON pms_report_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND r.scientist_id = auth.uid()
         AND r.status = 'DRAFT'
    )
  );
CREATE POLICY "sections_update" ON pms_report_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND r.scientist_id = auth.uid()
         AND r.status = 'DRAFT'
    )
  );

-- pms_annexures: same rules + DELETE only when DRAFT
CREATE POLICY "annexures_select" ON pms_annexures FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND (r.scientist_id = auth.uid() OR pms_is_admin())
    )
  );
CREATE POLICY "annexures_insert" ON pms_annexures FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND r.scientist_id = auth.uid()
         AND r.status = 'DRAFT'
    )
  );
CREATE POLICY "annexures_delete" ON pms_annexures FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pms_reports r
       WHERE r.id = report_id
         AND r.scientist_id = auth.uid()
         AND r.status = 'DRAFT'
    )
  );

-- pms_collegiums: admins write, involved users read
CREATE POLICY "collegiums_select" ON pms_collegiums FOR SELECT TO authenticated USING (true);
CREATE POLICY "collegiums_write"  ON pms_collegiums FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());

-- pms_collegium_members: admins write, all authenticated read
CREATE POLICY "collegium_members_select" ON pms_collegium_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "collegium_members_write"  ON pms_collegium_members FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());

-- pms_evaluations: evaluator reads own, admins read all
CREATE POLICY "evaluations_select" ON pms_evaluations FOR SELECT TO authenticated
  USING (evaluator_id = auth.uid() OR pms_is_admin());

-- pms_chairman_reviews / committee_decisions: admins + involved
CREATE POLICY "chairman_reviews_select" ON pms_chairman_reviews FOR SELECT TO authenticated
  USING (chairman_id = auth.uid() OR pms_is_admin());
CREATE POLICY "committee_decisions_select" ON pms_committee_decisions FOR SELECT TO authenticated
  USING (decided_by = auth.uid() OR pms_is_admin());

-- pms_audit_logs: admins only
CREATE POLICY "audit_logs_select" ON pms_audit_logs FOR SELECT TO authenticated USING (pms_is_admin());
