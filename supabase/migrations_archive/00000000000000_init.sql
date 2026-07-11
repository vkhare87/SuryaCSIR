-- =============================================================
-- SURYA — Consolidated Init Migration
-- CSIR-AMPRI Management Dashboard
-- =============================================================
-- Apply: paste into Supabase SQL Editor as postgres role, OR
--        run: supabase db reset (drops and recreates from scratch)
-- After this file, run: supabase/seed.sql to create the first admin.
-- =============================================================
-- NEVER edit this file after first deploy.
-- New changes → new timestamped file in supabase/migrations/.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────
-- 1. AUTH / RBAC
-- ──────────────────────────────────────────────────────────────

-- user_roles: composite PK supports multi-role per user
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role                 text NOT NULL CHECK (role IN (
                             'Director', 'DivisionHead', 'Scientist', 'Technician',
                             'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
                             'DefaultUser', 'HOD', 'Student', 'ProjectStaff', 'Guest',
                             'EmpoweredCommittee'
                         )),
    division_code        text NULL,
    must_change_password boolean NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_roles_division_code_idx
    ON public.user_roles(division_code);

-- user_profiles: per-user settings, active role, flags
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                text NULL,
    must_change_password boolean NOT NULL DEFAULT true,
    active_role          text NULL,
    last_seen_at         timestamptz NULL
);

-- ──────────────────────────────────────────────────────────────
-- 2. HR ANALYTICS
-- ──────────────────────────────────────────────────────────────
-- Column names are quoted CamelCase to mirror the source Excel
-- headers. Do not rename without a coordinated DB migration +
-- code change (dataMapper.ts, dataMigration.ts, types/index.ts).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.divisions (
    "divCode"                text PRIMARY KEY,
    "divName"                text,
    "divDescription"         text,
    "divResearchAreas"       text,
    "divHoD"                 text,
    "divHoDID"               text,   -- references staff."ID"
    "divSanctionedstrength"  integer,
    "divCurrentStrength"     integer,
    "divStatus"              text
);

CREATE TABLE IF NOT EXISTS public.staff (
    "ID"                   text PRIMARY KEY,
    "LabCode"              text,
    "EmployeeType"         text,
    "Name"                 text,
    "Designation"          text,
    "Group"                text,
    "Division"             text,   -- references divisions."divCode"
    "DoAPP"                text,
    "DOJ"                  text,
    "DOB"                  text,
    "Cat"                  text,
    "AppointmentType"      text,
    "Level"                text,
    "CoreArea"             text,
    "Expertise"            text,
    "Email"                text,
    "Ext"                  text,
    "VidwanID"             text,
    "ReportingID"          text,   -- references staff."ID"
    "HighestQualification" text,
    "Gender"               text
);

CREATE TABLE IF NOT EXISTS public.projects (
    "ProjectID"            text PRIMARY KEY,
    "ProjectNo"            text,
    "ProjectName"          text,
    "FundType"             text,
    "SponsorerType"        text,
    "SponsorerName"        text,
    "ProjectCategory"      text,
    "ProjectStatus"        text,
    "StartDate"            text,
    "CompletioDate"        text,   -- typo is intentional (matches Excel source)
    "SanctionedCost"       text,
    "UtilizedAmount"       text,
    "PrincipalInvestigator" text,
    "DivisionCode"         text,
    "Extension"            text,
    "ApprovalAuthority"    text
);

CREATE TABLE IF NOT EXISTS public.phd_students (
    "EnrollmentNo"       text PRIMARY KEY,
    "StudentName"        text,
    "Specialization"     text,
    "SupervisorName"     text,
    "CoSupervisorName"   text,
    "FellowshipDetails"  text,
    "CurrentStatus"      text,
    "ThesisTitle"        text,
    "ProjectNo"          text,   -- references projects."ProjectNo"
    "DivisionCode"       text
);

