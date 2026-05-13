-- =============================================================
-- SURYA — Wipe All Data (preserve schema)
-- =============================================================
-- WARNING: This script TRUNCATES every application table.
--          All rows are permanently deleted. Schema is untouched.
--
-- Safe to run multiple times (idempotent).
--
-- NOTE: auth.users (Supabase Auth) cannot be truncated via SQL.
--       Clear auth users separately through the Supabase Dashboard:
--       Authentication → Users → select all → delete.
--       Clearing auth.users will CASCADE-delete user_roles and
--       user_profiles automatically (ON DELETE CASCADE FKs).
--
-- Run as: postgres role in Supabase SQL Editor (bypasses RLS).
-- =============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. PMS TABLES (children before parents due to FK constraints)
-- ──────────────────────────────────────────────────────────────

-- Leaf tables (FK → pms_reports)
TRUNCATE TABLE pms_notifications        CASCADE;
TRUNCATE TABLE pms_audit_logs           CASCADE;
TRUNCATE TABLE pms_committee_decisions  CASCADE;
TRUNCATE TABLE pms_chairman_reviews     CASCADE;
TRUNCATE TABLE pms_evaluations          CASCADE;
TRUNCATE TABLE pms_annexures            CASCADE;
TRUNCATE TABLE pms_report_sections      CASCADE;

-- Collegium members before collegiums
TRUNCATE TABLE pms_collegium_members    CASCADE;
TRUNCATE TABLE pms_collegiums           CASCADE;

-- Reports before cycles
TRUNCATE TABLE pms_reports              CASCADE;
TRUNCATE TABLE appraisal_cycles         CASCADE;

-- ──────────────────────────────────────────────────────────────
-- 2. HR TABLES (no inter-table FKs — order does not matter)
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE scientific_outputs       CASCADE;
TRUNCATE TABLE ip_intelligence          CASCADE;
TRUNCATE TABLE contract_staff           CASCADE;
TRUNCATE TABLE project_staff            CASCADE;
TRUNCATE TABLE equipment                CASCADE;
TRUNCATE TABLE phd_students             CASCADE;
TRUNCATE TABLE projects                 CASCADE;
TRUNCATE TABLE staff                    CASCADE;
TRUNCATE TABLE divisions                CASCADE;

-- ──────────────────────────────────────────────────────────────
-- 3. AUTH / RBAC TABLES
-- ──────────────────────────────────────────────────────────────
-- These FK → auth.users with ON DELETE CASCADE.
-- Truncating here covers the case where rows were inserted
-- without a matching auth.users entry (e.g. seeded test data).
-- If auth.users is cleared via Dashboard, these tables are
-- cascade-emptied automatically.
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE user_roles               CASCADE;
TRUNCATE TABLE user_profiles            CASCADE;

COMMIT;
