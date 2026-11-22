-- ============================================================
-- 20261111000001_proposal_review_chain
-- Project lifecycle PL2 — concept to sanction
-- (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §2.3, §5, §6.1).
--
--   1. Head-wise budget lines; the requested total follows them.
--   2. HQ categories (guidelines §2.1) and the readiness rules that depend
--      on budget lines and documents.
--   3. A review chain per track, one row per step, each completed against a
--      signed scan (decision 5). Replaces the "any admin" transitions.
--   4. Reviewers' comments attached to a section of the proposal.
--   5. proposal_sanction: the project is created from the proposal — no
--      Excel upload, no manual link.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Vocabulary ──────────────────────────────────────────────────────
-- Mirrored in src/lib/projects/heads.ts and src/lib/proposals/reviewSteps.ts.

CREATE OR REPLACE FUNCTION public.budget_head_is_capital(p_head text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_head IN ('EQUIPMENT', 'WORKS');
$$;

ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS category_code text;
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_category_code_check;
ALTER TABLE public.proposals ADD CONSTRAINT proposals_category_code_check CHECK (
    category_code IS NULL OR category_code IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST'));

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS proposal_id   uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sanction_ref  text,
    ADD COLUMN IF NOT EXISTS sanction_date date;
CREATE UNIQUE INDEX IF NOT EXISTS projects_proposal_id_key ON public.projects (proposal_id) WHERE proposal_id IS NOT NULL;

-- ── 2. Documents: quotations, step scans, sanction orders ──────────────
ALTER TABLE public.proposal_documents DROP CONSTRAINT IF EXISTS proposal_documents_doc_type_check;
ALTER TABLE public.proposal_documents ADD CONSTRAINT proposal_documents_doc_type_check CHECK (
    doc_type IN ('signed_proposal', 'om_document', 'quotation', 'step_scan', 'sanction_order'));

-- ── 3. Who is who on a proposal ────────────────────────────────────────
-- PI, author or named co-PI. These may never act on their own file.
CREATE OR REPLACE FUNCTION public.proposal_caller_is_party(p public.proposals)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.pi_user_id = (SELECT auth.uid())
      OR p.created_by = (SELECT auth.uid())
      OR public.proposal_caller_is_copi(p.id);
$$;

-- Who may complete one kind of step. Not a party to the proposal, ever:
-- a PME officer, Finance officer or Director who is PI or co-PI on this file
-- is handled by a colleague (plan §4.2, "no self-dealing").
CREATE OR REPLACE FUNCTION public.proposal_caller_may_act(p public.proposals, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NOT public.proposal_caller_is_party(p)
     AND (
       public.caller_has_role('MasterAdmin')
       OR CASE p_kind
            WHEN 'PME_VETTING'         THEN public.caller_is_pme()
            WHEN 'FINANCE'             THEN public.caller_has_role('FinanceAdmin')
            -- The committee decides; PME or the scheme leader records it.
            WHEN 'REVIEW_COMMITTEE'    THEN public.caller_is_pme()
                                         OR EXISTS (SELECT 1 FROM public.project_schemes s
                                                     WHERE s.code = p.track AND s.leader_user_id = (SELECT auth.uid()))
            -- The Director signs on paper; the Director or PME records it with the scan.
            WHEN 'DIRECTOR_APPROVAL'   THEN public.caller_has_role('Director') OR public.caller_is_pme()
            WHEN 'DIRECTOR_FORWARD'    THEN public.caller_has_role('Director') OR public.caller_is_pme()
            -- Decided at CSIR HQ; recorded here, never performed (plan §12).
            WHEN 'HQ_SCREENING'        THEN public.caller_is_pme()
            WHEN 'HQ_EXPERT'           THEN public.caller_is_pme()
            WHEN 'COMPETENT_AUTHORITY' THEN public.caller_is_pme()
            WHEN 'SANCTION'            THEN public.caller_is_pme()
            ELSE false
          END
     );
$$;

-- Steps per track, in order.
CREATE OR REPLACE FUNCTION public.proposal_step_kinds(p_track text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_track
    WHEN 'ULIP' THEN ARRAY['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']
    WHEN 'HQ'   THEN ARRAY['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD',
                           'HQ_SCREENING', 'HQ_EXPERT', 'COMPETENT_AUTHORITY']
  END;
$$;

-- The proposal's status once a step is completed.
CREATE OR REPLACE FUNCTION public.proposal_status_after(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_kind
    WHEN 'PME_VETTING'         THEN 'UNDER_REVIEW'
    WHEN 'FINANCE'             THEN 'UNDER_REVIEW'
    WHEN 'REVIEW_COMMITTEE'    THEN 'RECOMMENDED'
    WHEN 'DIRECTOR_FORWARD'    THEN 'RECOMMENDED'
    WHEN 'HQ_SCREENING'        THEN 'RECOMMENDED'
    WHEN 'HQ_EXPERT'           THEN 'RECOMMENDED'
    WHEN 'DIRECTOR_APPROVAL'   THEN 'APPROVED'
    WHEN 'COMPETENT_AUTHORITY' THEN 'APPROVED'
  END;
$$;

-- Anyone who may act on some step of this proposal's track: may read it once
-- submitted, comment on it, and upload a step scan.
CREATE OR REPLACE FUNCTION public.proposal_caller_may_review(p public.proposals)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(coalesce(public.proposal_step_kinds(p.track),
                                  ARRAY['PME_VETTING']) || ARRAY['SANCTION']) k
     WHERE public.proposal_caller_may_act(p, k));
$$;

-- Finance reads submitted proposals (the HQ chain has a Finance step).
CREATE OR REPLACE FUNCTION public.proposals_can_read(p_row public.proposals)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    p_row.pi_user_id = (SELECT auth.uid())
    OR p_row.created_by = (SELECT auth.uid())
    OR public.proposal_caller_is_copi(p_row.id)
    OR (
      p_row.status <> 'DRAFT'
      AND (
        ((public.proposals_caller_has_role('HOD')
          OR public.proposals_caller_has_role('DivisionHead'))
         AND p_row.division_code = public.proposals_caller_division())
        OR public.proposals_caller_has_role('Director')
        OR public.proposals_caller_has_role('HRAdmin')
        OR public.proposals_caller_has_role('SystemAdmin')
        OR public.proposals_caller_has_role('MasterAdmin')
        OR public.proposals_caller_has_role('FinanceAdmin')
        OR public.caller_is_pme()
        OR EXISTS (
            SELECT 1 FROM public.project_schemes s
             WHERE s.code = p_row.track
               AND s.leader_user_id = (SELECT auth.uid()))
      )
    );
$$;

-- ── 4. Document upload rules ───────────────────────────────────────────
DROP POLICY IF EXISTS proposal_documents_insert ON public.proposal_documents;
CREATE POLICY proposal_documents_insert ON public.proposal_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
       WHERE p.id = proposal_documents.proposal_id
         AND (
           (proposal_documents.doc_type IN ('signed_proposal', 'quotation')
            AND p.created_by = (SELECT auth.uid())
            AND p.status IN ('DRAFT', 'REVISION_REQUESTED'))
           OR (proposal_documents.doc_type IN ('step_scan', 'sanction_order')
               AND p.status NOT IN ('DRAFT', 'REVISION_REQUESTED', 'REJECTED', 'ARCHIVED', 'LINKED')
               AND public.proposal_caller_may_review(p))
           OR (proposal_documents.doc_type = 'om_document' AND public.proposals_caller_is_admin())
         ))
  );

DROP POLICY IF EXISTS proposal_docs_storage_insert ON storage.objects;
CREATE POLICY proposal_docs_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proposal-documents'
    AND EXISTS (
      SELECT 1 FROM public.proposals p
       WHERE p.id::text = split_part(name, '/', 1)
         AND (
           (split_part(name, '/', 2) IN ('signed_proposal', 'quotation')
            AND p.created_by = (SELECT auth.uid())
            AND p.status IN ('DRAFT', 'REVISION_REQUESTED'))
           OR (split_part(name, '/', 2) IN ('step_scan', 'sanction_order')
               AND p.status NOT IN ('DRAFT', 'REVISION_REQUESTED', 'REJECTED', 'ARCHIVED', 'LINKED')
               AND public.proposal_caller_may_review(p))
           OR (split_part(name, '/', 2) = 'om_document' AND public.proposals_caller_is_admin())
         ))
  );

-- ── 5. Budget lines ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_budget_lines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    fiscal_year text NOT NULL CHECK (fiscal_year ~ '^\d{4}-\d{2}$'),
    head        text NOT NULL CHECK (head IN ('EQUIPMENT', 'WORKS', 'MANPOWER', 'CONSUMABLES',
                                              'TA_INDIA', 'TA_ABROAD', 'CONTINGENCY', 'OUTSOURCING', 'OTHER')),
    item        text NOT NULL DEFAULT '',
    amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_budget_lines_proposal_idx ON public.proposal_budget_lines (proposal_id);

ALTER TABLE public.proposal_budget_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_budget_lines_select" ON public.proposal_budget_lines;
CREATE POLICY "proposal_budget_lines_select" ON public.proposal_budget_lines
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.proposals p
                    WHERE p.id = proposal_budget_lines.proposal_id AND public.proposals_can_read(p)));

