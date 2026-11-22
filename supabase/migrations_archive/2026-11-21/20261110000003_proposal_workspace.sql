-- ============================================================
-- 20261110000003_proposal_workspace
-- Project lifecycle PL1 — the scientist workspace
-- (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §3).
--
--   1. A draft needs a title and nothing else. Completeness moves from
--      NOT NULL columns to proposal_submit, where it belongs: saving must
--      never fail for a missing field, submitting must.
--   2. proposal_notes     — the PI's private scratch, per proposal.
--   3. proposal_versions  — named snapshots; one is taken at every submit.
--   4. Any research role may start a proposal, not only 'Scientist'.
--   5. Proposal codes are numbered institute-wide (fixes a collision that
--      stopped a second scientist creating any proposal).
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Optional until submit ───────────────────────────────────────────
ALTER TABLE public.proposals
    ALTER COLUMN domain_theme             DROP NOT NULL,
    ALTER COLUMN fund_type                DROP NOT NULL,
    ALTER COLUMN sponsor_type             DROP NOT NULL,
    ALTER COLUMN sponsor_name             DROP NOT NULL,
    ALTER COLUMN project_category         DROP NOT NULL,
    ALTER COLUMN proposed_start_date      DROP NOT NULL,
    ALTER COLUMN proposed_duration_months DROP NOT NULL,
    ALTER COLUMN requested_budget         DROP NOT NULL,
    ALTER COLUMN division_code            DROP NOT NULL,
    ALTER COLUMN abstract                 DROP NOT NULL,
    ALTER COLUMN problem_statement        DROP NOT NULL,
    ALTER COLUMN objectives               DROP NOT NULL,
    ALTER COLUMN expected_outcomes        DROP NOT NULL;

-- What a proposal still needs before it can be submitted, as column names.
-- Mirrored by src/lib/proposals/readiness.ts — change both together; the
-- database test compares the two lists.
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
    CASE WHEN coalesce(btrim(p.project_category), '') = ''  THEN 'project_category' END,
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

-- ── 2. Private notes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    author_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    body        text NOT NULL CHECK (length(btrim(body)) > 0),
    -- The proposal field this note was moved into, if any. The note is kept.
    used_in     text CHECK (used_in IN ('abstract', 'problem_statement', 'objectives', 'expected_outcomes')),
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_notes_proposal_idx ON public.proposal_notes (proposal_id, created_at DESC);

ALTER TABLE public.proposal_notes ENABLE ROW LEVEL SECURITY;

-- The author, and nobody else, at every stage of the proposal: not co-PIs,
-- not PME, not reviewers, not admins. A note is written directly by the
-- client (that is what keeps jotting one cheap); the policy is the gate.
DROP POLICY IF EXISTS "proposal_notes_select_own" ON public.proposal_notes;
CREATE POLICY "proposal_notes_select_own" ON public.proposal_notes
    FOR SELECT TO authenticated
    USING (author_id = (SELECT auth.uid()));

-- Only on a proposal the author created — a note cannot be planted on
-- someone else's file.
DROP POLICY IF EXISTS "proposal_notes_insert_own" ON public.proposal_notes;
CREATE POLICY "proposal_notes_insert_own" ON public.proposal_notes
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.proposals p
                     WHERE p.id = proposal_id AND p.created_by = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "proposal_notes_update_own" ON public.proposal_notes;
CREATE POLICY "proposal_notes_update_own" ON public.proposal_notes
    FOR UPDATE TO authenticated
    USING (author_id = (SELECT auth.uid()))
    WITH CHECK (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "proposal_notes_delete_own" ON public.proposal_notes;
CREATE POLICY "proposal_notes_delete_own" ON public.proposal_notes
    FOR DELETE TO authenticated
    USING (author_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_notes TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_proposal_notes_updated_at ON public.proposal_notes;
CREATE TRIGGER trg_proposal_notes_updated_at
    BEFORE UPDATE ON public.proposal_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Versions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_versions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    version_no  int  NOT NULL,
    label       text NOT NULL,
    -- 'manual'    the PI marked it while drafting — private working history
    -- 'submitted' taken by proposal_submit — what the reviewers were given
    kind        text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'submitted')),
    -- {"proposal": <the proposals row>, "copis": [{staff_id, staff_name}]}
    snapshot    jsonb NOT NULL,
    created_by  uuid NOT NULL REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (proposal_id, version_no)
);

ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS submitted_version_id uuid REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;

-- The creator sees every version. Anyone else who may read the proposal
-- sees only what was submitted — drafting history stays with its author.
DROP POLICY IF EXISTS "proposal_versions_select" ON public.proposal_versions;
CREATE POLICY "proposal_versions_select" ON public.proposal_versions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.proposals p
         WHERE p.id = proposal_versions.proposal_id
           AND (p.created_by = (SELECT auth.uid())
                OR (proposal_versions.kind = 'submitted' AND public.proposals_can_read(p)))
    ));

-- No INSERT / UPDATE / DELETE policy: versions are written by the RPCs below.
REVOKE INSERT, UPDATE, DELETE ON public.proposal_versions FROM authenticated;
GRANT  SELECT ON public.proposal_versions TO authenticated, service_role;

