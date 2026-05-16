-- ════════════════════════════════════════════════════════════════════
-- SURYA — Full Schema Bundle for Fresh Supabase Project
-- ════════════════════════════════════════════════════════════════════
-- Apply order: paste this entire file into Supabase Studio SQL Editor
-- as the 'postgres' role (bypasses RLS during DDL). Do not split.
-- ════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/00000000000000_init.sql
-- ════════════════════════════════════════════════════════════════════
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

-- END: supabase/migrations/00000000000000_init.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260501000000_vacancy_tables.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: vacancy_advertisements + vacancy_posts
-- Two tables for recruitment vacancy management.

-- ──────────────────────────────────────────────────────────────
-- 1. TABLES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vacancy_advertisements (
    id              text PRIMARY KEY,
    title           text NOT NULL,
    position        text NOT NULL,
    group_level     text,
    division_code   text REFERENCES public.divisions("divCode"),
    status          text NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Published','Closed','Cancelled')),
    description     text,
    requirements    text,
    applicant_count integer DEFAULT 0,
    published_at    timestamptz,
    closing_date    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vacancy_posts (
    id               text PRIMARY KEY,
    vacancy_id       text NOT NULL REFERENCES public.vacancy_advertisements(id) ON DELETE CASCADE,
    post_name        text NOT NULL,
    reservations     jsonb DEFAULT '{}',
    sanctioned_count integer DEFAULT 1,
    filled_count     integer DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vacancy_advertisements_status_idx
    ON public.vacancy_advertisements(status);

CREATE INDEX IF NOT EXISTS vacancy_posts_vacancy_id_idx
    ON public.vacancy_posts(vacancy_id);

-- ──────────────────────────────────────────────────────────────
-- 3. TRIGGERS
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_vacancy_advertisements_updated_at
    BEFORE UPDATE ON public.vacancy_advertisements
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.vacancy_advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_posts          ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read
CREATE POLICY "vacancy_advertisements_select"
    ON public.vacancy_advertisements FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "vacancy_posts_select"
    ON public.vacancy_posts FOR SELECT TO authenticated
    USING (true);

-- WRITE: HRAdmin, SystemAdmin, MasterAdmin
CREATE POLICY "vacancy_advertisements_write"
    ON public.vacancy_advertisements FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "vacancy_posts_write"
    ON public.vacancy_posts FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- END: supabase/migrations/20260501000000_vacancy_tables.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260502000000_instruments_extension.sql
-- ════════════════════════════════════════════════════════════════════
-- =============================================================
-- SURYA — Instruments Extension
-- Adds: labs table, 9 new columns on equipment, RLS, indexes
-- =============================================================

-- 1. Labs table
CREATE TABLE IF NOT EXISTS public.labs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_code   text UNIQUE NOT NULL,
  lab_name   text NOT NULL,
  div_code   text REFERENCES public."DivisionInfo"("divCode"),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

CREATE POLICY labs_read_authenticated ON public.labs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY labs_admin_write ON public.labs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

-- 2. Extend equipment with 9 new columns
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS instrument_code     text,
  ADD COLUMN IF NOT EXISTS serial_number       text,
  ADD COLUMN IF NOT EXISTS manufacturer        text,
  ADD COLUMN IF NOT EXISTS year_of_manufacture integer,
  ADD COLUMN IF NOT EXISTS lab_id              uuid REFERENCES public.labs(id),
  ADD COLUMN IF NOT EXISTS owner_user_id       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS amc_end_date        date,
  ADD COLUMN IF NOT EXISTS purchase_cost       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS procurement_date    date;

-- 3. RLS write policy for admin add/edit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'equipment' AND policyname = 'equipment_admin_write'
  ) THEN
    CREATE POLICY equipment_admin_write ON public.equipment
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid()
            AND role IN ('SystemAdmin', 'MasterAdmin', 'HRAdmin')
        )
      );
  END IF;
END$$;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS equipment_owner_idx ON public.equipment(owner_user_id);
CREATE INDEX IF NOT EXISTS equipment_lab_idx   ON public.equipment(lab_id);
CREATE INDEX IF NOT EXISTS equipment_amc_idx   ON public.equipment(amc_end_date);

-- END: supabase/migrations/20260502000000_instruments_extension.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260504000000_irins_sync.sql
-- ════════════════════════════════════════════════════════════════════
-- =============================================================
-- SURYA — IRINS Data Sync
-- Tables for storing scraped IRINS scientist profiles + sync log
-- =============================================================

-- 1. IRINS scientist profiles (JSONB for flexible schema)
CREATE TABLE IF NOT EXISTS public.irins_profiles (
  vidwan_id   text PRIMARY KEY,
  profile_data jsonb NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.irins_profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (used by profile pages)
CREATE POLICY irins_profiles_read_authenticated ON public.irins_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can write (manual updates from sync page)
CREATE POLICY irins_profiles_admin_write ON public.irins_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

-- Service role write policy (for sync script running with service key)
CREATE POLICY irins_profiles_service_write ON public.irins_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Sync execution log
CREATE TABLE IF NOT EXISTS public.irins_sync_log (
  id               bigserial PRIMARY KEY,
  triggered_by     text NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  total_scientists int NOT NULL DEFAULT 0,
  succeeded        int NOT NULL DEFAULT 0,
  failed           int NOT NULL DEFAULT 0,
  error_details    jsonb
);

ALTER TABLE public.irins_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY irins_sync_log_read_authenticated ON public.irins_sync_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY irins_sync_log_admin_write ON public.irins_sync_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

CREATE POLICY irins_sync_log_service_write ON public.irins_sync_log
  FOR ALL USING (auth.role() = 'service_role');

-- Index for listing recent syncs
CREATE INDEX IF NOT EXISTS irins_sync_log_started_idx ON public.irins_sync_log(started_at DESC);

-- END: supabase/migrations/20260504000000_irins_sync.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260507000000_committees_helpdesk.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: committees + helpdesk + audit_log + helpdesk_routing
-- 11 tables with RLS, 3 RPCs, 1 storage bucket for meeting documents.
-- Decision D-01: Shallow RLS. SELECT = all authenticated. ALL = admin roles.
-- Decision D-02: No RPC write gates for committee tables.
-- Decision D-03: No minutes lock (RLS or app-level).
-- Decision D-06/D-07/D-08: route_ticket() with per-category config, fallback chain.

-- ══════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.committees (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    committee_type  text NOT NULL CHECK (committee_type IN ('Standing','AdHoc','Review','Advisory')),
    mandate         text NOT NULL DEFAULT '',
    chairperson_id  text NOT NULL,  -- -> staff."ID"
    secretary_id    text NOT NULL,  -- -> staff."ID"
    status          text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
    formed_date     date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.committee_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id    uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    staff_id        text NOT NULL,  -- -> staff."ID"
    role            text NOT NULL DEFAULT 'Member' CHECK (role IN ('Member','Invitee','ExternalExpert'))
);

CREATE TABLE IF NOT EXISTS public.meetings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    committee_id    uuid NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
    meeting_date    date NOT NULL,
    venue           text NOT NULL DEFAULT '',
    title           text NOT NULL,
    summary         text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agenda_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    sequence        integer NOT NULL DEFAULT 0,
    description     text NOT NULL,
    proposed_by     text NOT NULL,  -- -> staff."ID"
    status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Discussed','Deferred'))
);

CREATE TABLE IF NOT EXISTS public.action_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    source          text NOT NULL DEFAULT 'meeting' CHECK (source IN ('meeting','manual')),
    task            text NOT NULL,
    assigned_to     text NOT NULL,  -- -> staff."ID"
    deadline        date NOT NULL,
    status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','InProgress','Completed')),
    completed_at    timestamptz,
    notes           text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.meeting_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    file_name       text NOT NULL,
    storage_path    text NOT NULL,
    uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tickets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token           text NOT NULL UNIQUE,
    subject         text NOT NULL,
    category        text NOT NULL CHECK (category IN ('Infrastructure','EquipmentIT','Administrative','HRGrievance','Finance','LabResearch','Library','Transport')),
    urgency         text NOT NULL DEFAULT 'Medium' CHECK (urgency IN ('Low','Medium','High','Critical')),
    description     text NOT NULL DEFAULT '',
    submitted_by    text NOT NULL,  -- -> staff."ID"
    assigned_to     text,           -- -> staff."ID", nullable, auto-routed on create
    status          text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','InProgress','Resolved','Closed')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz
);

CREATE TABLE IF NOT EXISTS public.ticket_responses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id       text NOT NULL,  -- -> staff."ID"
    message         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    event_type      text NOT NULL CHECK (event_type IN ('Created','Assigned','StatusChanged','Resolved','Closed','Reopened')),
    actor_id        text NOT NULL,  -- -> staff."ID"
    details         jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.helpdesk_routing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category        text NOT NULL UNIQUE CHECK (category IN ('Infrastructure','EquipmentIT','Administrative','HRGrievance','Finance','LabResearch','Library','Transport')),
    target_type     text NOT NULL CHECK (target_type IN ('division','role')),
    target_id       text NOT NULL  -- division.divCode or role name
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     text NOT NULL CHECK (entity_type IN ('committee','meeting','action_item','ticket','ticket_response')),
    entity_id       uuid NOT NULL,
    action          text NOT NULL CHECK (action IN ('created','updated','deleted','status_changed')),
    actor_id        text NOT NULL,  -- -> staff."ID"
    changes         jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS committees_status_idx ON public.committees(status);
CREATE INDEX IF NOT EXISTS committee_members_committee_idx ON public.committee_members(committee_id);
CREATE INDEX IF NOT EXISTS committee_members_staff_idx ON public.committee_members(staff_id);
CREATE INDEX IF NOT EXISTS meetings_committee_idx ON public.meetings(committee_id);
CREATE INDEX IF NOT EXISTS meetings_date_idx ON public.meetings(meeting_date);
CREATE INDEX IF NOT EXISTS agenda_items_meeting_idx ON public.agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_meeting_idx ON public.action_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_assigned_to_idx ON public.action_items(assigned_to);
CREATE INDEX IF NOT EXISTS action_items_status_idx ON public.action_items(status);
CREATE INDEX IF NOT EXISTS meeting_documents_meeting_idx ON public.meeting_documents(meeting_id);
CREATE INDEX IF NOT EXISTS tickets_submitted_by_idx ON public.tickets(submitted_by);
CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets(status);
CREATE INDEX IF NOT EXISTS tickets_token_idx ON public.tickets(token);
CREATE INDEX IF NOT EXISTS ticket_responses_ticket_idx ON public.ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS helpdesk_routing_category_idx ON public.helpdesk_routing(category);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log(created_at);