-- The author edits lines directly while drafting or revising, like the draft itself.
DROP POLICY IF EXISTS "proposal_budget_lines_write_author" ON public.proposal_budget_lines;
CREATE POLICY "proposal_budget_lines_write_author" ON public.proposal_budget_lines
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.proposals p
                    WHERE p.id = proposal_budget_lines.proposal_id
                      AND p.created_by = (SELECT auth.uid())
                      AND p.status IN ('DRAFT', 'REVISION_REQUESTED')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                         WHERE p.id = proposal_budget_lines.proposal_id
                           AND p.created_by = (SELECT auth.uid())
                           AND p.status IN ('DRAFT', 'REVISION_REQUESTED')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_budget_lines TO authenticated, service_role;

-- The requested total is the sum of the lines once there are any. A
-- proposal with no lines keeps the single figure it was given before.
CREATE OR REPLACE FUNCTION public.proposal_budget_lines_sync_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_id uuid := coalesce(NEW.proposal_id, OLD.proposal_id);
BEGIN
    UPDATE public.proposals
       SET requested_budget = (SELECT coalesce(sum(amount), 0) FROM public.proposal_budget_lines WHERE proposal_id = v_id)
     WHERE id = v_id
       AND status IN ('DRAFT', 'REVISION_REQUESTED');
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_budget_lines_total ON public.proposal_budget_lines;
CREATE TRIGGER trg_proposal_budget_lines_total
    AFTER INSERT OR UPDATE OR DELETE ON public.proposal_budget_lines
    FOR EACH ROW EXECUTE FUNCTION public.proposal_budget_lines_sync_total();

