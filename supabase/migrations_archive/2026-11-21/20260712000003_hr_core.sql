-- ============================================================
-- Stage 03 / 08 — HR core
-- Contains : divisions, staff, projects, phd_students (+milestones),
--            equipment, labs, project_staff, contract_staff,
--            scientific_outputs, ip_intelligence, vacancy tables,
--            IRINS sync, MOUs, tech transfers.
-- Depends  : 01 extensions_helpers, 02 auth_rbac
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================
-- Column names on the original Excel-mirror tables are quoted CamelCase
-- to match the source spreadsheet headers. Do not rename without a
-- coordinated DB migration + code change (dataMapper.ts, dataMigration.ts,
-- types/index.ts). Newer tables in this file use plain snake_case.
-- ──────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────
-- 1. CORE HR TABLES (Excel mirror — quoted CamelCase)
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
    "Remark"                   text,
    -- instruments extension
    instrument_code            text,
    serial_number               text,
    manufacturer                 text,
    year_of_manufacture          integer,
    lab_id                       uuid,   -- FK added after labs table below
    owner_user_id                uuid REFERENCES auth.users(id),
    amc_end_date                 date,
    purchase_cost                numeric(14, 2),
    procurement_date             date
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
-- 2. LABS (instruments extension) + equipment FK
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.labs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_code   text UNIQUE NOT NULL,
    lab_name   text NOT NULL,
    div_code   text REFERENCES public.divisions("divCode"),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.equipment
    ADD CONSTRAINT equipment_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id);

CREATE INDEX IF NOT EXISTS equipment_owner_idx ON public.equipment(owner_user_id);
CREATE INDEX IF NOT EXISTS equipment_lab_idx   ON public.equipment(lab_id);
CREATE INDEX IF NOT EXISTS equipment_amc_idx   ON public.equipment(amc_end_date);

-- ──────────────────────────────────────────────────────────────
-- 3. PHD MILESTONES
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.phd_milestones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_no   text NOT NULL,
    milestone       text NOT NULL CHECK (milestone IN (
                        'Joining','Coursework','Comprehensive Exam','Registration',
                        'Synopsis Submission','Thesis Submission','Viva Voce','Degree Awarded')),
    due_date        date,
    completed_date  date,
    remarks         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (enrollment_no, milestone)
);

CREATE INDEX IF NOT EXISTS phd_milestones_enrollment_idx ON public.phd_milestones(enrollment_no);

-- ──────────────────────────────────────────────────────────────
-- 4. VACANCY / RECRUITMENT (live shape — see migrations_archive/README
--    for how this diverged from the first-drafted column set)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vacancy_advertisements (
    id              text PRIMARY KEY,
    title           text NOT NULL,
    advt_no         text,
    issue_date      date,
    division_code   text REFERENCES public.divisions("divCode"),
    status          text NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Open','Published','Closed','Cancelled')),
    description     text,
    closing_date    date,
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- recruitment drive tracking
    staff_category  text NOT NULL DEFAULT 'Permanent'
                        CHECK (staff_category IN ('Permanent','Project')),
    drive_stage     text NOT NULL DEFAULT 'Advertised'
                        CHECK (drive_stage IN ('Advertised','Applications Closed','Screening',
                               'Interviews','Selection','Offers Issued','Joined','Closed'))
);