CREATE TABLE IF NOT EXISTS public.equipment (
    "UInsID"                   text PRIMARY KEY,
    "Name"                     text,
    "EndUse"                   text,
    "Division"                 text,   -- references divisions."divCode"
    "IndenterName"             text,
    "OperatorName"             text,
    "Location"                 text,
    "WorkingStatus"            text,
    "Movable"                  text,
    "RequirementInstallation"  text,
    "Justification"            text,
    "Remark"                   text
);

CREATE TABLE IF NOT EXISTS public.project_staff (
    "id"                    text PRIMARY KEY,
    "StaffName"             text,
    "Designation"           text,
    "RecruitmentCycle"      text,
    "DateOfJoining"         text,
    "DateOfProjectDuration" text,
    "ProjectNo"             text,   -- references projects."ProjectNo"
    "PIName"                text,
    "DivisionCode"          text
);

CREATE TABLE IF NOT EXISTS public.contract_staff (
    "id"                 text PRIMARY KEY,
    "Name"               text,
    "Designation"        text,
    "Division"           text,
    "DateOfJoining"      text,
    "ContractEndDate"    text,
    "LabCode"            text,
    "DateOfBirth"        text,
    "AttachedToStaffID"  text    -- references staff."ID"
);

CREATE TABLE IF NOT EXISTS public.scientific_outputs (
    id             text PRIMARY KEY,
    title          text NOT NULL,
    authors        text[] NOT NULL DEFAULT '{}',
    journal        text NOT NULL,
    year           integer NOT NULL,
    doi            text NULL,
    impact_factor  float NULL,
    citation_count integer NULL,
    division_code  text NOT NULL   -- references divisions."divCode"
);

CREATE TABLE IF NOT EXISTS public.ip_intelligence (
    id            text PRIMARY KEY,
    title         text NOT NULL,
    type          text NOT NULL CHECK (type IN ('Patent','Copyright','Design','Trademark')),
    status        text NOT NULL CHECK (status IN ('Filed','Published','Granted')),
    filing_date   text NOT NULL,
    grant_date    text NULL,
    inventors     text[] NOT NULL DEFAULT '{}',
    division_code text NOT NULL
);

