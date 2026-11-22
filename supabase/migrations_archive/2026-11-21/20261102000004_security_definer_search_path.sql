-- ============================================================
-- 20261102000004_security_definer_search_path
-- BUG-07: these SECURITY DEFINER functions ran with the caller's search_path.
-- Header change only (ALTER, not CREATE OR REPLACE), so no body is copied and
-- no later fix to a body can be undone by this file. None of them calls a
-- pgcrypto function unqualified, so `public` is enough.
-- List derived mechanically (prosecdef AND no search_path in proconfig).
-- Tests: scripts/db/schema.db.test.ts.
-- ============================================================
BEGIN;

ALTER FUNCTION public.admin_set_user_roles(uuid,text[],text,text) SET search_path = public;
ALTER FUNCTION public.approve_access_request(uuid,text[],text) SET search_path = public;
ALTER FUNCTION public.pms_assign_evaluators(uuid,uuid) SET search_path = public;
ALTER FUNCTION public.pms_check_evaluation_complete() SET search_path = public;
ALTER FUNCTION public.pms_committee_panel_valid(uuid) SET search_path = public;
ALTER FUNCTION public.pms_empowered_committee_valid(uuid) SET search_path = public;
ALTER FUNCTION public.pms_finalize_report(uuid,integer,text,text,text,text) SET search_path = public;
ALTER FUNCTION public.pms_is_admin() SET search_path = public;
ALTER FUNCTION public.pms_is_evaluation_committee_member(uuid) SET search_path = public;
ALTER FUNCTION public.pms_is_grievance_member(uuid) SET search_path = public;
ALTER FUNCTION public.pms_mark_not_assessed(uuid,text) SET search_path = public;
ALTER FUNCTION public.pms_owns_report_path(text) SET search_path = public;
ALTER FUNCTION public.pms_record_non_submission(uuid,text) SET search_path = public;
ALTER FUNCTION public.pms_resolve_representation(uuid,text,integer,text,text,text) SET search_path = public;
ALTER FUNCTION public.pms_set_duty_days(uuid,integer) SET search_path = public;
ALTER FUNCTION public.pms_submit_representation(uuid,text) SET search_path = public;
ALTER FUNCTION public.reject_access_request(uuid,text) SET search_path = public;
ALTER FUNCTION public.unlock_meeting_minutes(uuid) SET search_path = public;
ALTER FUNCTION public.user_has_role(text) SET search_path = public;

COMMIT;