CREATE TABLE IF NOT EXISTS public.vacancy_posts (
    id               text PRIMARY KEY,
    advertisement_id text NOT NULL REFERENCES public.vacancy_advertisements(id) ON DELETE CASCADE,
    post_code        text,
    designation      text,
    discipline       text,
    no_of_positions  integer,
    pay_level        text,
    age_limit        text,
    qualifications   text,
    status           text CHECK (status IS NULL OR status IN ('Open','Filled','Closed','Cancelled')),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacancy_advertisements_status_idx
    ON public.vacancy_advertisements(status);
CREATE INDEX IF NOT EXISTS vacancy_posts_advertisement_id_idx
    ON public.vacancy_posts(advertisement_id);

-- ──────────────────────────────────────────────────────────────
-- 5. IRINS SYNC
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.irins_profiles (
    vidwan_id    text PRIMARY KEY,
    profile_data jsonb NOT NULL,
    synced_at    timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS irins_sync_log_started_idx ON public.irins_sync_log(started_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 6. MOUs + TECH TRANSFERS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mous (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name       text NOT NULL,
    partner_type       text NOT NULL DEFAULT 'Other'
                       CHECK (partner_type IN ('Academic','Industry','Government','International','Other')),
    purpose            text NOT NULL DEFAULT '',
    signed_date        date,
    valid_until        date,
    status             text NOT NULL DEFAULT 'Active'
                       CHECK (status IN ('Active','Expired','Under Renewal','Terminated')),
    division_code      text,
    linked_project_no  text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mous_status_idx ON public.mous(status);
CREATE INDEX IF NOT EXISTS mous_valid_until_idx ON public.mous(valid_until);

CREATE TABLE IF NOT EXISTS public.tech_transfers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    technology_title   text NOT NULL,
    licensee           text NOT NULL,
    licensee_type      text NOT NULL DEFAULT 'Other'
                       CHECK (licensee_type IN ('Industry','Startup','PSU','Government','Other')),
    agreement_type     text NOT NULL DEFAULT 'License'
                       CHECK (agreement_type IN ('License','Know-how Transfer','Joint Development','Consultancy','Sponsored')),
    agreement_date     date,
    value_lakhs        numeric(12,2) CHECK (value_lakhs >= 0),
    status             text NOT NULL DEFAULT 'Signed'
                       CHECK (status IN ('Under Negotiation','Signed','Active','Completed','Terminated')),
    linked_project_no  text,
    linked_ip_id       text,
    division_code      text,
    remarks            text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tech_transfers_status_idx ON public.tech_transfers(status);
CREATE INDEX IF NOT EXISTS tech_transfers_division_idx ON public.tech_transfers(division_code);

-- ──────────────────────────────────────────────────────────────
-- 7. TRIGGERS
-- ──────────────────────────────────────────────────────────────

CREATE TRIGGER trg_mous_updated_at
    BEFORE UPDATE ON public.mous
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

CREATE TRIGGER trg_tech_transfers_updated_at
    BEFORE UPDATE ON public.tech_transfers
    FOR EACH ROW EXECUTE FUNCTION pms_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.divisions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phd_students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_staff         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scientific_outputs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_intelligence        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phd_milestones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacancy_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irins_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irins_sync_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mous                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_transfers         ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated. Write: HRAdmin + SystemAdmin (+ MasterAdmin
-- where noted) — this mirrors the original init.sql grants exactly.
CREATE POLICY "divisions_select"          ON public.divisions          FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_select"              ON public.staff              FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_select"           ON public.projects           FOR SELECT TO authenticated USING (true);
CREATE POLICY "phd_students_select"       ON public.phd_students       FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipment_select"          ON public.equipment          FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_staff_select"      ON public.project_staff      FOR SELECT TO authenticated USING (true);
CREATE POLICY "contract_staff_select"     ON public.contract_staff     FOR SELECT TO authenticated USING (true);
CREATE POLICY "scientific_outputs_select" ON public.scientific_outputs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_intelligence_select"    ON public.ip_intelligence    FOR SELECT TO authenticated USING (true);
CREATE POLICY "phd_milestones_select"     ON public.phd_milestones     FOR SELECT TO authenticated USING (true);
CREATE POLICY "mous_select"               ON public.mous               FOR SELECT TO authenticated USING (true);
CREATE POLICY "tech_transfers_select"     ON public.tech_transfers     FOR SELECT TO authenticated USING (true);
CREATE POLICY "vacancy_advertisements_select" ON public.vacancy_advertisements FOR SELECT TO authenticated USING (true);
CREATE POLICY "vacancy_posts_select"          ON public.vacancy_posts          FOR SELECT TO authenticated USING (true);

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

-- projects / phd_students / project_staff had RLS enabled but no write
-- policy in the very first version of this schema (admin writes returned
-- permission denied until this was noticed and fixed) — included directly
-- here since this is the current live shape.
CREATE POLICY "projects_write"
    ON public.projects FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "project_staff_write"
    ON public.project_staff FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "phd_students_write"
    ON public.phd_students FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "phd_milestones_write" ON public.phd_milestones FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "mous_write" ON public.mous FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "tech_transfers_write" ON public.tech_transfers FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "vacancy_advertisements_write"
    ON public.vacancy_advertisements FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY "vacancy_posts_write"
    ON public.vacancy_posts FOR ALL TO authenticated
    USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY labs_read_authenticated ON public.labs
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY labs_admin_write ON public.labs
    FOR ALL USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY equipment_admin_write ON public.equipment
    FOR ALL USING (public.user_has_role('HRAdmin') OR public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

CREATE POLICY irins_profiles_read_authenticated ON public.irins_profiles
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY irins_profiles_admin_write ON public.irins_profiles
    FOR ALL USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_profiles_service_write ON public.irins_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY irins_sync_log_read_authenticated ON public.irins_sync_log
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY irins_sync_log_admin_write ON public.irins_sync_log
    FOR ALL USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY irins_sync_log_service_write ON public.irins_sync_log
    FOR ALL USING (auth.role() = 'service_role');
