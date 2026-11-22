-- ============================================================
-- Stage 06 / 08 — Proposals & Project Progress Reports
-- Contains : role/division helper functions (used by this stage and
--            by stage 08 rag_documents), proposals workflow, project
--            progress reports workflow.
-- Depends  : 01 extensions_helpers, 02 auth_rbac, 03 hr_core (staff)
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ROLE / DIVISION HELPERS
-- ──────────────────────────────────────────────────────────────
-- Named for their proposals origin but reused as the general-purpose
-- role/division helpers by project_reports (this file) and documents/RAG
-- (stage 08) — they read only user_roles/user_profiles, nothing
-- proposal-specific.

CREATE OR REPLACE FUNCTION public.proposals_caller_has_role(p_role text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.proposals_caller_division()
RETURNS text
LANGUAGE sql STABLE
AS $$
  -- division_code lives on user_roles, scoped by the user's active_role.
  SELECT ur.division_code
    FROM public.user_roles ur
    JOIN public.user_profiles up ON up.user_id = ur.user_id
   WHERE ur.user_id = auth.uid()
     AND ur.role = up.active_role
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.proposals_caller_is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT public.proposals_caller_has_role('HRAdmin')
      OR public.proposals_caller_has_role('SystemAdmin')
      OR public.proposals_caller_has_role('MasterAdmin');
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. PROPOSALS
-- ──────────────────────────────────────────────────────────────

CREATE TABLE public.proposals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_code               text UNIQUE NOT NULL,

  title                       text NOT NULL,
  acronym                     text,
  domain_theme                text NOT NULL,
  fund_type                   text NOT NULL,
  sponsor_type                text NOT NULL,
  sponsor_name                text NOT NULL,
  project_category            text NOT NULL,
  proposed_start_date         date NOT NULL,
  proposed_duration_months    int  NOT NULL CHECK (proposed_duration_months > 0),
  requested_budget            numeric(14,2) NOT NULL CHECK (requested_budget >= 0),
  pi_user_id                  uuid NOT NULL REFERENCES auth.users(id),
  pi_name                     text NOT NULL,
  division_code               text NOT NULL,
  abstract                    text NOT NULL,
  problem_statement           text NOT NULL,
  objectives                  text NOT NULL,
  expected_outcomes           text NOT NULL,
  current_trl                 smallint CHECK (current_trl BETWEEN 1 AND 9),
  target_trl                  smallint CHECK (target_trl BETWEEN 1 AND 9),

  status                      text NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN (
                                'DRAFT','SUBMITTED','UNDER_REVIEW',
                                'REVISION_REQUESTED','REJECTED','RECOMMENDED',
                                'APPROVED','OM_ISSUED','ARCHIVED','LINKED'
                              )),

  review_body                 text,
  review_sent_date            date,
  revision_notes              text,
  rejection_reason            text,
  sanctioned_amount           numeric(14,2),
  sanction_date               date,
  om_number                   text,
  om_date                     date,

  -- No FK on linked_project_no: ProjectInfo may not exist yet in fresh
  -- deployments. proposal_link_project RPC validates existence at runtime.
  linked_project_no           text,
  archived                    boolean DEFAULT false,

  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  submitted_at                timestamptz,
  created_by                  uuid NOT NULL REFERENCES auth.users(id),
  last_status_change_by       uuid REFERENCES auth.users(id),
  last_status_change_at       timestamptz
);

CREATE INDEX proposals_pi_user_id_idx       ON public.proposals(pi_user_id);
CREATE INDEX proposals_division_code_idx    ON public.proposals(division_code);
CREATE INDEX proposals_status_idx           ON public.proposals(status);
CREATE INDEX proposals_created_at_idx       ON public.proposals(created_at DESC);