-- Internal: snapshot the row as it stands. Callers authorize first.
CREATE OR REPLACE FUNCTION public.proposal_snapshot_version(p_id uuid, p_label text, p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_no int;
    v_id uuid;
BEGIN
    SELECT coalesce(max(version_no), 0) + 1 INTO v_no
      FROM public.proposal_versions WHERE proposal_id = p_id;

    INSERT INTO public.proposal_versions (proposal_id, version_no, label, kind, snapshot, created_by)
    SELECT p.id, v_no,
           coalesce(nullif(btrim(p_label), ''), 'Version ' || v_no),
           p_kind,
           jsonb_build_object(
               'proposal', to_jsonb(p),
               'copis', coalesce((SELECT jsonb_agg(jsonb_build_object('staff_id', c.staff_id, 'staff_name', c.staff_name)
                                                   ORDER BY c.staff_name)
                                    FROM public.proposal_copis c WHERE c.proposal_id = p.id), '[]'::jsonb)),
           auth.uid()
      FROM public.proposals p WHERE p.id = p_id
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_snapshot_version(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proposal_save_version(p_id uuid, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_row public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.proposals WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
    IF v_row.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the proposal''s author can mark a version';
    END IF;
    IF v_row.status NOT IN ('DRAFT', 'REVISION_REQUESTED') THEN
        RAISE EXCEPTION 'A version can be marked only while the proposal is being drafted or revised';
    END IF;
    RETURN public.proposal_snapshot_version(p_id, p_label, 'manual');
END;
$$;

-- Put an old version back. The present state is versioned first, so a
-- restore can itself be undone.
CREATE OR REPLACE FUNCTION public.proposal_restore_version(p_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ver public.proposal_versions%ROWTYPE;
    v_row public.proposals%ROWTYPE;
    v_old public.proposals%ROWTYPE;
BEGIN
    SELECT * INTO v_ver FROM public.proposal_versions WHERE id = p_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;

    SELECT * INTO v_row FROM public.proposals WHERE id = v_ver.proposal_id FOR UPDATE;
    IF v_row.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the proposal''s author can restore a version';
    END IF;
    IF v_row.status NOT IN ('DRAFT', 'REVISION_REQUESTED') THEN
        RAISE EXCEPTION 'A version can be restored only while the proposal is being drafted or revised';
    END IF;

    PERFORM public.proposal_snapshot_version(v_row.id, 'Before restoring version ' || v_ver.version_no, 'manual');

    v_old := jsonb_populate_record(NULL::public.proposals, v_ver.snapshot -> 'proposal');

    -- Content only. Status, review outcome and sanction details are the
    -- workflow's, not the draft's, and are never rolled back.
    UPDATE public.proposals SET
        title                    = v_old.title,
        acronym                  = v_old.acronym,
        track                    = v_old.track,
        domain_theme             = v_old.domain_theme,
        fund_type                = v_old.fund_type,
        sponsor_type             = v_old.sponsor_type,
        sponsor_name             = v_old.sponsor_name,
        project_category         = v_old.project_category,
        proposed_start_date      = v_old.proposed_start_date,
        proposed_duration_months = v_old.proposed_duration_months,
        requested_budget         = v_old.requested_budget,
        pi_name                  = v_old.pi_name,
        division_code            = v_old.division_code,
        abstract                 = v_old.abstract,
        problem_statement        = v_old.problem_statement,
        objectives               = v_old.objectives,
        expected_outcomes        = v_old.expected_outcomes,
        current_trl              = v_old.current_trl,
        target_trl               = v_old.target_trl,
        updated_at               = now()
     WHERE id = v_row.id;

    DELETE FROM public.proposal_copis WHERE proposal_id = v_row.id;
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name)
    SELECT v_row.id, c ->> 'staff_id', c ->> 'staff_name'
      FROM jsonb_array_elements(coalesce(v_ver.snapshot -> 'copis', '[]'::jsonb)) c;
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_save_version(uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proposal_restore_version(uuid)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_save_version(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proposal_restore_version(uuid)    TO authenticated, service_role;

-- ── 4. Submit checks completeness and records what was submitted ───────
-- Was: the browser's zod schema was the only completeness check, so a direct
-- RPC call could submit an empty proposal. Body otherwise as 20260712000006.
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

  v_missing := public.proposal_missing_fields(v_row);
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
  INSERT INTO public.proposal_status_history(proposal_id, from_status, to_status, payload, changed_by)
  VALUES (p_id, v_from, 'SUBMITTED', jsonb_build_object('version_id', v_version), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.proposal_submit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_submit(uuid) TO authenticated, service_role;

-- ── 5. Any research role may start a proposal ──────────────────────────
-- A Division Head or HOD who is also a researcher could not, unless they
-- separately held the Scientist role.
DROP POLICY IF EXISTS proposals_insert ON public.proposals;
CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT WITH CHECK (
    pi_user_id  = (SELECT auth.uid())
    AND created_by = (SELECT auth.uid())
    AND status = 'DRAFT'
    AND (public.proposals_caller_has_role('Scientist')
         OR public.proposals_caller_has_role('HOD')
         OR public.proposals_caller_has_role('DivisionHead')
         OR public.proposals_caller_has_role('Director'))
  );

-- ── 6. Proposal codes are numbered across the whole institute ──────────
-- proposals_set_code picks max(code)+1, but ran as the inserting user, so
-- under RLS it only saw that user's own proposals. The second scientist to
-- start a proposal in a year computed PROP-<year>-0001 again and hit the
-- unique constraint: only one person could ever create proposals. Found by
-- scripts/db/proposals.db.test.ts. Body unchanged from 20260712000006; it
-- now runs as the owner so the count is over every proposal.
CREATE OR REPLACE FUNCTION public.proposals_set_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_num  int;
BEGIN
  IF new.proposal_code IS NULL OR new.proposal_code = '' THEN
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

REVOKE ALL ON FUNCTION public.proposals_set_code() FROM PUBLIC, anon, authenticated;

-- ── 7. Assert the outcome ──────────────────────────────────────────────
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.proposal_snapshot_version(uuid, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can call proposal_snapshot_version() directly';
    END IF;
    IF has_table_privilege('authenticated', 'public.proposal_versions', 'INSERT') THEN
        RAISE EXCEPTION 'authenticated can INSERT proposal_versions directly';
    END IF;
END $$;