CREATE TABLE IF NOT EXISTS public.project_budget_lines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    fiscal_year text NOT NULL,
    head        text NOT NULL,
    item        text NOT NULL DEFAULT '',
    amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
    -- 'SANCTION' — copied from the proposal. Revised only by an approved
    -- change request (plan PL5).
    source      text NOT NULL DEFAULT 'SANCTION',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_budget_lines_project_idx ON public.project_budget_lines (project_id);

ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;
-- Whoever may see the project (projects RLS applies inside the subquery).
DROP POLICY IF EXISTS "project_budget_lines_select" ON public.project_budget_lines;
CREATE POLICY "project_budget_lines_select" ON public.project_budget_lines
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_budget_lines.project_id));
REVOKE INSERT, UPDATE, DELETE ON public.project_budget_lines FROM authenticated;
GRANT SELECT ON public.project_budget_lines TO authenticated, service_role;

-- ── 6. Readiness, now including the budget and documents ───────────────
-- Same list, same order as src/lib/proposals/readiness.ts.
CREATE OR REPLACE FUNCTION public.proposal_missing_fields(p public.proposals)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN coalesce(btrim(p.title), '') = ''             THEN 'title' END,
    CASE WHEN p.track IS NULL                               THEN 'track' END,
    CASE WHEN coalesce(btrim(p.abstract), '') = ''          THEN 'abstract' END,
    CASE WHEN coalesce(btrim(p.problem_statement), '') = '' THEN 'problem_statement' END,
    CASE WHEN coalesce(btrim(p.domain_theme), '') = ''      THEN 'domain_theme' END,
    CASE WHEN coalesce(btrim(p.objectives), '') = ''        THEN 'objectives' END,
    CASE WHEN coalesce(btrim(p.expected_outcomes), '') = '' THEN 'expected_outcomes' END,
    CASE WHEN p.track = 'HQ' AND p.category_code IS NULL    THEN 'category_code' END,
    CASE WHEN p.track IS DISTINCT FROM 'HQ'
          AND coalesce(btrim(p.project_category), '') = ''  THEN 'project_category' END,
    CASE WHEN p.proposed_start_date IS NULL                 THEN 'proposed_start_date' END,
    CASE WHEN p.proposed_duration_months IS NULL            THEN 'proposed_duration_months' END,
    CASE WHEN coalesce(btrim(p.pi_name), '') = ''           THEN 'pi_name' END,
    CASE WHEN coalesce(btrim(p.division_code), '') = ''     THEN 'division_code' END,
    CASE WHEN coalesce(p.requested_budget, 0) <= 0          THEN 'requested_budget' END,
    CASE WHEN coalesce(btrim(p.fund_type), '') = ''         THEN 'fund_type' END,
    CASE WHEN coalesce(btrim(p.sponsor_type), '') = ''      THEN 'sponsor_type' END,
    CASE WHEN coalesce(btrim(p.sponsor_name), '') = ''      THEN 'sponsor_name' END
  ], NULL);