-- proposal_code generator (per-year NNNN reset)
CREATE OR REPLACE FUNCTION public.proposals_set_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_num  int;
BEGIN
  IF new.proposal_code IS NULL OR new.proposal_code = '' THEN
    -- xact-scoped advisory lock per year prevents two concurrent inserts
    -- from picking the same NNNN.
    PERFORM pg_advisory_xact_lock(hashtext('proposal_code_' || v_year));
    SELECT COALESCE(
             MAX((substring(proposal_code FROM 'PROP-' || v_year || '-(\d+)$'))::int),
             0
           ) + 1
      INTO v_num
      FROM public.proposals
     WHERE proposal_code LIKE 'PROP-' || v_year || '-%';
    new.proposal_code := 'PROP-' || v_year || '-' || lpad(v_num::text, 4, '0');
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER proposals_set_code_trg
BEFORE INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.proposals_set_code();

CREATE TABLE public.proposal_copis (
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  staff_id    text NOT NULL,
  staff_name  text NOT NULL,
  PRIMARY KEY (proposal_id, staff_id)
);

CREATE TABLE public.proposal_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  doc_type      text NOT NULL CHECK (doc_type IN ('signed_proposal','om_document')),
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     int,
  uploaded_at   timestamptz DEFAULT now(),
  uploaded_by   uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX proposal_documents_proposal_id_idx ON public.proposal_documents(proposal_id);

CREATE TABLE public.proposal_status_history (
  id            bigserial PRIMARY KEY,
  proposal_id   uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  from_status   text,
  to_status     text NOT NULL,
  payload       jsonb,
  changed_by    uuid NOT NULL REFERENCES auth.users(id),
  changed_at    timestamptz DEFAULT now()
);

CREATE INDEX proposal_status_history_proposal_id_idx
  ON public.proposal_status_history(proposal_id);

ALTER TABLE public.proposals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_copis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_status_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.proposals_can_read(p_row public.proposals)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    p_row.pi_user_id  = auth.uid()
    OR p_row.created_by = auth.uid()
    OR (
      (public.proposals_caller_has_role('HOD')
       OR public.proposals_caller_has_role('DivisionHead'))
      AND p_row.division_code = public.proposals_caller_division()
    )
    OR public.proposals_caller_has_role('Director')
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin');
$$;

CREATE POLICY proposals_select ON public.proposals
  FOR SELECT USING (public.proposals_can_read(proposals));

CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT WITH CHECK (
    pi_user_id  = auth.uid()
    AND created_by = auth.uid()
    AND public.proposals_caller_has_role('Scientist')
  );

CREATE POLICY proposals_update_owner ON public.proposals
  FOR UPDATE USING (
    created_by = auth.uid()
    AND status IN ('DRAFT','REVISION_REQUESTED')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('DRAFT','REVISION_REQUESTED')
  );

-- proposals: DELETE disabled (no policy → blocked)

CREATE POLICY proposal_copis_select ON public.proposal_copis
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.proposals p
            WHERE p.id = proposal_copis.proposal_id
              AND public.proposals_can_read(p))
  );

CREATE POLICY proposal_copis_write ON public.proposal_copis
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.proposals p
            WHERE p.id = proposal_copis.proposal_id
              AND p.created_by = auth.uid()
              AND p.status IN ('DRAFT','REVISION_REQUESTED'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p
            WHERE p.id = proposal_copis.proposal_id
              AND p.created_by = auth.uid()
              AND p.status IN ('DRAFT','REVISION_REQUESTED'))
  );

CREATE POLICY proposal_documents_select ON public.proposal_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.proposals p
            WHERE p.id = proposal_documents.proposal_id
              AND public.proposals_can_read(p))
  );

CREATE POLICY proposal_documents_insert ON public.proposal_documents
  FOR INSERT WITH CHECK (
    (
      doc_type = 'signed_proposal'
      AND EXISTS (SELECT 1 FROM public.proposals p
                  WHERE p.id = proposal_documents.proposal_id
                    AND p.created_by = auth.uid()
                    AND p.status IN ('DRAFT','REVISION_REQUESTED'))
    )
    OR (
      doc_type = 'om_document'
      AND public.proposals_caller_is_admin()
    )
  );

CREATE POLICY proposal_status_history_select ON public.proposal_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.proposals p
            WHERE p.id = proposal_status_history.proposal_id
              AND public.proposals_can_read(p))
  );

-- ---------- RPCs: proposal lifecycle ----------