-- ══════════════════════════════════════════════════════════════════
-- 3. TRIGGERS
-- ══════════════════════════════════════════════════════════════════

-- pms_set_updated_at() already exists from init migration.
-- Apply to tickets.updated_at:
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════

-- Decision D-01: Shallow RLS. All authenticated = SELECT. Admin roles = ALL.

ALTER TABLE public.committees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_routing   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;

-- SELECT policies: all authenticated users can read all tables
CREATE POLICY "committees_select"        ON public.committees         FOR SELECT TO authenticated USING (true);
CREATE POLICY "committee_members_select" ON public.committee_members  FOR SELECT TO authenticated USING (true);
CREATE POLICY "meetings_select"          ON public.meetings           FOR SELECT TO authenticated USING (true);
CREATE POLICY "agenda_items_select"      ON public.agenda_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "action_items_select"      ON public.action_items       FOR SELECT TO authenticated USING (true);
CREATE POLICY "meeting_documents_select" ON public.meeting_documents  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_select"           ON public.tickets            FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_responses_select"  ON public.ticket_responses   FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_events_select"     ON public.ticket_events      FOR SELECT TO authenticated USING (true);
CREATE POLICY "helpdesk_routing_select"  ON public.helpdesk_routing   FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_select"         ON public.audit_log          FOR SELECT TO authenticated USING (true);

-- WRITE policies: only Director, SystemAdmin, MasterAdmin
CREATE POLICY "committees_write"
    ON public.committees FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "committee_members_write"
    ON public.committee_members FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "meetings_write"
    ON public.meetings FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "agenda_items_write"
    ON public.agenda_items FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "action_items_write"
    ON public.action_items FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "meeting_documents_write"
    ON public.meeting_documents FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "tickets_write"
    ON public.tickets FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "ticket_responses_write"
    ON public.ticket_responses FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "ticket_events_write"
    ON public.ticket_events FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "helpdesk_routing_write"
    ON public.helpdesk_routing FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "audit_log_write"
    ON public.audit_log FOR ALL TO authenticated
    USING (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- ══════════════════════════════════════════════════════════════════
-- 5. RPCs (helpdesk ticket operations)
-- ══════════════════════════════════════════════════════════════════

-- route_ticket: resolves category + submitter to a handler.
-- Priority: helpdesk_routing override → submitter's DivisionHead → HRAdmin → SystemAdmin
-- Decision D-06: default = submitter's DivisionHead
-- Decision D-07: fallback = DivisionHead → HRAdmin → SystemAdmin
-- Decision D-08: one row per category in helpdesk_routing
CREATE OR REPLACE FUNCTION public.route_ticket(
    p_category text,
    p_submitter_id text
) RETURNS text AS $$
DECLARE
    v_target_type text;
    v_target_id text;
    v_result_id text;
    v_div_code text;
BEGIN
    -- Step 1: Check helpdesk_routing for explicit override
    SELECT target_type, target_id INTO v_target_type, v_target_id
    FROM public.helpdesk_routing
    WHERE category = p_category;

    IF FOUND THEN
        IF v_target_type = 'role' THEN
            -- Find any user with this role
            SELECT up.user_id INTO v_result_id
            FROM public.user_roles ur
            JOIN public.user_profiles up ON up.user_id = ur.user_id
            WHERE ur.role = v_target_id
            LIMIT 1;
        ELSIF v_target_type = 'division' THEN
            -- Find the HoD of this division
            SELECT sf."ID" INTO v_result_id
            FROM public.staff sf
            WHERE sf."Division" = v_target_id AND sf."ReportingID" = 'D001'
            LIMIT 1;
        END IF;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 2: Fallback to submitter's DivisionHead
    SELECT sf2."Division" INTO v_div_code
    FROM public.staff sf2
    WHERE sf2."ID" = p_submitter_id;

    IF v_div_code IS NOT NULL THEN
        SELECT sf3."ID" INTO v_result_id
        FROM public.staff sf3
        JOIN public.divisions d ON d."divCode" = sf3."Division"
        WHERE sf3."Division" = v_div_code AND d."divHoDID" = sf3."ID"
        LIMIT 1;
        IF v_result_id IS NOT NULL THEN
            RETURN v_result_id;
        END IF;
    END IF;

    -- Step 3: Fallback to HRAdmin
    SELECT up.user_id INTO v_result_id
    FROM public.user_roles ur
    WHERE ur.role = 'HRAdmin'
    LIMIT 1;
    IF v_result_id IS NOT NULL THEN
        RETURN v_result_id;
    END IF;

    -- Step 4: Last resort — SystemAdmin
    SELECT up.user_id INTO v_result_id
    FROM public.user_roles ur
    WHERE ur.role = 'SystemAdmin'
    LIMIT 1;
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- helpdesk_create_ticket: creates ticket with auto-generated token and routing
CREATE OR REPLACE FUNCTION public.helpdesk_create_ticket(
    p_subject text,
    p_category text,
    p_urgency text,
    p_description text,
    p_submitted_by text
) RETURNS uuid AS $$
DECLARE
    v_ticket_id uuid;
    v_token text;
    v_seq integer;
    v_assigned_to text;
BEGIN
    -- Generate token: AMPRI-YYMMDD-XXX
    SELECT COALESCE(MAX(SUBSTRING(token FROM 'AMPRI-\d{6}-(\d{3})')::integer), 0) + 1
    INTO v_seq FROM public.tickets
    WHERE token LIKE 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-%';

    v_token := 'AMPRI-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(v_seq::text, 3, '0');

    -- Route assignment
    v_assigned_to := public.route_ticket(p_category, p_submitted_by);

    -- Insert ticket
    INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, assigned_to, status)
    VALUES (v_token, p_subject, p_category, p_urgency, p_description, p_submitted_by, v_assigned_to, 'Open')
    RETURNING id INTO v_ticket_id;

    -- Log Created event
    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (v_ticket_id, 'Created', p_submitted_by,
            jsonb_build_object('token', v_token, 'category', p_category, 'assigned_to', v_assigned_to));

    -- Log Assigned event if routing produced a handler
    IF v_assigned_to IS NOT NULL THEN
        INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
        VALUES (v_ticket_id, 'Assigned', 'system',
                jsonb_build_object('assigned_to', v_assigned_to));
    END IF;

    RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- helpdesk_update_status: validates state transitions and logs events
CREATE OR REPLACE FUNCTION public.helpdesk_update_status(
    p_ticket_id uuid,
    p_new_status text,
    p_actor_id text
) RETURNS void AS $$
DECLARE
    v_current_status text;
BEGIN
    SELECT status INTO v_current_status FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Validate transitions
    IF v_current_status = 'Open' AND p_new_status NOT IN ('InProgress', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'InProgress' AND p_new_status NOT IN ('Resolved', 'Closed') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Resolved' AND p_new_status NOT IN ('Closed', 'InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    ELSIF v_current_status = 'Closed' AND p_new_status NOT IN ('InProgress') THEN
        RAISE EXCEPTION 'Invalid transition: % -> %', v_current_status, p_new_status;
    END IF;

    -- Update status
    UPDATE public.tickets
    SET status = p_new_status,
        resolved_at = CASE WHEN p_new_status = 'Resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
    WHERE id = p_ticket_id;

    -- Determine event type from transition
    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id,
            CASE
                WHEN p_new_status = 'InProgress' AND v_current_status = 'Closed' THEN 'Reopened'
                WHEN p_new_status = 'Resolved' THEN 'Resolved'
                WHEN p_new_status = 'Closed' THEN 'Closed'
                ELSE 'StatusChanged'
            END,
            p_actor_id,
            jsonb_build_object('from', v_current_status, 'to', p_new_status));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 6. STORAGE BUCKET (meeting documents)
-- ══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('committee-docs', 'committee-docs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: all authenticated can read (download)
CREATE POLICY "committee_docs_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'committee-docs');

-- RLS: admin roles can upload
CREATE POLICY "committee_docs_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'committee-docs'
        AND (public.user_has_role('Director') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    );

-- END: supabase/migrations/20260507000000_committees_helpdesk.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260510000000_committee_minutes_lock.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: Add minutes lock RLS policy + admin unlock RPC
-- Overrides Phase 1 Decision D-03 per CONTEXT.md D-19:
--   Minutes auto-lock 7 days after meeting completion.
--   RLS prevents UPDATE/DELETE on meetings when locked.
--   SELECT remains open to all authenticated users.
--   Admin roles (Director, SystemAdmin, MasterAdmin) can bypass via unlock RPC.

-- 1. Drop the existing all-in-one meetings_write policy
DROP POLICY IF EXISTS "meetings_write" ON public.meetings;

-- 2. SELECT policy — all authenticated users can read meetings (no lock guard)
CREATE POLICY "meetings_select"
    ON public.meetings FOR SELECT TO authenticated
    USING (true);

-- 3. INSERT policy — admin roles only; lock condition applies to new rows
CREATE POLICY "meetings_insert"
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_role('Director')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('MasterAdmin')
    );