$$;

-- Fields, then rules that read budget lines and documents (guidelines §3.1,
-- §3.2). The signed scan is checked separately by proposal_submit.
CREATE OR REPLACE FUNCTION public.proposal_readiness(p_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.proposal_missing_fields(p) || array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'EQUIPMENT' AND b.amount >= 500000)
          AND NOT EXISTS (SELECT 1 FROM public.proposal_documents d
                           WHERE d.proposal_id = p.id AND d.doc_type = 'quotation')
         THEN 'equipment_quotation' END,
    CASE WHEN p.track = 'HQ' AND coalesce(p.category_code, '') NOT IN ('MMP', 'FCP')
          AND EXISTS (SELECT 1 FROM public.proposal_budget_lines b
                       WHERE b.proposal_id = p.id AND b.head = 'WORKS')
         THEN 'works_not_allowed' END
  ], NULL)
  FROM public.proposals p WHERE p.id = p_id;
$$;

-- ── 7. Review steps ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_review_steps (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    -- One round per submission; a revision and resubmission opens the next.
    round       int  NOT NULL,
    seq         int  NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('PME_VETTING', 'FINANCE', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL',
                                              'DIRECTOR_FORWARD', 'HQ_SCREENING', 'HQ_EXPERT', 'COMPETENT_AUTHORITY')),
    status      text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'DONE', 'RETURNED', 'REJECTED', 'SKIPPED')),
    decided_by  uuid REFERENCES auth.users(id),
    decided_at  timestamptz,
    notes       text,
    document_id uuid REFERENCES public.proposal_documents(id) ON DELETE SET NULL,
    meeting_id  uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (proposal_id, round, seq)
);

ALTER TABLE public.proposal_review_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proposal_review_steps_select" ON public.proposal_review_steps;
CREATE POLICY "proposal_review_steps_select" ON public.proposal_review_steps
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.proposals p
                    WHERE p.id = proposal_review_steps.proposal_id AND public.proposals_can_read(p)));
REVOKE INSERT, UPDATE, DELETE ON public.proposal_review_steps FROM authenticated;
GRANT SELECT ON public.proposal_review_steps TO authenticated, service_role;

-- Internal: open the next round of steps for the proposal's track. Steps the
-- proposal has already passed (a legacy proposal mid-flow) are SKIPPED.
CREATE OR REPLACE FUNCTION public.proposal_open_round(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row   public.proposals%ROWTYPE;
    v_round int;
    v_kinds text[];
    v_rank  int;
    i       int;
    v_rank_of CONSTANT jsonb := '{"SUBMITTED":0,"UNDER_REVIEW":1,"RECOMMENDED":2,"APPROVED":3,"OM_ISSUED":4}';
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id;
    v_kinds := public.proposal_step_kinds(v_row.track);
    IF v_kinds IS NULL THEN
        RAISE EXCEPTION 'Choose in-house (ULIP) or HQ scheme before review can begin';
    END IF;
    SELECT coalesce(max(round), 0) + 1 INTO v_round FROM public.proposal_review_steps WHERE proposal_id = p_id;
    v_rank := coalesce((v_rank_of ->> v_row.status)::int, 0);
    FOR i IN 1 .. array_length(v_kinds, 1) LOOP
        INSERT INTO public.proposal_review_steps (proposal_id, round, seq, kind, status, notes)
        VALUES (p_id, v_round, i, v_kinds[i],
                CASE WHEN v_rank > 0 AND (v_rank_of ->> public.proposal_status_after(v_kinds[i]))::int <= v_rank
                     THEN 'SKIPPED' ELSE 'PENDING' END,
                CASE WHEN v_rank > 0 AND (v_rank_of ->> public.proposal_status_after(v_kinds[i]))::int <= v_rank
                     THEN 'Passed before step tracking began' END);
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.proposal_open_round(uuid) FROM PUBLIC, anon, authenticated;

-- ── 8. Comments on a section ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_review_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    section     text NOT NULL CHECK (section IN ('idea', 'plan', 'team', 'budget', 'documents')),
    body        text NOT NULL CHECK (length(btrim(body)) > 0),
    author_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS proposal_review_comments_proposal_idx ON public.proposal_review_comments (proposal_id, created_at);

ALTER TABLE public.proposal_review_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_review_comments_select" ON public.proposal_review_comments;
CREATE POLICY "proposal_review_comments_select" ON public.proposal_review_comments
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.proposals p
                    WHERE p.id = proposal_review_comments.proposal_id AND public.proposals_can_read(p)));

