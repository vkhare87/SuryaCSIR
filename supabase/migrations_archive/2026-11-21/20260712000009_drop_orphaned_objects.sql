-- ============================================================
-- Stage 09 — Drop orphaned live-only objects
-- Removes objects that existed on the live project but were never
-- represented in any migration file (current baseline or archived
-- history) and have zero references in the app codebase. Found during
-- the 2026-07-12 baseline verification pass — see
-- docs/superpowers/specs/2026-07-11-db-file-restructure-design.md.
-- Depends  : 01-08 (drops only)
-- ============================================================

-- `events` table: 0 rows, no app code references (calendar_events is the
-- table actually used — see stage 07). Left over from an early prototype.
DROP TABLE IF EXISTS public.events CASCADE;

-- current_user_role(): dead helper, nothing in the app calls it. Five
-- pre-migration legacy policies still reference it, functionally redundant
-- with policies the baseline already creates on the same tables
-- (hr_data_write, projects_write, project_staff_write, phd_students_write,
-- equipment_admin_write, all stage 03) — same HRAdmin/SystemAdmin write
-- access, just via user_has_role() instead. Drop the duplicates, then the
-- function they depend on.
DROP POLICY IF EXISTS "HRAdmin and SystemAdmin can write divisions"     ON public.divisions;
DROP POLICY IF EXISTS "HRAdmin and SystemAdmin can write projects"      ON public.projects;
DROP POLICY IF EXISTS "HRAdmin and SystemAdmin can write project_staff" ON public.project_staff;
DROP POLICY IF EXISTS "HRAdmin and SystemAdmin can write phd_students"  ON public.phd_students;
DROP POLICY IF EXISTS "HRAdmin and SystemAdmin can write equipment"     ON public.equipment;

DROP FUNCTION IF EXISTS public.current_user_role();

-- wipe_domain_data(): admin wipe RPC, unreferenced by the app (the actual
-- wipe path is supabase/ops/wipe_data.sql, run by hand). Also broken as of
-- the PMS 2026 migration — it TRUNCATEs pms_collegiums/pms_collegium_members/
-- pms_chairman_reviews, tables renamed/dropped by 20260712000004_pms.sql.
DROP FUNCTION IF EXISTS public.wipe_domain_data(text);

-- rls_auto_enable() / ensure_rls event trigger: a safety net that
-- auto-enabled RLS on any new public table, compensating for the
-- SQL-editor-paste workflow. That workflow is retired (see
-- supabase/ops/README.md, "Adopting the Supabase CLI") — every table in
-- the baseline already has explicit ENABLE ROW LEVEL SECURITY, and all
-- future schema changes go through tracked migrations, not ad-hoc DDL.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();
