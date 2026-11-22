-- ═══════════════════════════════════════════════════════════════════════
-- 20260718000004_review_fixes
-- Fixes from a full migration-history design review (2026-07-18):
--   1. proposal_link_project validated against a nonexistent table
--   2. PMS/committee storage buckets skipped ownership checks their
--      metadata tables already enforce
--   3. PMS tables referencing auth.users had no FK constraint
--   4. Non-management roles couldn't create their own Personal calendar events
--   5. Duplicate "is admin" / "caller division" helper functions
--      (this migration's own 20260718000001 re-derived what stage 06
--      already had) — consolidated to one canonical implementation
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. proposal_link_project: fix dead existence check ────────────────
-- "ProjectInfo" is the frontend TypeScript type name, not a table — the
-- real table is public.projects (stage 03). to_regclass('public."ProjectInfo"')
-- always returned NULL, so this validation silently never ran; any
-- project_no was accepted when linking a proposal.

CREATE OR REPLACE FUNCTION public.proposal_link_project(p_id uuid, p_project_no text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text;
  v_exists boolean;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_project_no IS NULL OR length(trim(p_project_no)) = 0 THEN
    RAISE EXCEPTION 'project_no_required';
  END IF;
  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.projects WHERE "ProjectNo" = $1)'
      INTO v_exists USING p_project_no;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'project_not_found';
    END IF;
  END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'OM_ISSUED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> LINKED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'LINKED',
         linked_project_no     = p_project_no,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'OM_ISSUED', 'LINKED',
          jsonb_build_object('linked_project_no', p_project_no), auth.uid());
END;
$$;

-- ── 2. Storage: ownership-scope the signatures / annexures / ─────────────
--        committee-docs SELECT policies ─────────────────────────────────
-- pms_owns_report_path() already exists and gates INSERT/UPDATE/DELETE on
-- the signatures/annexures buckets — it just wasn't applied to SELECT,
-- so any authenticated user who obtained a <report_id>/<file> path could
-- read the object directly, bypassing the pms_reports-level visibility
-- the metadata tables enforce. Not SECURITY DEFINER: relies on the
-- caller's own RLS-filtered view of pms_reports (reports_select), so the
-- predicate never drifts out of sync with that policy.
CREATE OR REPLACE FUNCTION public.pms_can_read_report_path(p_path text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pms_reports r
    WHERE r.id::text = split_part(p_path, '/', 1)
  );
$$;

DROP POLICY IF EXISTS "pms_signatures_select" ON storage.objects;
CREATE POLICY "pms_signatures_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signatures' AND public.pms_can_read_report_path(name));

DROP POLICY IF EXISTS "pms_annexures_select" ON storage.objects;
CREATE POLICY "pms_annexures_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'annexures' AND public.pms_can_read_report_path(name));

-- committee-docs: meeting_documents_select is already USING(true) (Committees
-- is an ALL_ROLES page by design), so this isn't a visibility restriction —
-- it closes the gap where a stray/orphaned storage object with no matching
-- registry row was readable by path alone.
DROP POLICY IF EXISTS "committee_docs_select" ON storage.objects;
CREATE POLICY "committee_docs_select" ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'committee-docs'
    AND EXISTS (SELECT 1 FROM public.meeting_documents md WHERE md.storage_path = name)
);

-- ── 3. PMS: add missing FKs to auth.users ──────────────────────────────
-- These columns were commented "-- FK → auth.users" but had no actual
-- constraint. RESTRICT (not CASCADE) for audit-grade rows — deleting a
-- user should never silently erase appraisal history; notifications are
-- the one disposable exception.
ALTER TABLE public.pms_reports
    ADD CONSTRAINT pms_reports_scientist_id_fkey
        FOREIGN KEY (scientist_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_evaluations
    ADD CONSTRAINT pms_evaluations_evaluator_id_fkey
        FOREIGN KEY (evaluator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_notifications
    ADD CONSTRAINT pms_notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pms_committee_decisions
    ADD CONSTRAINT pms_committee_decisions_decided_by_fkey
        FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_evaluation_committee_members
    ADD CONSTRAINT pms_evaluation_committee_members_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_empowered_committee_members
    ADD CONSTRAINT pms_empowered_committee_members_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_grievance_members
    ADD CONSTRAINT pms_grievance_members_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.pms_representations
    ADD CONSTRAINT pms_representations_scientist_id_fkey
        FOREIGN KEY (scientist_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
    ADD CONSTRAINT pms_representations_resolved_by_fkey
        FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 4. Calendar: allow any user to create their own Personal events ───
-- The SELECT policy's `visibility = 'Personal' AND created_by = auth.uid()`
-- branch implies any user should have personal events, but INSERT required
-- a management role regardless of visibility — a plain Scientist could
-- never create even a personal entry. Management roles keep unrestricted
-- insert (OrgWide/Division/Personal); everyone else may insert Personal only.
DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
CREATE POLICY "calendar_events_insert" ON public.calendar_events FOR INSERT
TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND (
        visibility = 'Personal'
        OR public.user_has_role('HRAdmin')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('Director')
        OR public.user_has_role('HOD')
        OR public.user_has_role('DivisionHead')
        OR public.user_has_role('MasterAdmin')
    )
);

-- ── 5. Consolidate duplicate "caller" helpers ──────────────────────────
-- Three independent implementations of "is HRAdmin/SystemAdmin/MasterAdmin"
-- existed (pms_is_admin, proposals_caller_is_admin, and this migration's own
-- caller_is_admin from 20260718000001) plus two copies of the division
-- resolver. Keep proposals_caller_* as canonical (oldest, most-referenced);
-- redefine the rest as thin wrappers. CREATE OR REPLACE only — never drop,
-- since RLS policies already live reference these exact names.
CREATE OR REPLACE FUNCTION pms_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT public.proposals_caller_is_admin();
$$;

CREATE OR REPLACE FUNCTION public.caller_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.proposals_caller_has_role(p_role);
$$;

CREATE OR REPLACE FUNCTION public.caller_division()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT public.proposals_caller_division();
$$;

CREATE OR REPLACE FUNCTION public.caller_is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.proposals_caller_is_admin();
$$;