-- A reviewer comments while the proposal is under review.
DROP POLICY IF EXISTS "proposal_review_comments_insert" ON public.proposal_review_comments;
CREATE POLICY "proposal_review_comments_insert" ON public.proposal_review_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.proposals p
                     WHERE p.id = proposal_review_comments.proposal_id
                       AND p.status IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED')
                       AND public.proposal_caller_may_review(p)));

-- …and may withdraw it before the PI has dealt with it.
DROP POLICY IF EXISTS "proposal_review_comments_delete" ON public.proposal_review_comments;
CREATE POLICY "proposal_review_comments_delete" ON public.proposal_review_comments
    FOR DELETE TO authenticated
    USING (author_id = (SELECT auth.uid()) AND resolved_at IS NULL);

-- The PI ticks a comment done. Only resolved_at is writable.
DROP POLICY IF EXISTS "proposal_review_comments_resolve" ON public.proposal_review_comments;
CREATE POLICY "proposal_review_comments_resolve" ON public.proposal_review_comments
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.proposals p
                    WHERE p.id = proposal_review_comments.proposal_id AND p.created_by = (SELECT auth.uid())))
    WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                         WHERE p.id = proposal_review_comments.proposal_id AND p.created_by = (SELECT auth.uid())));

REVOKE UPDATE ON public.proposal_review_comments FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.proposal_review_comments TO authenticated, service_role;
GRANT UPDATE (resolved_at) ON public.proposal_review_comments TO authenticated;