CREATE OR REPLACE FUNCTION public.proposal_submit(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.proposals%ROWTYPE;
  v_from text;
BEGIN
  SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_row.created_by <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_row.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proposal_documents
                 WHERE proposal_id = p_id AND doc_type = 'signed_proposal') THEN
    RAISE EXCEPTION 'signed_proposal_required';
  END IF;

  v_from := v_row.status;
  UPDATE public.proposals
     SET status                = 'SUBMITTED',
         submitted_at          = COALESCE(submitted_at, now()),
         pi_name               = COALESCE(pi_name, v_row.pi_name),
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_from, 'SUBMITTED', '{}'::jsonb, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_set_under_review(
  p_id uuid, p_body text, p_sent_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'review_body_required'; END IF;
  IF p_sent_date IS NULL THEN RAISE EXCEPTION 'review_sent_date_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> UNDER_REVIEW', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'UNDER_REVIEW',
         review_body           = p_body,
         review_sent_date      = p_sent_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'SUBMITTED', 'UNDER_REVIEW',
          jsonb_build_object('review_body', p_body, 'review_sent_date', p_sent_date),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_request_revision(p_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN RAISE EXCEPTION 'notes_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> REVISION_REQUESTED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'REVISION_REQUESTED',
         revision_notes        = p_notes,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'REVISION_REQUESTED',
          jsonb_build_object('revision_notes', p_notes), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_reject(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> REJECTED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'REJECTED',
         rejection_reason      = p_reason,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'REJECTED',
          jsonb_build_object('rejection_reason', p_reason), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_recommend(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> RECOMMENDED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'RECOMMENDED',
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_approve(
  p_id uuid, p_amount numeric, p_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'amount_required'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'sanction_date_required'; END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'RECOMMENDED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> APPROVED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'APPROVED',
         sanctioned_amount     = p_amount,
         sanction_date         = p_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'RECOMMENDED', 'APPROVED',
          jsonb_build_object('sanctioned_amount', p_amount, 'sanction_date', p_date),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_issue_om(
  p_id uuid, p_om_no text, p_om_date date, p_doc_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_om_no IS NULL OR length(trim(p_om_no)) = 0 THEN RAISE EXCEPTION 'om_number_required'; END IF;
  IF p_om_date IS NULL THEN RAISE EXCEPTION 'om_date_required'; END IF;
  IF p_doc_id IS NULL THEN RAISE EXCEPTION 'om_document_required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_documents
    WHERE id = p_doc_id AND proposal_id = p_id AND doc_type = 'om_document'
  ) THEN
    RAISE EXCEPTION 'om_document_not_found';
  END IF;

  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> OM_ISSUED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'OM_ISSUED',
         om_number             = p_om_no,
         om_date               = p_om_date,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'APPROVED', 'OM_ISSUED',
          jsonb_build_object('om_number', p_om_no, 'om_date', p_om_date, 'om_doc_id', p_doc_id),
          auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.proposal_archive(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.proposals_caller_is_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status INTO v_status FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_status <> 'OM_ISSUED' THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> ARCHIVED', v_status;
  END IF;

  UPDATE public.proposals
     SET status                = 'ARCHIVED',
         archived              = true,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;

  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, 'OM_ISSUED', 'ARCHIVED', '{}'::jsonb, auth.uid());
END;
$$;

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
  IF to_regclass('public."ProjectInfo"') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public."ProjectInfo" WHERE "ProjectNo" = $1)'
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

-- Storage bucket: proposal-documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-documents', 'proposal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Object name layout: {proposal_id}/{doc_type}/{epoch_ms}_{filename}
CREATE POLICY proposal_docs_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proposal-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id::text = split_part(name, '/', 1)
        AND public.proposals_can_read(p)
    )
  );

CREATE POLICY proposal_docs_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proposal-documents'
    AND (
      (
        split_part(name, '/', 2) = 'signed_proposal'
        AND EXISTS (
          SELECT 1 FROM public.proposals p
          WHERE p.id::text = split_part(name, '/', 1)
            AND p.created_by = auth.uid()
            AND p.status IN ('DRAFT','REVISION_REQUESTED')
        )
      )
      OR (
        split_part(name, '/', 2) = 'om_document'
        AND public.proposals_caller_is_admin()
      )
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 3. PROJECT PROGRESS REPORTS
-- ──────────────────────────────────────────────────────────────
-- Periodic structured progress report per project. Loose linkage to
-- projects by "ProjectNo" text (projects PK is ProjectID and ProjectNo is
-- non-unique in the HR mirror — no FK, matches app convention).

CREATE TABLE public.project_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_no          text NOT NULL,
  project_name        text NOT NULL,
  division_code       text,
  period_type         text NOT NULL DEFAULT 'Q'
                      CHECK (period_type IN ('Q','H','Y')),   -- quarter / half / year
  period_label        text NOT NULL,                          -- e.g. 'Q2 2026-27'
  due_date            date,
  status              text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','REVISION_REQUESTED','REVIEWED')),
  objectives_progress text NOT NULL DEFAULT '',
  milestones          text NOT NULL DEFAULT '',
  expenditure_summary text NOT NULL DEFAULT '',
  outcomes            text NOT NULL DEFAULT '',
  remarks             text NOT NULL DEFAULT '',
  review_notes        text,
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  submitted_by        uuid NOT NULL REFERENCES auth.users(id),
  submitted_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_reports_project_idx ON public.project_reports (project_no);
CREATE INDEX project_reports_owner_idx   ON public.project_reports (submitted_by);
CREATE INDEX project_reports_status_idx  ON public.project_reports (status);

CREATE TABLE public.project_report_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.project_reports(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by  uuid NOT NULL REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_report_history  ENABLE ROW LEVEL SECURITY;

-- Reviewer roles: HOD/DivisionHead within division, Director + admins anywhere.
CREATE OR REPLACE FUNCTION public.project_reports_can_review(d public.project_reports)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    public.proposals_caller_has_role('Director')
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR ((public.proposals_caller_has_role('HOD')
         OR public.proposals_caller_has_role('DivisionHead'))
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;

CREATE OR REPLACE FUNCTION public.project_reports_can_read(d public.project_reports)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT d.submitted_by = auth.uid() OR public.project_reports_can_review(d);
$$;

CREATE POLICY project_reports_select ON public.project_reports
  FOR SELECT USING (public.project_reports_can_read(project_reports));

CREATE POLICY project_reports_insert ON public.project_reports
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

CREATE POLICY project_reports_update_owner ON public.project_reports
  FOR UPDATE USING (submitted_by = auth.uid() AND status IN ('DRAFT','REVISION_REQUESTED'))
  WITH CHECK (submitted_by = auth.uid() AND status IN ('DRAFT','REVISION_REQUESTED'));

CREATE POLICY project_reports_delete_owner ON public.project_reports
  FOR DELETE USING (submitted_by = auth.uid() AND status = 'DRAFT');

CREATE POLICY project_report_history_select ON public.project_report_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.project_reports r
            WHERE r.id = project_report_history.report_id
              AND public.project_reports_can_read(r))
  );

CREATE OR REPLACE FUNCTION public.project_report_submit(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.project_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.project_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF v_row.submitted_by <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_row.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  END IF;
  IF length(trim(v_row.objectives_progress)) = 0 THEN RAISE EXCEPTION 'objectives_progress_required'; END IF;

  UPDATE public.project_reports
     SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, now()), updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.project_report_history(report_id, from_status, to_status, changed_by)
  VALUES (p_id, v_row.status, 'SUBMITTED', auth.uid());
END;
$$;

-- p_decision: 'REVIEWED' (accept) or 'REVISION_REQUESTED' (send back).
CREATE OR REPLACE FUNCTION public.project_report_review(p_id uuid, p_decision text, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.project_reports%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.project_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF NOT public.project_reports_can_review(v_row) THEN RAISE EXCEPTION 'not_reviewer'; END IF;
  IF v_row.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> %', v_row.status, p_decision;
  END IF;
  IF p_decision NOT IN ('REVIEWED','REVISION_REQUESTED') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  IF p_decision = 'REVISION_REQUESTED' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'notes_required';
  END IF;

  UPDATE public.project_reports
     SET status = p_decision,
         review_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.project_report_history(report_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_row.status, p_decision, jsonb_build_object('notes', p_notes), auth.uid());
END;
$$;
