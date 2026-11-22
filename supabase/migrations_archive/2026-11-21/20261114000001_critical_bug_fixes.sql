-- ============================================================
-- 20261114000001_critical_bug_fixes
-- Fixes identified during codebase security & bug review:
--   1. Gate public.project_lessons view with public.caller_is_verified()
--      so unverified accounts (Guest / DefaultUser) cannot read institutional
--      completion lessons and follow-on R&D ideas.
--   2. Add documents.processing_started_at so requeue_stale_processing()
--      measures claim duration instead of document created_at.
--   3. Provide transactional RPCs pms_save_awp_activities and
--      proposal_save_copis so replace-all saves are atomic.
-- ============================================================

-- ── 1. Verified gate on project_lessons ────────────────────────────────────
CREATE OR REPLACE VIEW public.project_lessons
WITH (security_invoker = false) AS
SELECT r.project_id, p."ProjectNo" AS project_no, p."ProjectName" AS project_name,
       p."DivisionCode" AS division_code, p."PrincipalInvestigator" AS pi_name, p.track, p.stage,
       p.start_date, p.end_date, r.summary, r.objectives_status, r.objectives_reason, r.what_worked, r.what_did_not,
       r.reusable_assets, r.trl_target, r.trl_reached, r.recommendations, r.follow_on_ideas,
       r.decided_at AS approved_at, r.published_document_id
  FROM public.project_completion_reports r
  JOIN public.projects p ON p."ProjectID" = r.project_id
 WHERE r.status = 'APPROVED'
   AND public.caller_is_verified();

REVOKE ALL ON public.project_lessons FROM PUBLIC, anon;
GRANT SELECT ON public.project_lessons TO authenticated, service_role;

-- ── 2. Claim timestamp for RAG ingest stale-processing recovery ───────────
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.rag_requeue_document(p_doc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.documents
     SET ingest_status = 'pending',
         ingest_error = NULL,
         ingest_attempts = 0,
         processing_started_at = NULL
   WHERE id = p_doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rag_requeue_all()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.documents
     SET ingest_status = 'pending',
         ingest_error = NULL,
         ingest_attempts = 0,
         processing_started_at = NULL
   WHERE ingest_status IN ('indexed', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rag_requeue_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_requeue_document(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rag_requeue_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rag_requeue_all() TO authenticated, service_role;

-- ── 3. Atomic replace-all RPCs ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pms_save_awp_activities(
    p_report_id  uuid,
    p_activities jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report not found';
    END IF;
    IF v_report.scientist_id <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your report';
    END IF;
    IF v_report.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Activities can only be saved on a DRAFT report';
    END IF;
    IF p_activities IS NOT NULL AND jsonb_typeof(p_activities) <> 'array' THEN
        RAISE EXCEPTION 'p_activities must be a JSON array';
    END IF;

    DELETE FROM public.pms_awp_activities WHERE report_id = p_report_id;

    IF jsonb_array_length(coalesce(p_activities, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.pms_awp_activities (
            report_id, nature_of_activity, role, time_committed_percentage, milestones
        )
        SELECT p_report_id,
               x.nature_of_activity,
               x.role,
               x.time_committed_percentage,
               coalesce(x.milestones, '[]'::jsonb)
          FROM jsonb_to_recordset(p_activities) AS x(
              nature_of_activity text,
              role text,
              time_committed_percentage numeric,
              milestones jsonb
          );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_save_awp_activities(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_save_awp_activities(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proposal_save_copis(
    p_proposal_id uuid,
    p_copis       jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_p public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposal not found';
    END IF;
    IF v_p.created_by <> (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Not your proposal';
    END IF;
    IF v_p.status NOT IN ('DRAFT', 'REVISION_REQUESTED', 'RETURNED') THEN
        RAISE EXCEPTION 'Co-PIs can only be modified while DRAFT or REVISION_REQUESTED';
    END IF;
    IF p_copis IS NOT NULL AND jsonb_typeof(p_copis) <> 'array' THEN
        RAISE EXCEPTION 'p_copis must be a JSON array';
    END IF;

    DELETE FROM public.proposal_copis WHERE proposal_id = p_proposal_id;

    IF jsonb_array_length(coalesce(p_copis, '[]'::jsonb)) > 0 THEN
        INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
        SELECT p_proposal_id, x.staff_id, x.staff_name
          FROM jsonb_to_recordset(p_copis) AS x(staff_id text, staff_name text);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_save_copis(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_save_copis(uuid, jsonb) TO authenticated, service_role;