-- ── 9. Submit: full readiness, then the first step of a new round ──────
CREATE OR REPLACE FUNCTION public.proposal_submit(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     public.proposals%ROWTYPE;
  v_from    text;
  v_missing text[];
  v_version uuid;
BEGIN
  SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_row.created_by <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_row.status NOT IN ('DRAFT','REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'invalid_status_transition: % -> SUBMITTED', v_row.status;
  END IF;

  v_missing := public.proposal_readiness(p_id);
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Not ready to submit. Still needed: %',
      replace(array_to_string(v_missing, ', '), '_', ' ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proposal_documents
                 WHERE proposal_id = p_id AND doc_type = 'signed_proposal') THEN
    RAISE EXCEPTION 'signed_proposal_required';
  END IF;

  v_version := public.proposal_snapshot_version(p_id, 'Submitted', 'submitted');
  v_from := v_row.status;
  UPDATE public.proposals
     SET status                = 'SUBMITTED',
         submitted_at          = COALESCE(submitted_at, now()),
         submitted_version_id  = v_version,
         updated_at            = now(),
         last_status_change_by = auth.uid(),
         last_status_change_at = now()
   WHERE id = p_id;
  PERFORM public.proposal_open_round(p_id);
  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_from, 'SUBMITTED', jsonb_build_object('version_id', v_version), auth.uid());
END;
$$;

-- ── 10. Recording a step ───────────────────────────────────────────────
--   APPROVE  — completes the step against a signed scan; the proposal moves
--              to proposal_status_after(kind).
--   RETURN   — back to the PI for revision. Needs a note or a comment.
--   REJECT   — terminal. Needs a reason.
CREATE OR REPLACE FUNCTION public.proposal_record_step(
    p_step_id     uuid,
    p_decision    text,
    p_notes       text,
    p_document_id uuid,
    p_meeting_id  uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_step public.proposal_review_steps%ROWTYPE;
    v_row  public.proposals%ROWTYPE;
    v_next text;
    v_from text;
BEGIN
    SELECT * INTO v_step FROM public.proposal_review_steps WHERE id = p_step_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
    SELECT * INTO v_row FROM public.proposals WHERE id = v_step.proposal_id FOR UPDATE;

    IF NOT public.proposal_caller_may_act(v_row, v_step.kind) THEN
        RAISE EXCEPTION 'You cannot record this step on this proposal';
    END IF;
    IF v_row.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED') THEN
        RAISE EXCEPTION 'This proposal is not under review';
    END IF;
    IF v_step.status <> 'PENDING' THEN RAISE EXCEPTION 'This step has already been recorded'; END IF;
    IF v_step.round <> (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = v_row.id)
       OR EXISTS (SELECT 1 FROM public.proposal_review_steps s
                   WHERE s.proposal_id = v_row.id AND s.round = v_step.round
                     AND s.seq < v_step.seq AND s.status = 'PENDING') THEN
        RAISE EXCEPTION 'An earlier step is still pending';
    END IF;
    IF p_meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    v_from := v_row.status;

    IF p_decision = 'APPROVE' THEN
        IF p_document_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.proposal_documents d
             WHERE d.id = p_document_id AND d.proposal_id = v_row.id AND d.doc_type = 'step_scan') THEN
            RAISE EXCEPTION 'Upload the signed scan for this step first';
        END IF;
        UPDATE public.proposal_review_steps
           SET status = 'DONE', decided_by = auth.uid(), decided_at = now(),
               notes = nullif(btrim(p_notes), ''), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        v_next := public.proposal_status_after(v_step.kind);
        UPDATE public.proposals
           SET status = v_next, updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;

    ELSIF p_decision = 'RETURN' THEN
        IF coalesce(btrim(p_notes), '') = '' AND NOT EXISTS (
            SELECT 1 FROM public.proposal_review_comments c
             WHERE c.proposal_id = v_row.id AND c.resolved_at IS NULL) THEN
            RAISE EXCEPTION 'Say what needs to change: add a note or a comment on a section';
        END IF;
        UPDATE public.proposal_review_steps
           SET status = 'RETURNED', decided_by = auth.uid(), decided_at = now(),
               notes = nullif(btrim(p_notes), ''), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.proposal_review_steps SET status = 'SKIPPED'
         WHERE proposal_id = v_row.id AND round = v_step.round AND status = 'PENDING';
        v_next := 'REVISION_REQUESTED';
        UPDATE public.proposals
           SET status = v_next, revision_notes = nullif(btrim(p_notes), ''), updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;

    ELSIF p_decision = 'REJECT' THEN
        IF coalesce(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'Give the reason for rejection'; END IF;
        UPDATE public.proposal_review_steps
           SET status = 'REJECTED', decided_by = auth.uid(), decided_at = now(),
               notes = btrim(p_notes), document_id = p_document_id, meeting_id = p_meeting_id
         WHERE id = v_step.id;
        UPDATE public.proposal_review_steps SET status = 'SKIPPED'
         WHERE proposal_id = v_row.id AND round = v_step.round AND status = 'PENDING';
        v_next := 'REJECTED';
        UPDATE public.proposals
           SET status = v_next, rejection_reason = btrim(p_notes), updated_at = now(),
               last_status_change_by = auth.uid(), last_status_change_at = now()
         WHERE id = v_row.id;
    ELSE
        RAISE EXCEPTION 'Unknown decision: %', p_decision;
    END IF;

    INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
    VALUES (v_row.id, v_from, v_next,
            jsonb_build_object('step', v_step.kind, 'decision', p_decision,
                               'notes', nullif(btrim(p_notes), ''), 'document_id', p_document_id),
            auth.uid());
END;
$$;

-- PME classifies a proposal that predates tracks, and opens its steps.
CREATE OR REPLACE FUNCTION public.proposal_set_track(p_id uuid, p_track text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF NOT public.proposal_caller_may_act(v_row, 'PME_VETTING') THEN
        RAISE EXCEPTION 'Only PME can set the track of a submitted proposal';
    END IF;
    IF v_row.status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED', 'APPROVED', 'OM_ISSUED') THEN
        RAISE EXCEPTION 'The track can be set by PME only on a proposal in review';
    END IF;
    IF p_track NOT IN ('ULIP', 'HQ') THEN RAISE EXCEPTION 'Unknown track: %', p_track; END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_review_steps
                WHERE proposal_id = p_id AND status IN ('DONE', 'RETURNED', 'REJECTED')
                  AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id)) THEN
        RAISE EXCEPTION 'Review has already started on this track';
    END IF;

    DELETE FROM public.proposal_review_steps
     WHERE proposal_id = p_id
       AND round = (SELECT max(round) FROM public.proposal_review_steps WHERE proposal_id = p_id);
    UPDATE public.proposals SET track = p_track, updated_at = now() WHERE id = p_id;
    PERFORM public.proposal_open_round(p_id);
END;
$$;

-- ── 11. Sanction: the project is created from the proposal ─────────────
CREATE OR REPLACE FUNCTION public.proposal_sanction(
    p_id            uuid,
    p_project_no    text,
    p_sanction_ref  text,
    p_sanction_date date,
    p_amount        numeric,
    p_document_id   uuid,
    p_project_id    text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row   public.proposals%ROWTYPE;
    v_pid   text;
    v_no    text := btrim(coalesce(p_project_no, ''));
    v_start date;
    v_end   date;
    v_staff text;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF NOT public.proposal_caller_may_act(v_row, 'SANCTION') THEN
        RAISE EXCEPTION 'Only PME can record the sanction';
    END IF;
    IF v_row.status NOT IN ('APPROVED', 'OM_ISSUED') THEN
        RAISE EXCEPTION 'The proposal must be approved before it is sanctioned';
    END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_review_steps
                WHERE proposal_id = p_id AND status = 'PENDING') THEN
        RAISE EXCEPTION 'A review step is still pending';
    END IF;
    IF v_no = '' THEN RAISE EXCEPTION 'Enter the project number'; END IF;
    IF coalesce(btrim(p_sanction_ref), '') = '' OR p_sanction_date IS NULL THEN
        RAISE EXCEPTION 'Enter the sanction order number and date';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter the sanctioned amount'; END IF;
    IF p_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.proposal_documents d
         WHERE d.id = p_document_id AND d.proposal_id = p_id AND d.doc_type = 'sanction_order') THEN
        RAISE EXCEPTION 'Upload the scanned sanction order first';
    END IF;
    -- Guidelines §2.2 coding (FY 2024-25 onwards): category, then six digits.
    IF v_row.track = 'HQ' AND v_row.category_code IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP')
       AND v_no !~ ('^' || v_row.category_code || '[0-9]{6}$') THEN
        RAISE EXCEPTION 'An % project number is % followed by six digits, e.g. %040511',
            v_row.category_code, v_row.category_code, v_row.category_code;
    END IF;
    IF v_row.proposed_start_date IS NULL OR v_row.proposed_duration_months IS NULL THEN
        RAISE EXCEPTION 'The proposal has no start date or duration';
    END IF;

    v_pid := coalesce(nullif(btrim(p_project_id), ''), 'PRJ-' || substring(v_row.proposal_code FROM 6));
    IF EXISTS (SELECT 1 FROM public.projects WHERE "ProjectID" = v_pid) THEN
        RAISE EXCEPTION 'A project with ID % already exists', v_pid;
    END IF;

    v_start := v_row.proposed_start_date;
    v_end   := (v_start + make_interval(months => v_row.proposed_duration_months) - interval '1 day')::date;
    SELECT "ID" INTO v_staff FROM public.staff WHERE user_id = v_row.pi_user_id LIMIT 1;

    INSERT INTO public.projects (
        "ProjectID", "ProjectNo", "ProjectName", "FundType", "SponsorerType", "SponsorerName",
        "ProjectCategory", "StartDate", "CompletioDate", "SanctionedCost", "UtilizedAmount",
        "PrincipalInvestigator", "DivisionCode", "ApprovalAuthority",
        stage, track, pi_staff_id, proposal_id, sanction_ref, sanction_date
    ) VALUES (
        v_pid, v_no, v_row.title, v_row.fund_type, v_row.sponsor_type, v_row.sponsor_name,
        coalesce(v_row.category_code, v_row.project_category), v_start::text, v_end::text, p_amount::text, '0',
        v_row.pi_name, v_row.division_code,
        CASE v_row.track WHEN 'ULIP' THEN 'Director, CSIR-AMPRI' WHEN 'HQ' THEN 'CSIR HQ' END,
        'SANCTIONED', v_row.track, v_staff, p_id, btrim(p_sanction_ref), p_sanction_date
    );

    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, item, amount, source)
    SELECT v_pid, fiscal_year, head, item, amount, 'SANCTION'
      FROM public.proposal_budget_lines WHERE proposal_id = p_id;

    UPDATE public.proposals SET
        status = 'LINKED', sanctioned_amount = p_amount, sanction_date = p_sanction_date,
        om_number = btrim(p_sanction_ref), om_date = p_sanction_date,
        linked_project_no = v_no, project_id = v_pid,
        updated_at = now(), last_status_change_by = auth.uid(), last_status_change_at = now()
     WHERE id = p_id;

    INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
    VALUES (p_id, v_row.status, 'LINKED',
            jsonb_build_object('project_id', v_pid, 'project_no', v_no, 'sanction_ref', btrim(p_sanction_ref),
                               'sanction_date', p_sanction_date, 'amount', p_amount, 'document_id', p_document_id),
            auth.uid());
    RETURN v_pid;