-- ──────────────────────────────────────────────────────────────
-- 3. PMS (Performance Management System)
-- All snake_case; UUID PKs; state machine enforced via RPCs
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appraisal_cycles (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    start_date date NOT NULL,
    end_date   date NOT NULL,
    status     text NOT NULL DEFAULT 'OPEN'
               CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_reports (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id      uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
    scientist_id  uuid NOT NULL,   -- FK → auth.users
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

CREATE TABLE IF NOT EXISTS pms_report_sections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id   uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE,
    section_key text NOT NULL,
    data        jsonb NOT NULL DEFAULT '{}',
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (report_id, section_key)
);

CREATE TABLE IF NOT EXISTS pms_annexures (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id   uuid NOT NULL REFERENCES pms_reports(id) ON DELETE CASCADE,
    file_name   text NOT NULL,
    file_path   text NOT NULL,
    file_size   bigint NOT NULL,
    mime_type   text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_collegiums (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    cycle_id    uuid NOT NULL REFERENCES appraisal_cycles(id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, cycle_id)
);

CREATE TABLE IF NOT EXISTS pms_collegium_members (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collegium_id uuid NOT NULL REFERENCES pms_collegiums(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL,
    role         text NOT NULL CHECK (role IN ('CHAIRMAN','MEMBER')),
    UNIQUE (collegium_id, user_id)
);

CREATE TABLE IF NOT EXISTS pms_evaluations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id    uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT,
    evaluator_id uuid NOT NULL,
    status       text NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED')),
    scores       jsonb NOT NULL DEFAULT '{}',
    comments     text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (report_id, evaluator_id)
);

CREATE TABLE IF NOT EXISTS pms_chairman_reviews (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT UNIQUE,
    chairman_id     uuid NOT NULL,
    recommended_min numeric(3,2) CHECK (recommended_min BETWEEN 0.5 AND 1.1),
    recommended_max numeric(3,2) CHECK (recommended_max BETWEEN 0.5 AND 1.1),
    comments        text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_range CHECK (recommended_min <= recommended_max)
);

CREATE TABLE IF NOT EXISTS pms_committee_decisions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     uuid NOT NULL REFERENCES pms_reports(id) ON DELETE RESTRICT UNIQUE,
    decided_by    uuid NOT NULL,
    final_score   numeric(3,2) CHECK (final_score BETWEEN 0.5 AND 1.1),
    justification text NOT NULL CHECK (length(trim(justification)) >= 50),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_audit_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    action      text NOT NULL,
    entity_type text NOT NULL,
    entity_id   uuid NOT NULL,
    details     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL,
    type       text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL,
    report_id  uuid REFERENCES pms_reports(id) ON DELETE CASCADE,
    read       boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS user_roles_division_code_idx
    ON public.user_roles(division_code);

CREATE INDEX IF NOT EXISTS pms_reports_cycle_id_idx
    ON pms_reports(cycle_id);

CREATE INDEX IF NOT EXISTS pms_reports_scientist_id_idx
    ON pms_reports(scientist_id);

CREATE INDEX IF NOT EXISTS pms_evaluations_report_id_idx
    ON pms_evaluations(report_id);

CREATE INDEX IF NOT EXISTS pms_notifications_user_id_idx
    ON pms_notifications(user_id);

CREATE INDEX IF NOT EXISTS pms_audit_logs_entity_idx
    ON pms_audit_logs(entity_type, entity_id);

-- ──────────────────────────────────────────────────────────────
-- 5. TRIGGERS
-- ──────────────────────────────────────────────────────────────

-- updated_at maintenance
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

-- Auto-register new Supabase Auth users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role, must_change_password)
    VALUES (NEW.id, 'DefaultUser', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_profiles (user_id, email, must_change_password)
    VALUES (NEW.id, NEW.email, true)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Auto-advance pms_reports to CHAIRMAN_REVIEW when all evaluations complete
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

        -- Notify CHAIRMANs for this cycle
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

CREATE TRIGGER trg_pms_evaluation_complete
    AFTER UPDATE OF status ON pms_evaluations
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED')
    EXECUTE FUNCTION pms_check_evaluation_complete();

-- ──────────────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_has_role(check_role text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = check_role
    )
$$;

CREATE OR REPLACE FUNCTION pms_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
          AND role IN ('HRAdmin','SystemAdmin','MasterAdmin')
    );
$$;

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

-- ──────────────────────────────────────────────────────────────
-- 7. PMS RPCs (state-machine transitions — never patch status directly)
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

    UPDATE pms_reports
        SET status = 'SUBMITTED', submitted_at = now(), updated_at = now()
        WHERE id = p_report_id;

    INSERT INTO pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SUBMIT', 'pms_reports', p_report_id, '{}');
END;
$$;

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

CREATE OR REPLACE FUNCTION pms_save_chairman_review(
    p_report_id uuid,
    p_min       numeric,
    p_max       numeric,
    p_comments  text DEFAULT NULL
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

    -- Notify EmpoweredCommittee members
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
        SET final_score   = EXCLUDED.final_score,
            justification = EXCLUDED.justification,
            decided_by    = EXCLUDED.decided_by;

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

-- ──────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phd_students       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_staff     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scientific_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_intelligence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_cycles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_report_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_annexures             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_collegiums            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_collegium_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_evaluations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_chairman_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_committee_decisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pms_notifications         ENABLE ROW LEVEL SECURITY;

-- ── user_roles ──
CREATE POLICY "user_roles_select_own"
    ON public.user_roles FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY "user_roles_select_admin"
    ON public.user_roles FOR SELECT TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "user_roles_insert_admin"
    ON public.user_roles FOR INSERT TO authenticated
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_update_admin"
    ON public.user_roles FOR UPDATE TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_delete_admin"
    ON public.user_roles FOR DELETE TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_roles_update_own_last_seen"
    ON public.user_roles FOR UPDATE TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

-- ── user_profiles ──
CREATE POLICY "user_profiles_select_own"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_profiles_update_own"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_select_admin"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "user_profiles_manage_admin"
    ON public.user_profiles FOR ALL TO authenticated
    USING (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('MasterAdmin') OR public.user_has_role('SystemAdmin'));

-- ── HR tables — read: all authenticated; write: HRAdmin + SystemAdmin ──
CREATE POLICY "divisions_select"         ON public.divisions         FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_select"             ON public.staff             FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_select"          ON public.projects          FOR SELECT TO authenticated USING (true);
CREATE POLICY "phd_students_select"      ON public.phd_students      FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipment_select"         ON public.equipment         FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_staff_select"     ON public.project_staff     FOR SELECT TO authenticated USING (true);
CREATE POLICY "contract_staff_select"    ON public.contract_staff    FOR SELECT TO authenticated USING (true);
CREATE POLICY "scientific_outputs_select" ON public.scientific_outputs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_intelligence_select"   ON public.ip_intelligence   FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff_write"
    ON public.staff FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "hr_data_write"
    ON public.divisions FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "contract_staff_write"
    ON public.contract_staff FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "scientific_outputs_write"
    ON public.scientific_outputs FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'));

CREATE POLICY "ip_intelligence_write"
    ON public.ip_intelligence FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin'));

-- ── PMS tables ──
CREATE POLICY "cycles_select" ON appraisal_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_insert" ON appraisal_cycles FOR INSERT TO authenticated WITH CHECK (pms_is_admin());
CREATE POLICY "cycles_update" ON appraisal_cycles FOR UPDATE TO authenticated USING (pms_is_admin());
CREATE POLICY "cycles_delete" ON appraisal_cycles FOR DELETE TO authenticated USING (pms_is_admin());

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

CREATE POLICY "sections_select" ON pms_report_sections FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id
              AND (
                  r.scientist_id = auth.uid() OR pms_is_admin()
                  OR pms_is_collegium_member(r.cycle_id)
                  OR EXISTS (SELECT 1 FROM pms_evaluations e WHERE e.report_id = r.id AND e.evaluator_id = auth.uid())
              )
        )
    );