-- 4. UPDATE policy — role check + lock guard prevents editing locked meetings
--    A meeting is "locked" when status = 'Completed' AND
--    meeting_date < CURRENT_DATE - INTERVAL '7 days'.
--    MasterAdmin can always override the lock.
CREATE POLICY "meetings_update"
    ON public.meetings FOR UPDATE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    )
    WITH CHECK (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 5. DELETE policy — role check + lock guard prevents deleting locked meetings
CREATE POLICY "meetings_delete"
    ON public.meetings FOR DELETE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 6. SECURITY DEFINER function: resets meeting_date to "unlock" minutes
--    Moves meeting_date to today so the lock window resets.
CREATE OR REPLACE FUNCTION public.unlock_meeting_minutes(
    p_meeting_id uuid
) RETURNS void AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT public.user_has_role('MasterAdmin')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('Director')
    INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only administrators can unlock meeting minutes';
    END IF;

    UPDATE public.meetings
    SET meeting_date = CURRENT_DATE
    WHERE id = p_meeting_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- END: supabase/migrations/20260510000000_committee_minutes_lock.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: Phase 3 helpdesk RPCs — assign_ticket + add_response
-- Adds two SECURITY DEFINER RPCs required for Phase 3 helpdesk operations:
--   helpdesk_assign_ticket  — admin reassignment with event logging (Pitfall 2)
--   helpdesk_add_response   — response insertion bypassing RLS for non-admin users (Pitfall 1)
--
-- Existing RPCs (helpdesk_create_ticket, helpdesk_update_status, route_ticket) live in
-- 20260507000000_committees_helpdesk.sql — DO NOT EDIT that file.
--
-- Decision: SECURITY DEFINER pattern mirrors existing helpdesk RPCs.
-- Decision: helpdesk_add_response enforces p_author_id = auth.uid() to prevent spoofing (STRIDE T-03-05).
-- Decision: helpdesk_assign_ticket logs Assigned event with old→new handler in details.

-- ══════════════════════════════════════════════════════════════════
-- 1. helpdesk_assign_ticket — reassign ticket to a new handler
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.helpdesk_assign_ticket(
    p_ticket_id uuid,
    p_new_handler_id text,
    p_actor_id text
) RETURNS void AS $$
DECLARE
    v_old_handler_id text;
BEGIN
    -- Get current handler
    SELECT assigned_to INTO v_old_handler_id FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Update assigned_to and updated_at atomically
    UPDATE public.tickets
    SET assigned_to = p_new_handler_id,
        updated_at = now()
    WHERE id = p_ticket_id;

    -- Log Assigned event with old→new handler
    INSERT INTO public.ticket_events (ticket_id, event_type, actor_id, details)
    VALUES (p_ticket_id, 'Assigned', p_actor_id,
            jsonb_build_object(
                'from', v_old_handler_id,
                'to', p_new_handler_id
            ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 2. helpdesk_add_response — insert response bypassing RLS
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.helpdesk_add_response(
    p_ticket_id uuid,
    p_author_id text,
    p_message text
) RETURNS uuid AS $$
DECLARE
    v_response_id uuid;
BEGIN
    -- Verify ticket exists
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Verify author_id matches the authenticated user (spoofing prevention)
    -- SECURITY DEFINER context so auth.uid() is the caller's Supabase Auth UID
    IF p_author_id != auth.uid()::text THEN
        RAISE EXCEPTION 'Author ID must match authenticated user';
    END IF;

    -- Insert response
    INSERT INTO public.ticket_responses (ticket_id, author_id, message)
    VALUES (p_ticket_id, p_author_id, p_message)
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- END: supabase/migrations/20260510000000_helpdesk_phase3_rpcs.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/migrations/20260516000000_audit_log_triggers.sql
-- ════════════════════════════════════════════════════════════════════
-- Migration: audit_log triggers for committees + helpdesk
-- Fulfills INT-03 — audit log captures changes to committees, meetings,
-- action_items, tickets, ticket_responses via row-level triggers.

-- ══════════════════════════════════════════════════════════════════
-- 1. Trigger function (SECURITY DEFINER to bypass audit_log_write RLS)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor      text;
    v_action     text;
    v_entity_id  uuid;
    v_changes    jsonb;
BEGIN
    v_actor := COALESCE(auth.uid()::text, 'system');

    IF TG_OP = 'INSERT' THEN
        v_action    := 'created';
        v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
        v_changes   := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
        -- Detect status_changed when a 'status' column exists and changed
        IF (to_jsonb(NEW) ? 'status')
           AND (to_jsonb(NEW) ->> 'status') IS DISTINCT FROM (to_jsonb(OLD) ->> 'status') THEN
            v_action := 'status_changed';
        ELSE
            v_action := 'updated';
        END IF;
        v_changes := jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    ELSE  -- DELETE
        v_action    := 'deleted';
        v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
        v_changes   := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, changes)
    VALUES (TG_ARGV[0], v_entity_id, v_action, v_actor, v_changes);

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 2. Triggers on each audited table
-- ══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS committees_audit         ON public.committees;
DROP TRIGGER IF EXISTS meetings_audit           ON public.meetings;
DROP TRIGGER IF EXISTS action_items_audit       ON public.action_items;
DROP TRIGGER IF EXISTS tickets_audit            ON public.tickets;
DROP TRIGGER IF EXISTS ticket_responses_audit   ON public.ticket_responses;

CREATE TRIGGER committees_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.committees
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('committee');

CREATE TRIGGER meetings_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('meeting');

CREATE TRIGGER action_items_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.action_items
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('action_item');

CREATE TRIGGER tickets_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('ticket');

CREATE TRIGGER ticket_responses_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.ticket_responses
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('ticket_response');

-- ══════════════════════════════════════════════════════════════════
-- 3. Allow authenticated SELECT on audit_log (admin gate is at UI)
-- ══════════════════════════════════════════════════════════════════
-- The existing audit_log_select policy already allows any authenticated user
-- to SELECT; the AuditLog page enforces admin-only at the UI layer (same
-- pattern as pms_audit_logs). No policy change required here.

-- END: supabase/migrations/20260516000000_audit_log_triggers.sql

-- ════════════════════════════════════════════════════════════════════
-- BEGIN: supabase/seed.sql
-- ════════════════════════════════════════════════════════════════════
-- =============================================================
-- SURYA — Seed Data
-- CSIR-AMPRI (Advanced Materials and Processes Research Institute)
-- Bhopal, India
-- =============================================================
--
-- PREREQUISITES:
--   1. Run supabase/migrations/00000000000000_init.sql first (creates all tables).
--   2. Create auth users via Supabase Dashboard or Auth API before seeding
--      user_roles / user_profiles (those are auto-created by the auth trigger).
--   3. Run this file as the postgres role (bypasses RLS) in Supabase SQL Editor
--      or via: psql -f seed.sql
--
-- This file seeds HR analytics data only. PMS data (appraisal_cycles etc.)
-- is included at the end with a single open cycle for development.
-- Auth-linked tables (user_roles, user_profiles) are NOT touched here.
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. DIVISIONS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.divisions
    ("divCode", "divName", "divDescription", "divResearchAreas", "divHoD", "divHoDID", "divSanctionedstrength", "divCurrentStrength", "divStatus")
VALUES
    ('ARC', 'Advanced Refractory Ceramics', 'Research on high-temperature ceramics, refractories, and structural ceramic composites for industrial and strategic applications.', 'Oxide ceramics, non-oxide ceramics, ceramic matrix composites, refractory castables, thermal barrier coatings', 'Dr. Arvind Kumar Sharma', 'S001', 12, 8, 'Active'),
    ('EEC', 'Energy & Environment', 'Development of materials and processes for clean energy, energy storage, and environmental remediation.', 'Solid oxide fuel cells, lithium-ion batteries, supercapacitors, photocatalysis, water treatment, CO2 capture', 'Dr. Priya Nair', 'S002', 10, 7, 'Active'),
    ('BMS', 'Biomaterials & Sensors', 'Biocompatible materials for implants, drug delivery systems, and chemical/biosensor development.', 'Hydroxyapatite scaffolds, biopolymer composites, electrochemical sensors, piezoelectric biosensors, drug delivery nanocarriers', 'Dr. Rajesh Verma', 'S003', 10, 6, 'Active'),
    ('NST', 'Nanomaterials & Surface Technology', 'Synthesis and characterization of nanomaterials, thin films, and surface engineering for functional applications.', 'Carbon nanotubes, graphene, quantum dots, plasma-sprayed coatings, PVD/CVD thin films, self-cleaning surfaces', 'Dr. Sunita Mishra', 'S004', 10, 7, 'Active'),
    ('CPS', 'Corrosion Protection & Surface Engineering', 'Corrosion mechanisms, protective coatings, and surface modification techniques for metals and alloys.', 'Hot-dip galvanizing, electroless nickel plating, epoxy-based coatings, cathodic protection, high-temperature oxidation', NULL, NULL, 8, 5, 'Active'),
    ('PMD', 'Polymer & Mineral Processing', 'Processing of industrial minerals, polymer composites, and fly-ash utilization for value-added products.', 'Fly ash beneficiation, polymer nanocomposites, rubber compounding, mineral grinding, geopolymer cements', NULL, NULL, 8, 5, 'Active');


-- ──────────────────────────────────────────────────────────────
-- 2. STAFF
-- ──────────────────────────────────────────────────────────────
-- IDs: S001-S012 (Scientific), T001-T004 (Technical), H001-H002 (Admin)
-- Levels: 7=Chief Scientist, 6=Principal/Senior, 5=Scientist, 4=Technical Officer, 3=Admin

INSERT INTO public.staff
    ("ID", "LabCode", "EmployeeType", "Name", "Designation", "Group", "Division", "DoAPP", "DOJ", "DOB", "Cat", "AppointmentType", "Level", "CoreArea", "Expertise", "Email", "Ext", "VidwanID", "ReportingID", "HighestQualification", "Gender")
VALUES
    -- Chief Scientists (Division Heads, Level 7)
    ('S001', 'AMPRI', 'Regular', 'Dr. Arvind Kumar Sharma', 'Chief Scientist', 'Scientific', 'ARC', '2020-04-01', '2002-07-15', '1968-03-22', 'GEN', 'Direct', '7', 'Advanced Ceramics', 'High-temperature ceramics, refractory composites, thermal barrier coatings, spark plasma sintering', 'ak.sharma@ampri.res.in', '201', 'VID-001', NULL, 'Ph.D. (Ceramic Engineering), BHU', 'Male'),
    ('S002', 'AMPRI', 'Regular', 'Dr. Priya Nair', 'Chief Scientist', 'Scientific', 'EEC', '2019-10-01', '2001-09-03', '1969-11-14', 'GEN', 'Direct', '7', 'Energy Materials', 'Solid oxide fuel cells, lithium-ion cathode materials, electrochemical energy storage, impedance spectroscopy', 'p.nair@ampri.res.in', '202', 'VID-002', NULL, 'Ph.D. (Materials Science), IISc Bangalore', 'Female'),
    ('S003', 'AMPRI', 'Regular', 'Dr. Rajesh Verma', 'Chief Scientist', 'Scientific', 'BMS', '2021-01-01', '2003-01-20', '1970-06-08', 'OBC', 'Direct', '7', 'Biomaterials', 'Hydroxyapatite coatings, bioactive glass, scaffolds for bone tissue engineering, electrochemical biosensors', 'r.verma@ampri.res.in', '203', 'VID-003', NULL, 'Ph.D. (Biomedical Engineering), IIT Bombay', 'Male'),
    ('S004', 'AMPRI', 'Regular', 'Dr. Sunita Mishra', 'Chief Scientist', 'Scientific', 'NST', '2020-07-01', '2000-11-10', '1967-09-30', 'GEN', 'Direct', '7', 'Nanomaterials', 'Carbon nanotubes, graphene synthesis, thin film deposition, plasma spray coatings, surface characterization', 's.mishra@ampri.res.in', '204', 'VID-004', NULL, 'Ph.D. (Physics), University of Delhi', 'Female'),

    -- Principal Scientists (Level 6)
    ('S005', 'AMPRI', 'Regular', 'Dr. Manoj Kumar Gupta', 'Principal Scientist', 'Scientific', 'ARC', '2022-04-01', '2008-06-01', '1978-01-15', 'GEN', 'Direct', '6', 'Structural Ceramics', 'Silicon carbide ceramics, alumina-zirconia composites, mechanical characterization, fracture toughness', 'mk.gupta@ampri.res.in', '211', 'VID-005', 'S001', 'Ph.D. (Materials Engineering), IIT Kanpur', 'Male'),
    ('S006', 'AMPRI', 'Regular', 'Dr. Anita Deshmukh', 'Principal Scientist', 'Scientific', 'EEC', '2021-10-01', '2009-03-15', '1979-05-20', 'SC', 'Direct', '6', 'Energy Storage', 'Supercapacitor electrode materials, MnO2 nanostructures, conducting polymers, cyclic voltammetry', 'a.deshmukh@ampri.res.in', '212', 'VID-006', 'S002', 'Ph.D. (Chemistry), NCL Pune', 'Female'),
    ('S007', 'AMPRI', 'Regular', 'Dr. Vikram Singh Rathore', 'Senior Scientist', 'Scientific', 'CPS', '2023-04-01', '2012-08-20', '1983-12-05', 'GEN', 'Direct', '6', 'Corrosion Engineering', 'Corrosion inhibitors, electroless nickel coatings, potentiodynamic polarization, EIS, salt spray testing', 'vs.rathore@ampri.res.in', '215', 'VID-007', 'S001', 'Ph.D. (Metallurgical Engineering), IIT BHU', 'Male'),
    ('S008', 'AMPRI', 'Regular', 'Dr. Kavita Joshi', 'Senior Scientist', 'Scientific', 'PMD', '2023-04-01', '2013-01-10', '1984-08-18', 'OBC', 'Direct', '6', 'Polymer Composites', 'Natural fibre-reinforced polymers, fly ash-filled composites, rubber compounding, DMA, thermal analysis', 'k.joshi@ampri.res.in', '216', 'VID-008', 'S002', 'Ph.D. (Polymer Science), CSJM University Kanpur', 'Female'),

    -- Scientists (Level 5)
    ('S009', 'AMPRI', 'Regular', 'Dr. Amit Patel', 'Scientist', 'Scientific', 'NST', '2024-04-01', '2016-09-01', '1988-04-12', 'GEN', 'Direct', '5', 'Thin Films', 'PVD coatings, magnetron sputtering, tribological films, nanoindentation, XPS analysis', 'a.patel@ampri.res.in', '221', 'VID-009', 'S004', 'Ph.D. (Surface Engineering), IIT Roorkee', 'Male'),
    ('S010', 'AMPRI', 'Regular', 'Dr. Deepa Krishnamurthy', 'Scientist', 'Scientific', 'BMS', '2024-04-01', '2017-04-15', '1990-02-28', 'GEN', 'Direct', '5', 'Biosensors', 'Electrochemical sensors, molecularly imprinted polymers, aptasensors, lab-on-chip, screen-printed electrodes', 'd.krishnamurthy@ampri.res.in', '222', 'VID-010', 'S003', 'Ph.D. (Bioelectronics), CSIR-CECRI Karaikudi', 'Female'),
    ('S011', 'AMPRI', 'Regular', 'Dr. Rahul Tiwari', 'Scientist', 'Scientific', 'EEC', '2024-10-01', '2018-07-22', '1991-07-03', 'OBC', 'Direct', '5', 'Photocatalysis', 'TiO2 nanostructures, visible-light photocatalysis, water splitting, dye degradation, photoreactor design', 'r.tiwari@ampri.res.in', '223', 'VID-011', 'S002', 'Ph.D. (Chemical Engineering), IIT Delhi', 'Male'),
    ('S012', 'AMPRI', 'Regular', 'Dr. Neha Saxena', 'Scientist', 'Scientific', 'CPS', '2025-04-01', '2019-11-05', '1992-10-25', 'GEN', 'Direct', '5', 'Protective Coatings', 'Sol-gel coatings, epoxy nanocomposite coatings, anti-corrosion performance, adhesion testing, weathering studies', 'n.saxena@ampri.res.in', '224', 'VID-012', 'S007', 'Ph.D. (Materials Science), CSIR-NML Jamshedpur', 'Female'),

    -- Technical Officers (Level 4)
    ('T001', 'AMPRI', 'Regular', 'Shri Ramesh Yadav', 'Technical Officer', 'Technical', 'ARC', '2018-04-01', '2005-03-10', '1975-08-20', 'OBC', 'Direct', '4', 'Instrument Operation', 'XRD operation and analysis, sample preparation, powder diffraction, Rietveld refinement', 'r.yadav@ampri.res.in', '301', NULL, 'S001', 'M.Tech (Instrumentation), RGPV Bhopal', 'Male'),
    ('T002', 'AMPRI', 'Regular', 'Shri Dinesh Kumar Pandey', 'Technical Officer', 'Technical', 'NST', '2019-04-01', '2007-06-25', '1977-03-15', 'GEN', 'Direct', '4', 'Electron Microscopy', 'SEM/EDS operation, TEM sample preparation, image analysis, sputter coating', 'd.pandey@ampri.res.in', '302', NULL, 'S004', 'M.Sc. (Physics), Barkatullah University Bhopal', 'Male'),
    ('T003', 'AMPRI', 'Regular', 'Smt. Rekha Bhatt', 'Technical Officer', 'Technical', 'EEC', '2020-04-01', '2010-01-08', '1982-12-10', 'GEN', 'Direct', '4', 'Thermal Analysis', 'TGA/DSC operation, dilatometry, thermal conductivity measurement, sample handling', 'r.bhatt@ampri.res.in', '303', NULL, 'S002', 'M.Sc. (Chemistry), Jiwaji University Gwalior', 'Female'),
    ('T004', 'AMPRI', 'Regular', 'Shri Ajay Soni', 'Technical Officer', 'Technical', 'BMS', '2021-04-01', '2011-09-15', '1984-06-05', 'SC', 'Direct', '4', 'Lab Management', 'Biomaterials testing, cell culture facility maintenance, autoclave operation, ISO documentation', 'a.soni@ampri.res.in', '304', NULL, 'S003', 'M.Sc. (Biotechnology), Devi Ahilya University Indore', 'Male'),

    -- Administrative Staff (Level 3)
    ('H001', 'AMPRI', 'Regular', 'Shri Prakash Dubey', 'Section Officer', 'Admin', NULL, '2015-04-01', '2004-12-01', '1973-05-18', 'GEN', 'Direct', '3', 'Administration', 'Establishment matters, service records, recruitment coordination, RTI', 'p.dubey@ampri.res.in', '101', NULL, NULL, 'B.A. (Public Administration), Barkatullah University', 'Male'),
    ('H002', 'AMPRI', 'Regular', 'Smt. Meena Sharma', 'Assistant Section Officer', 'Admin', NULL, '2018-04-01', '2010-08-10', '1982-09-25', 'GEN', 'Direct', '3', 'Finance & Accounts', 'Budget preparation, expenditure monitoring, project accounts, audit compliance', 'm.sharma@ampri.res.in', '102', NULL, 'H001', 'M.Com (Accounting), Barkatullah University', 'Female');


-- ──────────────────────────────────────────────────────────────
-- 3. PROJECTS
-- ──────────────────────────────────────────────────────────────
-- ProjectNo format: OLP (In-House), EXP (Extramural), CNS (Consultancy)

INSERT INTO public.projects
    ("ProjectID", "ProjectNo", "ProjectName", "FundType", "SponsorerType", "SponsorerName", "ProjectCategory", "ProjectStatus", "StartDate", "CompletioDate", "SanctionedCost", "UtilizedAmount", "PrincipalInvestigator", "DivisionCode", "Extension", "ApprovalAuthority")
VALUES
    ('P001', 'OLP-2023-01', 'Development of Mullite-Bonded SiC Refractories for Steel Ladle Applications', 'In-House', 'Government', 'CSIR', 'In-House', 'Active', '2023-04-01', '2026-03-31', '85.00', '52.30', 'Dr. Arvind Kumar Sharma', 'ARC', NULL, 'CSIR HQ'),
    ('P002', 'OLP-2024-01', 'Carbon Nanotube Reinforced Alumina Composites for Wear-Resistant Applications', 'In-House', 'Government', 'CSIR', 'In-House', 'Active', '2024-04-01', '2027-03-31', '65.00', '18.75', 'Dr. Sunita Mishra', 'NST', NULL, 'CSIR HQ'),
    ('P003', 'EXP-2022-01', 'High-Performance Cathode Materials for Next-Generation Sodium-Ion Batteries', 'Extramural', 'Government', 'DST-SERB', 'Extramural', 'Active', '2022-10-01', '2025-09-30', '42.50', '35.80', 'Dr. Priya Nair', 'EEC', NULL, 'DST'),
    ('P004', 'EXP-2023-01', 'Nano-Hydroxyapatite/Bioglass Scaffolds for Load-Bearing Bone Implants', 'Extramural', 'Government', 'DBT', 'Extramural', 'Active', '2023-07-01', '2026-06-30', '55.00', '28.40', 'Dr. Rajesh Verma', 'BMS', NULL, 'DBT'),
    ('P005', 'EXP-2023-02', 'Corrosion-Resistant Coatings for Defence Equipment under Tropical Conditions', 'Extramural', 'Government', 'DRDO', 'Extramural', 'Active', '2023-01-15', '2025-12-31', '78.00', '61.20', 'Dr. Vikram Singh Rathore', 'CPS', NULL, 'DRDO'),
    ('P006', 'EXP-2024-01', 'Visible-Light-Active Photocatalytic Membranes for Industrial Effluent Treatment', 'Extramural', 'Government', 'MNRE', 'Extramural', 'Active', '2024-01-01', '2026-12-31', '38.00', '9.50', 'Dr. Rahul Tiwari', 'EEC', NULL, 'MNRE'),
    ('P007', 'CNS-2024-01', 'Failure Analysis and Life Assessment of Refractory Lining for Bhilai Steel Plant', 'Consultancy', 'Industry', 'SAIL Bhilai', 'Consultancy', 'Active', '2024-06-01', '2025-05-31', '12.50', '8.90', 'Dr. Manoj Kumar Gupta', 'ARC', NULL, 'SAIL'),
    ('P008', 'CNS-2023-01', 'Development of Anti-Corrosion Paint Formulations for IOCL Pipeline Network', 'Consultancy', 'Industry', 'Indian Oil Corporation Ltd', 'Consultancy', 'Completed', '2023-03-01', '2024-08-31', '18.00', '18.00', 'Dr. Vikram Singh Rathore', 'CPS', NULL, 'IOCL'),
    ('P009', 'OLP-2022-01', 'Fly-Ash Based Geopolymer Binders for Sustainable Construction Materials', 'In-House', 'Government', 'CSIR', 'In-House', 'Completed', '2022-04-01', '2025-03-31', '48.00', '46.50', 'Dr. Kavita Joshi', 'PMD', NULL, 'CSIR HQ'),
    ('P010', 'EXP-2024-02', 'Flexible Electrochemical Biosensor Arrays for Point-of-Care Diagnostics', 'Extramural', 'Government', 'DST-SERB', 'Extramural', 'Active', '2024-09-01', '2027-08-31', '35.00', '5.20', 'Dr. Deepa Krishnamurthy', 'BMS', NULL, 'DST');


-- ──────────────────────────────────────────────────────────────
-- 4. PHD STUDENTS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.phd_students
    ("EnrollmentNo", "StudentName", "Specialization", "SupervisorName", "CoSupervisorName", "FellowshipDetails", "CurrentStatus", "ThesisTitle", "ProjectNo", "DivisionCode")
VALUES
    ('PHD-2021-001', 'Arun Kumar Meena', 'Ceramic Engineering', 'Dr. Arvind Kumar Sharma', 'Dr. Manoj Kumar Gupta', 'CSIR-JRF/SRF', 'Thesis Submitted', 'Spark Plasma Sintered Mullite-ZrO2 Composites: Microstructure and Thermo-Mechanical Properties', 'OLP-2023-01', 'ARC'),
    ('PHD-2022-001', 'Sneha Rajput', 'Materials Science', 'Dr. Priya Nair', NULL, 'CSIR-JRF/SRF', 'Ongoing', 'Layered Oxide Cathodes for High-Energy Sodium-Ion Batteries: Synthesis, Electrochemistry and Degradation Mechanisms', 'EXP-2022-01', 'EEC'),
    ('PHD-2022-002', 'Mohammed Irfan Khan', 'Biomedical Engineering', 'Dr. Rajesh Verma', 'Dr. Deepa Krishnamurthy', 'DBT-JRF', 'Ongoing', 'Biomimetic Hydroxyapatite-Collagen Scaffolds with Controlled Porosity for Bone Regeneration', 'EXP-2023-01', 'BMS'),
    ('PHD-2023-001', 'Pooja Yadav', 'Nanotechnology', 'Dr. Sunita Mishra', NULL, 'UGC-NET JRF', 'Ongoing', 'Graphene-Metal Oxide Nanocomposites for Supercapacitor and Sensor Applications', 'OLP-2024-01', 'NST'),
    ('PHD-2023-002', 'Vikas Sahu', 'Corrosion Science', 'Dr. Vikram Singh Rathore', 'Dr. Neha Saxena', 'CSIR-JRF/SRF', 'Ongoing', 'Green Corrosion Inhibitors Derived from Natural Products for Mild Steel in Acidic Media', 'EXP-2023-02', 'CPS'),
    ('PHD-2023-003', 'Divya Shukla', 'Polymer Science', 'Dr. Kavita Joshi', NULL, 'CSIR-JRF/SRF', 'Ongoing', 'Geopolymer-Polymer Hybrid Composites from Fly Ash: Processing, Characterization and Durability', 'OLP-2022-01', 'PMD'),
    ('PHD-2024-001', 'Ravi Shankar Tripathi', 'Chemical Engineering', 'Dr. Rahul Tiwari', NULL, 'GATE Fellowship', 'Course Work', 'Design and Optimization of Z-Scheme Photocatalytic Systems for Simultaneous H2 Generation and Pollutant Degradation', 'EXP-2024-01', 'EEC'),
    ('PHD-2024-002', 'Priyanka Lodhi', 'Electronics', 'Dr. Deepa Krishnamurthy', NULL, 'DST INSPIRE', 'Course Work', 'Wearable Electrochemical Biosensors for Real-Time Metabolite Monitoring', 'EXP-2024-02', 'BMS'),
    ('PHD-2020-001', 'Sandeep Malviya', 'Materials Science', 'Dr. Sunita Mishra', 'Dr. Amit Patel', 'CSIR-JRF/SRF', 'Thesis Submitted', 'Magnetron Sputtered TiAlN Coatings: Process-Structure-Property Correlations for Machining Applications', 'OLP-2024-01', 'NST');


-- ──────────────────────────────────────────────────────────────
-- 5. EQUIPMENT
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.equipment
    ("UInsID", "Name", "EndUse", "Division", "IndenterName", "OperatorName", "Location", "WorkingStatus", "Movable", "RequirementInstallation", "Justification", "Remark")
VALUES
    ('EQ-001', 'X-Ray Diffractometer (XRD) — Rigaku SmartLab', 'Phase identification, crystal structure analysis, lattice parameter determination', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 3, Room 101 — X-Ray Lab', 'Working', 'No', 'Chilled water supply, vibration-free floor, radiation shielding', 'Central characterization facility for all divisions', NULL),
    ('EQ-002', 'Scanning Electron Microscope (SEM) — ZEISS EVO 18', 'Microstructure imaging, elemental analysis (EDS), fracture surface examination', 'NST', 'Dr. Sunita Mishra', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 105 — Electron Microscopy Suite', 'Working', 'No', 'Electromagnetic shielding, compressed N2 supply, vibration isolation', 'Essential for nano and micro-scale imaging across all projects', NULL),
    ('EQ-003', 'Transmission Electron Microscope (TEM) — JEOL JEM-2100', 'Nanostructure characterization, SAED, lattice imaging', 'NST', 'Dr. Sunita Mishra', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 107 — TEM Lab', 'Working', 'No', 'Liquid nitrogen supply, vibration-free foundation, temperature control', 'High-resolution imaging for nanomaterials research', NULL),
    ('EQ-004', 'Thermogravimetric Analyzer (TGA) — TA Instruments Q500', 'Thermal decomposition, oxidation kinetics, compositional analysis', 'EEC', 'Dr. Priya Nair', 'Smt. Rekha Bhatt', 'Building 2, Room 204 — Thermal Analysis Lab', 'Working', 'No', 'Inert gas supply (N2, Ar), stable power', 'Supports energy, polymer and ceramic research', NULL),
    ('EQ-005', 'Differential Scanning Calorimeter (DSC) — Mettler Toledo DSC 3', 'Phase transitions, glass transition, melting point, heat capacity', 'EEC', 'Dr. Priya Nair', 'Smt. Rekha Bhatt', 'Building 2, Room 204 — Thermal Analysis Lab', 'Working', 'Yes', 'Liquid N2 for sub-ambient, dry N2 purge', 'Complements TGA for comprehensive thermal characterization', NULL),
    ('EQ-006', 'Atomic Force Microscope (AFM) — Bruker Dimension Icon', 'Surface topography, roughness measurement, nanomechanical mapping', 'NST', 'Dr. Amit Patel', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 106 — SPM Lab', 'Working', 'No', 'Vibration isolation table, temperature-controlled room', 'Nanoscale surface characterization for coatings and thin films', NULL),
    ('EQ-007', 'Universal Testing Machine (UTM) — Instron 5982', 'Tensile, compressive, and flexural strength testing of materials', 'ARC', 'Dr. Manoj Kumar Gupta', 'Shri Ramesh Yadav', 'Building 1, Room 008 — Mechanical Testing Lab', 'Working', 'No', 'Hydraulic power supply, level floor', 'Supports all divisions for mechanical property evaluation', NULL),
    ('EQ-008', 'High-Temperature Box Furnace — Nabertherm LHT 04/18', 'Sintering ceramics, heat treatment, calcination up to 1800°C', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 1, Room 012 — Furnace Bay', 'Working', 'No', 'Three-phase power, ventilation hood', 'Core equipment for ceramic processing', NULL),
    ('EQ-009', 'Potentiostat/Galvanostat — Metrohm Autolab PGSTAT302N', 'Electrochemical characterization, corrosion testing, battery cycling', 'CPS', 'Dr. Vikram Singh Rathore', 'Shri Ajay Soni', 'Building 2, Room 210 — Electrochemistry Lab', 'Working', 'Yes', 'Faraday cage, stable power supply', 'Shared between CPS (corrosion) and EEC (energy storage) divisions', NULL),
    ('EQ-010', 'Spark Plasma Sintering System — FCT Systeme HP D 25', 'Rapid densification of ceramics, composites, and nanomaterials', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 1, Room 015 — SPS Lab', 'Working', 'No', 'Chilled water, high-current power supply, vacuum pump', 'Advanced sintering technique enabling novel ceramic composites', NULL),
    ('EQ-011', 'Planetary Ball Mill — Fritsch Pulverisette 5', 'Mechanical alloying, powder mixing, nanoparticle synthesis', 'PMD', 'Dr. Kavita Joshi', 'Shri Ramesh Yadav', 'Building 1, Room 010 — Powder Processing Lab', 'Working', 'Yes', 'Standard power, ventilation', 'Used for mineral processing and composite powder preparation', NULL),
    ('EQ-012', 'UV-Vis-NIR Spectrophotometer — Shimadzu UV-3600 Plus', 'Optical absorption, band gap determination, diffuse reflectance', 'EEC', 'Dr. Rahul Tiwari', 'Smt. Rekha Bhatt', 'Building 2, Room 206 — Optical Lab', 'Under Maintenance', 'Yes', 'Dark room, stable temperature', 'Detector replacement scheduled — expected back online May 2026', 'Detector module sent to Shimadzu service center for repair');


-- ──────────────────────────────────────────────────────────────
-- 6. PROJECT STAFF
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.project_staff
    ("id", "StaffName", "Designation", "RecruitmentCycle", "DateOfJoining", "DateOfProjectDuration", "ProjectNo", "PIName", "DivisionCode")
VALUES
    ('PS-001', 'Ritu Kumari', 'Junior Research Fellow (JRF)', '2023-I', '2023-08-15', '2023-08-15 to 2025-08-14', 'EXP-2022-01', 'Dr. Priya Nair', 'EEC'),
    ('PS-002', 'Aman Verma', 'Senior Research Fellow (SRF)', '2022-II', '2022-12-01', '2022-12-01 to 2025-11-30', 'EXP-2023-01', 'Dr. Rajesh Verma', 'BMS'),
    ('PS-003', 'Nisha Thakur', 'Project Assistant Level-II', '2024-I', '2024-05-01', '2024-05-01 to 2026-04-30', 'EXP-2023-02', 'Dr. Vikram Singh Rathore', 'CPS'),
    ('PS-004', 'Karan Singh', 'Junior Research Fellow (JRF)', '2024-II', '2024-10-15', '2024-10-15 to 2026-10-14', 'EXP-2024-01', 'Dr. Rahul Tiwari', 'EEC'),
    ('PS-005', 'Shalini Mishra', 'Project Assistant Level-II', '2024-I', '2024-04-01', '2024-04-01 to 2026-03-31', 'EXP-2024-02', 'Dr. Deepa Krishnamurthy', 'BMS'),
    ('PS-006', 'Rohit Prajapati', 'Junior Research Fellow (JRF)', '2023-II', '2024-01-10', '2024-01-10 to 2026-01-09', 'OLP-2024-01', 'Dr. Sunita Mishra', 'NST'),
    ('PS-007', 'Ankita Dwivedi', 'Senior Research Fellow (SRF)', '2021-I', '2021-06-01', '2021-06-01 to 2025-05-31', 'OLP-2023-01', 'Dr. Arvind Kumar Sharma', 'ARC');


-- ──────────────────────────────────────────────────────────────
-- 7. CONTRACT STAFF
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.contract_staff
    ("id", "Name", "Designation", "Division", "DateOfJoining", "ContractEndDate", "LabCode", "DateOfBirth", "AttachedToStaffID")
VALUES
    ('CS-001', 'Rajendra Vishwakarma', 'Lab Assistant', 'ARC', '2022-04-01', '2026-03-31', 'AMPRI', '1990-07-15', 'T001'),
    ('CS-002', 'Suneel Ahirwar', 'Lab Attendant', 'NST', '2023-01-15', '2026-01-14', 'AMPRI', '1993-11-20', 'T002'),
    ('CS-003', 'Mamta Kushwaha', 'Lab Assistant', 'EEC', '2023-07-01', '2026-06-30', 'AMPRI', '1995-03-08', 'T003'),
    ('CS-004', 'Govind Prasad Saket', 'MTS (Multi-Tasking Staff)', 'BMS', '2024-01-01', '2026-12-31', 'AMPRI', '1991-09-12', 'T004');


-- ──────────────────────────────────────────────────────────────
-- 8. SCIENTIFIC OUTPUTS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.scientific_outputs
    (id, title, authors, journal, year, doi, impact_factor, citation_count, division_code)
VALUES
    ('SO-001', 'Spark plasma sintered mullite-SiC composites: Effect of SiC content on microstructure and thermo-mechanical properties', ARRAY['A.K. Sharma', 'M.K. Gupta', 'A.K. Meena'], 'Journal of the European Ceramic Society', 2024, '10.1016/j.jeurceramsoc.2024.01.045', 6.4, 12, 'ARC'),
    ('SO-002', 'Layered P2-type Na0.67MnO2 cathodes with Al substitution for enhanced sodium-ion battery performance', ARRAY['P. Nair', 'S. Rajput', 'A. Deshmukh'], 'Journal of Power Sources', 2024, '10.1016/j.jpowsour.2024.03.112', 9.2, 8, 'EEC'),
    ('SO-003', 'Electrospun hydroxyapatite-PCL nanofiber scaffolds: In vitro biocompatibility and osteogenic differentiation', ARRAY['R. Verma', 'M.I. Khan', 'D. Krishnamurthy'], 'Biomaterials Science', 2024, '10.1039/D4BM00456A', 7.6, 15, 'BMS'),
    ('SO-004', 'CVD-grown graphene on copper foils: Role of hydrogen partial pressure on domain size and defect density', ARRAY['S. Mishra', 'P. Yadav', 'A. Patel'], 'Carbon', 2023, '10.1016/j.carbon.2023.08.034', 10.9, 22, 'NST'),
    ('SO-005', 'Imidazoline-based corrosion inhibitors for mild steel in 1M HCl: Experimental and DFT investigation', ARRAY['V.S. Rathore', 'V. Sahu', 'N. Saxena'], 'Corrosion Science', 2024, '10.1016/j.corsci.2024.05.018', 7.4, 6, 'CPS'),
    ('SO-006', 'Mechanical and water absorption behaviour of fly ash-filled jute/epoxy hybrid composites', ARRAY['K. Joshi', 'D. Shukla'], 'Composites Part B: Engineering', 2023, '10.1016/j.compositesb.2023.11.002', 13.1, 18, 'PMD'),
    ('SO-007', 'Z-scheme TiO2/g-C3N4 heterojunctions for visible-light-driven photocatalytic degradation of tetracycline', ARRAY['R. Tiwari', 'P. Nair', 'R.S. Tripathi'], 'Applied Catalysis B: Environmental', 2025, '10.1016/j.apcatb.2025.01.078', 22.1, 3, 'EEC'),
    ('SO-008', 'Molecularly imprinted polymer-based electrochemical sensor for selective detection of creatinine', ARRAY['D. Krishnamurthy', 'R. Verma', 'P. Lodhi'], 'Sensors and Actuators B: Chemical', 2025, '10.1016/j.snb.2025.02.034', 8.4, 1, 'BMS'),
    ('SO-009', 'Effect of rare-earth oxide additions on densification and thermal shock resistance of alumina refractories', ARRAY['M.K. Gupta', 'A.K. Sharma'], 'Ceramics International', 2023, '10.1016/j.ceramint.2023.06.190', 5.5, 14, 'ARC'),
    ('SO-010', 'TiAlN/CrN multilayer coatings by reactive magnetron sputtering: Tribological and high-temperature oxidation behaviour', ARRAY['A. Patel', 'S. Mishra', 'S. Malviya'], 'Surface and Coatings Technology', 2024, '10.1016/j.surfcoat.2024.07.011', 5.9, 9, 'NST');


-- ──────────────────────────────────────────────────────────────
-- 9. IP INTELLIGENCE
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.ip_intelligence
    (id, title, type, status, filing_date, grant_date, inventors, division_code)
VALUES
    ('IP-001', 'Process for manufacturing dense mullite-SiC composite refractory bodies by spark plasma sintering', 'Patent', 'Granted', '2021-08-15', '2024-02-20', ARRAY['A.K. Sharma', 'M.K. Gupta'], 'ARC'),
    ('IP-002', 'An improved electrochemical biosensor for rapid detection of creatinine in biological fluids', 'Patent', 'Published', '2023-11-10', NULL, ARRAY['D. Krishnamurthy', 'R. Verma'], 'BMS'),
    ('IP-003', 'Eco-friendly corrosion inhibitor formulation derived from Azadirachta indica extract for mild steel protection', 'Patent', 'Filed', '2024-06-22', NULL, ARRAY['V.S. Rathore', 'N. Saxena', 'V. Sahu'], 'CPS'),
    ('IP-004', 'Method for synthesis of phase-pure geopolymer binder from Class F fly ash with ambient curing', 'Patent', 'Granted', '2020-03-05', '2023-09-18', ARRAY['K. Joshi'], 'PMD'),
    ('IP-005', 'Visible-light-active Z-scheme photocatalytic membrane for degradation of organic pollutants in water', 'Patent', 'Filed', '2025-01-30', NULL, ARRAY['R. Tiwari', 'P. Nair'], 'EEC');


-- ──────────────────────────────────────────────────────────────
-- 10. APPRAISAL CYCLES (PMS)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.appraisal_cycles
    (id, name, start_date, end_date, status)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'FY 2025-26', '2025-04-01', '2026-03-31', 'OPEN');


-- ──────────────────────────────────────────────────────────────
-- 11. LABS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.labs (id, lab_code, lab_name, div_code)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'LAB-ARC-01', 'X-Ray & Thermal Analysis Lab',      'ARC'),
  ('11111111-1111-1111-1111-000000000002', 'LAB-NST-01', 'Electron Microscopy Suite',          'NST'),
  ('11111111-1111-1111-1111-000000000003', 'LAB-EEC-01', 'Electrochemistry & Optical Lab',     'EEC'),
  ('11111111-1111-1111-1111-000000000004', 'LAB-BMS-01', 'Biomaterials & Sensors Lab',         'BMS'),
  ('11111111-1111-1111-1111-000000000005', 'LAB-CPS-01', 'Corrosion Testing Lab',              'CPS'),
  ('11111111-1111-1111-1111-000000000006', 'LAB-PMD-01', 'Powder Processing & Polymer Lab',    'PMD')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- DEMO SEED (generated by scripts/generate-seed.ts)
-- Generated on first run; review then commit. Do not hand-edit.
-- ============================================================

-- committees
INSERT INTO public.committees
    (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date, created_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'Research Advisory Committee', 'Standing', 'Advise on research direction, review project proposals, and evaluate annual research output across all divisions.', 'S001', 'S002', 'Active', '2024-04-01', '2024-04-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'Equipment Procurement Review', 'AdHoc', 'Evaluate major equipment purchase proposals (>10 lakhs), assess technical specifications, and recommend vendor selection.', 'S040', 'T004', 'Active', '2025-08-15', '2025-08-15T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'PhD Progress Review Committee', 'Review', 'Review PhD student progress biannually, evaluate thesis submissions, and recommend synopsis approvals.', 'S025', 'S026', 'Active', '2023-01-10', '2023-01-10T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'Industry Collaboration Advisory Board', 'Advisory', 'Identify industry partnership opportunities, review MoUs, and guide technology transfer initiatives.', 'S012', 'S014', 'Active', '2025-01-01', '2025-01-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'Infrastructure & Safety Committee', 'Standing', 'Oversee lab infrastructure maintenance, safety compliance audits, and building facility upgrades.', 'S037', 'T002', 'Active', '2023-06-01', '2023-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- committee_members
INSERT INTO public.committee_members
    (id, committee_id, staff_id, role)
VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S001', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S012', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S040', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S045', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'H001', 'Invitee'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'S040', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'T004', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'T001', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'H002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S025', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S026', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S003', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S013', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S012', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000016', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S014', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000017', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'H002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000018', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S045', 'Invitee'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000019', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'S037', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000020', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'T002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000021', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'T003', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000022', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'H001', 'Invitee')
ON CONFLICT (id) DO NOTHING;


-- meetings
INSERT INTO public.meetings
    (id, committee_id, meeting_date, venue, title, summary, status, created_at)
VALUES
    ('cccccccc-cccc-cccc-cccc-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-04-10', 'CSIR-AMPRI Conference Hall', 'Q1 Research Review Meeting', 'Reviewed 8 project proposals. Approved 5 for funding in FY 2026-27.', 'Completed', '2026-03-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-05-07', 'Virtual — MS Teams', 'Mid-Year Research Assessment', '', 'Scheduled', '2026-04-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-06-15', 'CSIR-AMPRI Auditorium', 'Annual Research Output Evaluation', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-04-05', 'Admin Board Room', 'XRD Replacement Procurement', 'Finalized specs for Rigaku SmartLab XRD. Recommended sole-source procurement due to compatibility.', 'Completed', '2026-03-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-05-10', 'Admin Board Room', 'SEM-EDS Upgrade Evaluation', '', 'Scheduled', '2026-04-25T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-06-20', 'Admin Board Room', 'Q2 Equipment Budget Allocation', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-03-20', 'Seminar Hall', 'PhD Synopsis Review — Spring 2026', 'Reviewed 3 synopses. Approved all with minor revisions. Student presentations assessed by panel.', 'Completed', '2026-03-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-05-15', 'Seminar Hall', 'PhD Progress Presentations', '', 'Scheduled', '2026-04-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-07-01', 'Seminar Hall', 'Thesis Defense Evaluations', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-02-15', 'CSIR-AMPRI Guest House', 'Industry MoU Review — Q4 FY2025', 'Reviewed 3 MoUs with NTPC, Tata Steel, and DRDO. Recommended signing all three.', 'Completed', '2026-02-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-05-20', 'CSIR-AMPRI Guest House', 'Technology Transfer Pipeline Review', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-06-10', 'Virtual — Google Meet', 'New Partner Identification Workshop', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-03-01', 'Admin Board Room', 'Annual Safety Audit Review', 'Reviewed 12 non-conformances from 2025 audit. 10 resolved, 2 pending — assigned action items.', 'Completed', '2026-02-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-05-25', 'Admin Board Room', 'Lab Infrastructure Upgrade Planning', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-07-15', 'Admin Board Room', 'Fire Safety Drill & Equipment Audit', '', 'Scheduled', '2026-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- agenda_items
INSERT INTO public.agenda_items
    (id, meeting_id, sequence, description, proposed_by, status)
VALUES
    ('dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 1, 'Review of Q4 FY2025 research output', 'S001', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 2, 'New project proposal: Nano-refractories for steel industry', 'S002', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000003', 'cccccccc-cccc-cccc-cccc-000000000001', 3, 'Budget allocation for FY 2026-27 research programs', 'S012', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000004', 'cccccccc-cccc-cccc-cccc-000000000001', 4, 'Any other business — patent filing status update', 'S045', 'Deferred'),
    ('dddddddd-dddd-dddd-dddd-000000000005', 'cccccccc-cccc-cccc-cccc-000000000002', 1, 'Mid-year project status reports from all divisions', 'S001', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000006', 'cccccccc-cccc-cccc-cccc-000000000002', 2, 'PhD candidate recruitment plan 2027', 'S014', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000007', 'cccccccc-cccc-cccc-cccc-000000000004', 1, 'Technical specification review for new XRD system', 'S040', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000008', 'cccccccc-cccc-cccc-cccc-000000000004', 2, 'Vendor comparison: Rigaku vs. Bruker vs. PANalytical', 'T004', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000009', 'cccccccc-cccc-cccc-cccc-000000000007', 1, 'Synopsis review: Arjun Nair (Refractory Ceramics)', 'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000010', 'cccccccc-cccc-cccc-cccc-000000000007', 2, 'Synopsis review: Divya Kapoor (Energy Materials)', 'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000011', 'cccccccc-cccc-cccc-cccc-000000000013', 1, 'Non-conformance closure status review', 'S037', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000012', 'cccccccc-cccc-cccc-cccc-000000000013', 2, 'Emergency shower and eyewash station inspection report', 'T003', 'Discussed')
ON CONFLICT (id) DO NOTHING;


-- action_items
INSERT INTO public.action_items
    (id, meeting_id, source, task, assigned_to, deadline, status, completed_at, notes)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Submit revised budget proposal for Nano-refractory project', 'S002', '2026-05-20', 'Pending', NULL, 'Include consumables cost escalation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Distribute Q1 review minutes to all division heads', 'H001', '2026-05-01', 'Pending', NULL, ''),
    ('eeeeeeee-eeee-eeee-eeee-000000000003', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Obtain three vendor quotations for XRD procurement', 'T004', '2026-05-30', 'Pending', NULL, 'Rigaku quote already received'),
    ('eeeeeeee-eeee-eeee-eeee-000000000004', NULL, 'manual', 'Prepare annual equipment calibration schedule for all labs', 'T001', '2026-06-15', 'Pending', NULL, 'Coordinate with division heads for access windows'),
    ('eeeeeeee-eeee-eeee-eeee-000000000005', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Replace faulty fire extinguishers in Labs A, C, and D', 'T002', '2026-05-15', 'Pending', NULL, '2 CO2 and 1 Dry Powder type needed'),
    ('eeeeeeee-eeee-eeee-eeee-000000000006', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Compile patent filing tracker for FY 2025-26', 'S045', '2026-05-10', 'InProgress', NULL, 'Awaiting legal department confirmation on 2 filings'),
    ('eeeeeeee-eeee-eeee-eeee-000000000007', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Schedule thesis defense for Arjun Nair', 'S026', '2026-05-25', 'InProgress', NULL, 'Waiting for external examiner confirmation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000008', NULL, 'manual', 'Update chemical inventory database for all labs', 'T003', '2026-06-01', 'InProgress', NULL, 'BMS and NST labs completed, ARC pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000009', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Install additional fume hoods in Lab-C', 'S037', '2026-07-01', 'InProgress', NULL, 'Civil work in progress, electrical connection pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000010', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Draft MoU template for industry-sponsored PhD programs', 'S012', '2026-05-30', 'InProgress', NULL, 'Legal review awaited'),
    ('eeeeeeee-eeee-eeee-eeee-000000000011', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Archive closed projects documentation for CSIR audit', 'H001', '2026-04-15', 'Completed', '2026-04-10T00:00:00Z', 'All 5 closed projects documented'),
    ('eeeeeeee-eeee-eeee-eeee-000000000012', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Decommission non-operational HT furnace (E006)', 'T001', '2026-04-30', 'Completed', '2026-04-28T00:00:00Z', 'Repair order placed, furnace isolated'),
    ('eeeeeeee-eeee-eeee-eeee-000000000013', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Update PhD student handbook with new submission guidelines', 'S026', '2026-03-31', 'Completed', '2026-03-28T00:00:00Z', 'PDF shared with all supervisors'),
    ('eeeeeeee-eeee-eeee-eeee-000000000014', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Send signed MoUs to CSIR-HQ for ratification', 'H001', '2026-03-01', 'Completed', '2026-02-28T00:00:00Z', 'All 3 MoUs acknowledged by HQ'),
    ('eeeeeeee-eeee-eeee-eeee-000000000015', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Complete electrical safety audit for all buildings', 'T002', '2026-03-15', 'Completed', '2026-03-12T00:00:00Z', 'Minor issues noted in Building D, reported to maintenance')
ON CONFLICT (id) DO NOTHING;


-- meeting_documents
INSERT INTO public.meeting_documents
    (id, meeting_id, file_name, storage_path, uploaded_at)
VALUES
    ('doc-01', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Meeting_Agenda.pdf', 'committee-docs/mtg-01/agenda.pdf', '2026-03-15T00:00:00Z'),
    ('doc-02', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Review_Minutes.pdf', 'committee-docs/mtg-01/minutes.pdf', '2026-04-12T00:00:00Z'),
    ('doc-03', 'cccccccc-cccc-cccc-cccc-000000000004', 'XRD_Technical_Specs.pdf', 'committee-docs/mtg-04/specs.pdf', '2026-03-20T00:00:00Z'),
    ('doc-04', 'cccccccc-cccc-cccc-cccc-000000000007', 'PhD_Synopsis_Review_Minutes.pdf', 'committee-docs/mtg-07/minutes.pdf', '2026-03-25T00:00:00Z'),
    ('doc-05', 'cccccccc-cccc-cccc-cccc-000000000013', 'Safety_Audit_Report_2025.pdf', 'committee-docs/mtg-13/audit.pdf', '2026-02-15T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- tickets
INSERT INTO public.tickets
    (id, token, subject, category, urgency, description, submitted_by, assigned_to, status, created_at, updated_at, resolved_at)
VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-000000000001', 'AMPRI-260501-001', 'AC not working in Lab-A103', 'Infrastructure', 'High', 'The air conditioning unit in Lab-A103 has stopped cooling. Ambient temperature is affecting XRD instrument calibration.', 'T001', 'S001', 'InProgress', '2026-05-01T09:00:00Z', '2026-05-02T14:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000002', 'AMPRI-260502-001', 'Water leakage in Building D corridor', 'Infrastructure', 'Medium', 'Water seepage observed near the SEM lab entrance during rain. Needs immediate inspection to prevent equipment damage.', 'T002', 'S001', 'Open', '2026-05-02T11:00:00Z', '2026-05-02T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000003', 'AMPRI-260503-001', 'Generator backup test overdue', 'Infrastructure', 'Low', 'Quarterly generator backup test for Building A was scheduled in April but not conducted. Request rescheduling.', 'H001', 'S037', 'Open', '2026-05-03T08:00:00Z', '2026-05-03T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000004', 'AMPRI-260430-001', 'TGA-001 calibration error', 'EquipmentIT', 'High', 'Thermogravimetric Analyzer showing drift in baseline readings. Calibration failed 3 consecutive attempts. Research work halted.', 'T003', 'S012', 'InProgress', '2026-04-30T15:00:00Z', '2026-05-01T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000005', 'AMPRI-260504-001', 'Network printer not accessible from Lab-B', 'EquipmentIT', 'Medium', 'The shared network printer (HP LaserJet M507) is offline for all users in Lab-B wing. Reboot did not resolve.', 'S013', 'S012', 'Open', '2026-05-04T09:30:00Z', '2026-05-04T09:30:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000006', 'AMPRI-260415-001', 'UPS battery replacement for Lab-A servers', 'EquipmentIT', 'Critical', 'UPS batteries in server room showing end-of-life warning. Risk of data loss during power fluctuations. Needs urgent replacement.', 'S002', 'S037', 'Resolved', '2026-04-15T10:00:00Z', '2026-04-28T16:00:00Z', '2026-04-28T16:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000007', 'AMPRI-260501-002', 'Request for visitor gate pass system update', 'Administrative', 'Low', 'Current visitor gate pass system does not capture visitor purpose correctly. Request adding a remarks field to the digital form.', 'H001', 'H001', 'Open', '2026-05-01T07:00:00Z', '2026-05-01T07:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000008', 'AMPRI-260420-001', 'Stationery requisition for Q2', 'Administrative', 'Low', 'Quarterly stationery requisition for all 6 divisions. Attached the consolidated list. Approval needed by May 15.', 'H001', 'H001', 'Closed', '2026-04-20T10:00:00Z', '2026-05-05T12:00:00Z', '2026-05-02T12:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000009', 'AMPRI-260505-001', 'Leave encashment policy clarification', 'HRGrievance', 'Medium', 'Need clarification on leave encashment rules for project staff whose contracts were extended. Different interpretations from Finance and HR.', 'S003', 'H001', 'Open', '2026-05-05T12:00:00Z', '2026-05-05T12:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000010', 'AMPRI-260410-001', 'Increment not reflected in March salary', 'HRGrievance', 'High', 'My annual increment effective January 2026 was not reflected in the March 2026 salary slip. Request correction and arrears.', 'T004', 'H001', 'Resolved', '2026-04-10T14:00:00Z', '2026-04-20T09:00:00Z', '2026-04-20T09:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000011', 'AMPRI-260506-001', 'Travel advance settlement for DRDO meeting', 'Finance', 'Medium', 'Need to settle travel advance of Rs. 25,000 taken for DRDO project review meeting in Delhi on April 20-22. Bills attached.', 'S040', 'H002', 'InProgress', '2026-05-06T11:00:00Z', '2026-05-07T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000012', 'AMPRI-260425-001', 'Equipment AMC payment renewal — SEM', 'Finance', 'Critical', 'AMC for Scanning Electron Microscope (E002, Zeiss) expired. Invoice received for renewal. Payment must be processed before May 15 to avoid service gap.', 'T002', 'H002', 'InProgress', '2026-04-25T09:00:00Z', '2026-05-03T16:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000013', 'AMPRI-260330-001', 'Project fund utilization certificate for OLP-2023-01', 'Finance', 'Medium', 'Utilization certificate for project OLP-2023-01 for FY 2025-26 needs CSIR-HQ submission by April 30. Funds utilized: Rs. 21,00,000.', 'S001', 'H002', 'Closed', '2026-03-30T08:00:00Z', '2026-04-25T10:00:00Z', '2026-04-15T10:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000014', 'AMPRI-260507-001', 'Need argon gas cylinder for glovebox', 'LabResearch', 'High', 'Argon gas cylinder for glovebox in Lab-NST is empty. Thin film deposition work is blocked. Two cylinders needed — one for use, one as backup.', 'T002', 'S037', 'Open', '2026-05-07T08:00:00Z', '2026-05-07T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000015', 'AMPRI-260503-002', 'Chemical waste disposal — corrosion testing lab', 'LabResearch', 'Medium', 'Corrosion testing lab (E102) has accumulated ~15L of chemical waste from salt spray tests. Needs authorized disposal as per CSIR safety guidelines.', 'T004', 'S040', 'InProgress', '2026-05-03T14:00:00Z', '2026-05-05T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000016', 'AMPRI-260418-001', 'Request for deionized water plant maintenance', 'LabResearch', 'Low', 'DI water plant in Lab-B showing reduced output. RO membrane may need replacement. Last serviced December 2025.', 'S026', 'S037', 'Open', '2026-04-18T09:00:00Z', '2026-04-18T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000017', 'AMPRI-260502-002', 'Journal access expired — Acta Materialia', 'Library', 'High', 'Access to Acta Materialia journal through CSIR-NISTADS consortium appears to have expired. Multiple researchers unable to access recent articles.', 'S002', 'S001', 'InProgress', '2026-05-02T13:00:00Z', '2026-05-03T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000018', 'AMPRI-260506-002', 'Request to add books to library catalog', 'Library', 'Low', 'Please add the following 5 books to the CSIR-AMPRI library catalog: (list attached). Recommended by PhD supervisors for student reference.', 'S025', 'S001', 'Open', '2026-05-06T10:00:00Z', '2026-05-06T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000019', 'AMPRI-260504-002', 'Vehicle booking for field visit to Mandideep', 'Transport', 'Medium', 'Request official vehicle for field visit to industrial cluster in Mandideep on May 12. 4 staff members, full day trip.', 'S014', 'S012', 'Open', '2026-05-04T11:00:00Z', '2026-05-04T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000020', 'AMPRI-260408-001', 'Vehicle logbook discrepancy — April 2026', 'Transport', 'Low', 'Vehicle No. MP04-CA-1234 logbook shows 150km more than odometer reading for April. Request audit of fuel receipts.', 'H002', 'S012', 'Resolved', '2026-04-08T10:00:00Z', '2026-04-18T15:00:00Z', '2026-04-18T15:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ticket_responses
INSERT INTO public.ticket_responses
    (id, ticket_id, author_id, message, created_at)
VALUES
    ('bbbb2222-bbbb-bbbb-bbbb-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'S001', 'Acknowledged. I have contacted the HVAC maintenance contractor. They will inspect on May 3.', '2026-05-02T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000002', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'T001', 'Thank you. To clarify — the AC unit model is Blue Star 2TR split. The outdoor unit shows error code E3 (compressor overload). Sharing this for the technician.', '2026-05-02T14:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000003', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'S037', 'Priority approved. I have placed an order for 16 x 12V 42Ah SMF batteries. Expected delivery April 22.', '2026-04-16T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000004', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'S037', 'Batteries installed and tested. UPS runtime restored to ~45 minutes at full load. Closing this ticket.', '2026-04-28T16:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000005', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'H001', 'I have checked your records. The increment order was received from Director office on April 12. Arrears will be processed in April salary.', '2026-04-12T09:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000006', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'T004', 'Thank you. I have received the arrears in April salary. Please close the ticket.', '2026-04-20T09:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000007', 'aaaa1111-aaaa-aaaa-aaaa-000000000012', 'H002', 'Invoice verified against AMC agreement. Payment processing initiated — expected to reflect by May 10.', '2026-05-03T16:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000008', 'aaaa1111-aaaa-aaaa-aaaa-000000000004', 'S012', 'Called TA Instruments service. Engineer visit scheduled for May 5. Please ensure the instrument is powered down before the visit.', '2026-05-01T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000009', 'aaaa1111-aaaa-aaaa-aaaa-000000000015', 'S040', 'Contacted authorized waste disposal agency (MPPCB-approved). Collection scheduled for May 10. Please segregate waste by type and label containers.', '2026-05-05T11:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000010', 'aaaa1111-aaaa-aaaa-aaaa-000000000017', 'S001', 'I have raised this with CSIR-NISTADS consortium coordinator. Will update once I hear back.', '2026-05-03T10:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ticket_events
INSERT INTO public.ticket_events
    (id, ticket_id, event_type, actor_id, details, created_at)
VALUES
    ('cccc3333-cccc-cccc-cccc-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Created', 'T001', '{"token":"AMPRI-260501-001","category":"Infrastructure"}'::jsonb, '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000002', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Assigned', 'system', '{"assigned_to":"S001"}'::jsonb, '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000003', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'StatusChanged', 'S001', '{"from":"Open","to":"InProgress"}'::jsonb, '2026-05-02T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000004', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Created', 'S002', '{"token":"AMPRI-260415-001","category":"EquipmentIT"}'::jsonb, '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000005', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Assigned', 'system', '{"assigned_to":"S037"}'::jsonb, '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000006', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'StatusChanged', 'S037', '{"from":"Open","to":"InProgress"}'::jsonb, '2026-04-16T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000007', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Resolved', 'S037', '{"from":"InProgress","to":"Resolved"}'::jsonb, '2026-04-28T16:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000008', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Created', 'T004', '{"token":"AMPRI-260410-001","category":"HRGrievance"}'::jsonb, '2026-04-10T14:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000009', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Resolved', 'H001', '{"from":"Open","to":"Resolved"}'::jsonb, '2026-04-20T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000010', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Created', 'S001', '{"token":"AMPRI-260330-001","category":"Finance"}'::jsonb, '2026-03-30T08:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000011', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Closed', 'S001', '{"from":"Resolved","to":"Closed"}'::jsonb, '2026-04-25T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000012', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Created', 'H002', '{"token":"AMPRI-260408-001","category":"Transport"}'::jsonb, '2026-04-08T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000013', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Resolved', 'S012', '{"from":"Open","to":"Resolved"}'::jsonb, '2026-04-18T15:00:00Z')
ON CONFLICT (id) DO NOTHING;



-- =============================================================
-- END OF SEED DATA
-- =============================================================
-- Next steps:
--   1. Create auth users via Supabase Dashboard (Authentication > Users > Add User)
--      for each staff member who needs login access.
--   2. The on_auth_user_created trigger will auto-create user_roles (DefaultUser)
--      and user_profiles entries.
--   3. Manually assign roles via SQL or the MasterAdmin UI:
--      INSERT INTO user_roles (user_id, role, division_code)
--      VALUES ('<uuid>', 'Scientist', 'ARC');
--   4. Set active_role in user_profiles:
--      UPDATE user_profiles SET active_role = 'Scientist' WHERE user_id = '<uuid>';
-- =============================================================

-- END: seed