END;
$$;

-- ── 12. A sanction link is a decision, not an inference ────────────────
-- projects_resync_child_keys (20261110000002) unlinks children when a number
-- becomes shared. A proposal that was sanctioned into its project is linked
-- by projects.proposal_id and must never be unlinked that way.
CREATE OR REPLACE FUNCTION public.projects_resync_child_keys()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_no text := nullif(btrim(NEW."ProjectNo"), '');
    v_n  int;
    v_id text;
BEGIN
    IF v_no IS NULL OR (TG_OP = 'UPDATE' AND NEW."ProjectNo" IS NOT DISTINCT FROM OLD."ProjectNo") THEN
        RETURN NULL;
    END IF;

    SELECT count(*), min("ProjectID") INTO v_n, v_id FROM public.projects WHERE "ProjectNo" = v_no;
    IF v_n > 2 THEN
        RETURN NULL;
    END IF;
    IF v_n = 2 THEN
        v_id := NULL;
    END IF;

    UPDATE public.proposals pr SET project_id = v_id
     WHERE btrim(pr.linked_project_no) = v_no AND pr.project_id IS DISTINCT FROM v_id
       AND NOT EXISTS (SELECT 1 FROM public.projects x WHERE x.proposal_id = pr.id);
    UPDATE public.project_reports SET project_id = v_id WHERE btrim(project_no) = v_no        AND project_id IS DISTINCT FROM v_id;
    UPDATE public.project_staff   SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.phd_students    SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.mous            SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    UPDATE public.tech_transfers  SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.projects_resync_child_keys() FROM PUBLIC, anon, authenticated;