CREATE POLICY "sections_insert" ON pms_report_sections FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    );

CREATE POLICY "sections_update" ON pms_report_sections FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    );

CREATE POLICY "annexures_select" ON pms_annexures FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND (r.scientist_id = auth.uid() OR pms_is_admin())
        )
    );

CREATE POLICY "annexures_insert" ON pms_annexures FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    );

CREATE POLICY "annexures_delete" ON pms_annexures FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pms_reports r
            WHERE r.id = report_id AND r.scientist_id = auth.uid() AND r.status = 'DRAFT'
        )
    );

CREATE POLICY "collegiums_select" ON pms_collegiums FOR SELECT TO authenticated USING (true);
CREATE POLICY "collegiums_write"  ON pms_collegiums FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());

CREATE POLICY "collegium_members_select" ON pms_collegium_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "collegium_members_write"  ON pms_collegium_members FOR ALL   TO authenticated USING (pms_is_admin()) WITH CHECK (pms_is_admin());

CREATE POLICY "evaluations_select" ON pms_evaluations FOR SELECT TO authenticated
    USING (evaluator_id = auth.uid() OR pms_is_admin());

CREATE POLICY "evaluations_update" ON pms_evaluations FOR UPDATE TO authenticated
    USING (evaluator_id = auth.uid());

CREATE POLICY "chairman_reviews_select" ON pms_chairman_reviews FOR SELECT TO authenticated
    USING (chairman_id = auth.uid() OR pms_is_admin());

CREATE POLICY "committee_decisions_select" ON pms_committee_decisions FOR SELECT TO authenticated
    USING (decided_by = auth.uid() OR pms_is_admin());

CREATE POLICY "audit_logs_select" ON pms_audit_logs FOR SELECT TO authenticated
    USING (pms_is_admin());

CREATE POLICY "notifications_select" ON pms_notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR pms_is_admin());

CREATE POLICY "notifications_update" ON pms_notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
