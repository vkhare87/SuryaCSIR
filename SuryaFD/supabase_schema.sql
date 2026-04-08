-- Run this script in your Supabase SQL Editor to create the necessary tables for SURYA
-- This maps exactly to the provided Excel schemas

-- 1. Divisions Table
CREATE TABLE IF NOT EXISTS public.divisions (
    "divCode" text PRIMARY KEY,
    "divName" text,
    "divDescription" text,
    "divResearchAreas" text,
    "divHoD" text,
    "divHoDID" text,
    "divSanctionedstrength" integer,
    "divCurrentStrength" integer,
    "divStatus" text
);

-- 2. Staff Table
CREATE TABLE IF NOT EXISTS public.staff (
    "ID" text PRIMARY KEY,
    "LabCode" text,
    "EmployeeType" text,
    "Name" text,
    "Designation" text,
    "Group" text,
    "Division" text,
    "DoAPP" text,
    "DOJ" text,
    "DOB" text,
    "Cat" text,
    "AppointmentType" text,
    "Level" text,
    "CoreArea" text,
    "Expertise" text,
    "Email" text,
    "Ext" text,
    "VidwanID" text,
    "ReportingID" text,
    "HighestQualification" text
);

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    "ProjectID" text PRIMARY KEY,
    "ProjectNo" text,
    "ProjectName" text,
    "FundType" text,
    "SponsorerType" text,
    "SponsorerName" text,
    "ProjectCategory" text,
    "ProjectStatus" text,
    "StartDate" text,
    "CompletioDate" text,
    "SanctionedCost" text,
    "UtilizedAmount" text,
    "PrincipalInvestigator" text,
    "DivisionCode" text,
    "Extension" text,
    "ApprovalAuthority" text
);

-- 4. PhD Students Table
CREATE TABLE IF NOT EXISTS public.phd_students (
    "EnrollmentNo" text PRIMARY KEY,
    "StudentName" text,
    "Specialization" text,
    "SupervisorName" text,
    "CoSupervisorName" text,
    "FellowshipDetails" text,
    "CurrentStatus" text,
    "ThesisTitle" text,
    "ProjectNo" text
);

-- 5. Equipment Table
CREATE TABLE IF NOT EXISTS public.equipment (
    "UInsID" text PRIMARY KEY,
    "Name" text,
    "EndUse" text,
    "Division" text,
    "IndenterName" text,
    "OperatorName" text,
    "Location" text,
    "WorkingStatus" text,
    "Movable" text,
    "RequirementInstallation" text,
    "Justification" text,
    "Remark" text
);

-- Note: Enable Row Level Security (RLS) if required for your use case
-- ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 6. Project Staff Table
CREATE TABLE IF NOT EXISTS public.project_staff (
    "id" text PRIMARY KEY,
    "StaffName" text,
    "Designation" text,
    "RecruitmentCycle" text,
    "DateOfJoining" text,
    "DateOfProjectDuration" text,
    "ProjectNo" text,
    "PIName" text
);

-- ============================================================
-- Phase 2: Authentication & RBAC additions
-- Run after initial schema creation
-- ============================================================

-- user_roles: maps Supabase Auth user IDs to SURYA application roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          text NOT NULL CHECK (role IN (
                      'Director', 'DivisionHead', 'Scientist',
                      'Technician', 'HRAdmin', 'FinanceAdmin', 'SystemAdmin'
                  )),
    division_code text NULL,          -- NULL for Director, HRAdmin, FinanceAdmin, SystemAdmin
    last_seen_at  timestamptz NULL    -- updated on each sign-in by the client; used for audit log
);

-- Index on division_code for fast DivisionHead/Technician lookups
CREATE INDEX IF NOT EXISTS user_roles_division_code_idx
    ON public.user_roles(division_code);

-- RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own role"
    ON public.user_roles FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY "SystemAdmin can read all roles"
    ON public.user_roles FOR SELECT TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid())) = 'SystemAdmin'
    );

CREATE POLICY "SystemAdmin can insert roles"
    ON public.user_roles FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid())) = 'SystemAdmin'
    );

CREATE POLICY "SystemAdmin can update roles"
    ON public.user_roles FOR UPDATE TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid())) = 'SystemAdmin'
    )
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid())) = 'SystemAdmin'
    );

CREATE POLICY "SystemAdmin can delete roles"
    ON public.user_roles FOR DELETE TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid())) = 'SystemAdmin'
    );

-- Allow any authenticated user to update only their own last_seen_at (for login audit trail)
CREATE POLICY "Users can update own last_seen_at"
    ON public.user_roles FOR UPDATE TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

-- Enable RLS on all existing data tables (read-only for authenticated users)
-- Client-side filtering in DataContext handles role-scoping on top of these policies.
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phd_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read divisions"
    ON public.divisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read staff"
    ON public.staff FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read projects"
    ON public.projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read phd_students"
    ON public.phd_students FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read equipment"
    ON public.equipment FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read project_staff"
    ON public.project_staff FOR SELECT TO authenticated USING (true);

-- Write policy: HRAdmin and SystemAdmin can insert/update/delete staff records
CREATE POLICY "HRAdmin and SystemAdmin can write staff"
    ON public.staff FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    )
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    );

-- ============================================================
-- Phase 3: Data Management — scientific_outputs, ip_intelligence, Gender
-- ============================================================

-- 7. Scientific Outputs Table
CREATE TABLE IF NOT EXISTS public.scientific_outputs (
    id             text PRIMARY KEY,
    title          text NOT NULL,
    authors        text[] NOT NULL DEFAULT '{}',
    journal        text NOT NULL,
    year           integer NOT NULL,
    doi            text NULL,
    impact_factor  float NULL,
    citation_count integer NULL,
    division_code  text NOT NULL
);

-- 8. IP Intelligence Table
CREATE TABLE IF NOT EXISTS public.ip_intelligence (
    id             text PRIMARY KEY,
    title          text NOT NULL,
    type           text NOT NULL CHECK (type IN ('Patent','Copyright','Design','Trademark')),
    status         text NOT NULL CHECK (status IN ('Filed','Published','Granted')),
    filing_date    text NOT NULL,
    grant_date     text NULL,
    inventors      text[] NOT NULL DEFAULT '{}',
    division_code  text NOT NULL
);

-- Gender column for staff table (Concern #9)
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS "Gender" text;

-- RLS for new tables
ALTER TABLE public.scientific_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scientific_outputs"
    ON public.scientific_outputs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read ip_intelligence"
    ON public.ip_intelligence FOR SELECT TO authenticated USING (true);

-- Write policies: HRAdmin and SystemAdmin can INSERT/UPDATE/DELETE
CREATE POLICY "HRAdmin and SystemAdmin can write scientific_outputs"
    ON public.scientific_outputs FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    )
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    );

CREATE POLICY "HRAdmin and SystemAdmin can write ip_intelligence"
    ON public.ip_intelligence FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    )
    WITH CHECK (
        (SELECT role FROM public.user_roles WHERE user_id = (select auth.uid()))
        IN ('HRAdmin', 'SystemAdmin')
    );
