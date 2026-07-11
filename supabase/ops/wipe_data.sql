-- =============================================================
-- OPS: wipe all application data (preserve schema)
-- =============================================================
-- WARNING: TRUNCATEs every application table. Rows lost. Schema
-- untouched. Idempotent — safe to re-run.
--
-- auth.users (Supabase Auth) cannot be truncated via SQL. Clear
-- it from the Supabase Dashboard:
--   Authentication → Users → select all → delete
-- That cascades to user_roles and user_profiles automatically
-- via ON DELETE CASCADE.
--
-- Run as: postgres role in Supabase SQL Editor (bypasses RLS).
-- =============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. PMS TABLES (children before parents)
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE pms_notifications        CASCADE;
TRUNCATE TABLE pms_audit_logs           CASCADE;
TRUNCATE TABLE pms_committee_decisions  CASCADE;
TRUNCATE TABLE pms_representations      CASCADE;
TRUNCATE TABLE pms_evaluations          CASCADE;
TRUNCATE TABLE pms_annexures            CASCADE;
TRUNCATE TABLE pms_awp_activities       CASCADE;
TRUNCATE TABLE pms_report_sections      CASCADE;
TRUNCATE TABLE pms_evaluation_committee_members CASCADE;
TRUNCATE TABLE pms_evaluation_committees CASCADE;
TRUNCATE TABLE pms_grievance_members    CASCADE;
TRUNCATE TABLE pms_empowered_committee_members CASCADE;
TRUNCATE TABLE pms_reports              CASCADE;
TRUNCATE TABLE appraisal_cycles         CASCADE;


-- ──────────────────────────────────────────────────────────────
-- 2. HELPDESK + COMMITTEES (children before parents)
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE ticket_events            CASCADE;
TRUNCATE TABLE ticket_responses         CASCADE;
TRUNCATE TABLE tickets                  CASCADE;
TRUNCATE TABLE helpdesk_routing         CASCADE;

TRUNCATE TABLE meeting_documents        CASCADE;
TRUNCATE TABLE action_items             CASCADE;
TRUNCATE TABLE agenda_items             CASCADE;
TRUNCATE TABLE meetings                 CASCADE;
TRUNCATE TABLE committee_members        CASCADE;
TRUNCATE TABLE committees               CASCADE;

TRUNCATE TABLE audit_log                CASCADE;


-- ──────────────────────────────────────────────────────────────
-- 3. RECRUITMENT + IRINS
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE vacancy_posts            CASCADE;
TRUNCATE TABLE vacancy_advertisements   CASCADE;

TRUNCATE TABLE irins_sync_log           CASCADE;
TRUNCATE TABLE irins_profiles           CASCADE;


-- ──────────────────────────────────────────────────────────────
-- 4. HR TABLES (no inter-table FKs — order does not matter)
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE scientific_outputs       CASCADE;
TRUNCATE TABLE ip_intelligence          CASCADE;
TRUNCATE TABLE contract_staff           CASCADE;
TRUNCATE TABLE project_staff            CASCADE;
TRUNCATE TABLE equipment                CASCADE;
TRUNCATE TABLE labs                     CASCADE;
TRUNCATE TABLE phd_students             CASCADE;
TRUNCATE TABLE projects                 CASCADE;
TRUNCATE TABLE staff                    CASCADE;
TRUNCATE TABLE divisions                CASCADE;


-- ──────────────────────────────────────────────────────────────
-- 5. AUTH / RBAC (FK → auth.users with ON DELETE CASCADE)
-- ──────────────────────────────────────────────────────────────
-- If auth.users is cleared via Dashboard, these are emptied
-- automatically. Explicit TRUNCATE here covers seeded test rows
-- inserted without a matching auth.users entry.

TRUNCATE TABLE user_roles               CASCADE;
TRUNCATE TABLE user_profiles            CASCADE;

COMMIT;