-- ── 13. Retire the "any admin" transitions ─────────────────────────────
-- Each let HRAdmin / SystemAdmin / MasterAdmin move a proposal past the
-- review chain. proposal_link_project stays for attaching a legacy project;
-- proposal_archive stays for withdrawing one.
REVOKE EXECUTE ON FUNCTION public.proposal_set_under_review(uuid, text, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_request_revision(uuid, text)       FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_reject(uuid, text)                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_recommend(uuid)                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_approve(uuid, numeric, date)       FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.proposal_issue_om(uuid, text, date, uuid)   FROM authenticated;

REVOKE ALL ON FUNCTION public.proposal_record_step(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proposal_set_track(uuid, text)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proposal_sanction(uuid, text, text, date, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_record_step(uuid, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_set_track(uuid, text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_sanction(uuid, text, text, date, numeric, uuid, text) TO authenticated, service_role;

-- ── 14. Assert the outcome ─────────────────────────────────────────────
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.proposal_approve(uuid, numeric, date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'proposal_approve is still callable: the review chain can be bypassed';
    END IF;
    IF has_function_privilege('authenticated', 'public.proposal_open_round(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can call proposal_open_round() directly';
    END IF;
    IF has_table_privilege('authenticated', 'public.proposal_review_steps', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated can write proposal_review_steps directly';
    END IF;
    IF has_column_privilege('authenticated', 'public.proposal_review_comments', 'body', 'UPDATE') THEN
        RAISE EXCEPTION 'a comment body is editable after the fact';
    END IF;
END $$;
