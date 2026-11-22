-- ============================================================
-- Stage 08 / 08 — Unified documents registry & RAG (Ask SURYA)
-- Contains : documents registry (shared across all modules),
--            RAG ingestion index store, per-page source text,
--            query log + feedback, collection indexes, router
--            quality labels, bulk re-index tooling.
-- Depends  : 01 extensions_helpers, 02 auth_rbac, 06 proposals_reports
--            (proposals_caller_has_role / proposals_caller_division)
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================
-- One row per institutional document, regardless of which module
-- produced it. Files stay in their module buckets (proposal-documents,
-- committee-docs, annexures) — registry rows point at bucket+path. New
-- modules use the shared 'documents' bucket. `ingest_status` doubles as the
-- RAG ingestion queue consumed by the server-side indexing worker (service
-- role); `ingest_attempts` bounds worker retries (3, then dead-letter until
-- an admin requeues).

-- ──────────────────────────────────────────────────────────────
-- 1. DOCUMENTS REGISTRY
-- ──────────────────────────────────────────────────────────────

CREATE TABLE public.documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL,   -- 'proposal' | 'meeting' | 'pms_report' | 'publication' | 'staff_profile' | 'project_report' | ...
  entity_id      text NOT NULL,   -- parent PK as text (HR/PMS key types differ)
  doc_type       text NOT NULL,   -- module-specific subtype (e.g. 'signed_proposal', 'annexure', 'minutes')
  title          text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  file_size      bigint NOT NULL DEFAULT 0,
  mime_type      text NOT NULL DEFAULT 'application/pdf',
  owner_id       uuid NOT NULL REFERENCES auth.users(id),
  division_code  text,
  access_tier    text NOT NULL DEFAULT 'institute'
                 CHECK (access_tier IN ('institute','division','owner','confidential')),
  ingest_status  text NOT NULL DEFAULT 'pending'
                 CHECK (ingest_status IN ('pending','processing','indexed','failed','skipped')),
  ingest_error   text,
  ingest_attempts int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_entity_idx ON public.documents (entity_type, entity_id);
CREATE INDEX documents_ingest_pending_idx ON public.documents (created_at)
  WHERE ingest_status = 'pending';
CREATE UNIQUE INDEX documents_bucket_path_idx ON public.documents (storage_bucket, storage_path);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Read rule per tier:
--   owner        -> owner + admins + Director
--   confidential -> owner + admins + Director (same as owner; distinct tier
--                   so the RAG layer can index it into a restricted corpus)
--   division     -> above + same-division users
--   institute    -> any authenticated user
CREATE OR REPLACE FUNCTION public.documents_can_read(d public.documents)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    d.owner_id = auth.uid()
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR public.proposals_caller_has_role('Director')
    OR (d.access_tier = 'institute' AND auth.uid() IS NOT NULL)
    OR (d.access_tier = 'division'
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;

CREATE POLICY documents_select ON public.documents
  FOR SELECT USING (public.documents_can_read(documents));

CREATE POLICY documents_insert ON public.documents
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Owner may remove own registry row (e.g. deleting an annexure); admins too.
CREATE POLICY documents_delete ON public.documents
  FOR DELETE USING (
    owner_id = auth.uid()
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  );

-- Ingest-status transitions come from the indexing worker via the service
-- role, which bypasses RLS. Admins may retry failed ingests from the UI.
CREATE POLICY documents_update_admin ON public.documents
  FOR UPDATE USING (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  );

-- Shared bucket for new modules
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY documents_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_bucket = 'documents'
        AND d.storage_path = name
        AND public.documents_can_read(d)
    )
  );

-- Any authenticated user may upload; the object stays unreadable until a
-- registry row exists, and the uploader must own that row.
CREATE POLICY documents_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND auth.uid() IS NOT NULL
  );

CREATE POLICY documents_storage_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_bucket = 'documents'
        AND d.storage_path = name
        AND (d.owner_id = auth.uid()
             OR public.proposals_caller_has_role('SystemAdmin')
             OR public.proposals_caller_has_role('MasterAdmin'))
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 2. RAG INGESTION INDEX STORE
-- ──────────────────────────────────────────────────────────────
-- One row per indexed document: the PageIndex tree JSON built by the
-- server-side worker (service role). Read is gated to whoever can read the
-- parent document; only the worker (service role) writes.

CREATE TABLE public.doc_indexes (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  tree        jsonb NOT NULL,
  model       text  NOT NULL,
  page_count  int   NOT NULL DEFAULT 0,
  built_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_indexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_indexes_read ON public.doc_indexes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = doc_indexes.document_id
        AND public.documents_can_read(d)
    )
  );
-- No client write policy: service role (worker) bypasses RLS.

-- Per-page source text for answer synthesis, written by the ingest worker.
-- Query time fetches only the picked nodes' page ranges, so answers are
-- built from source text instead of node summaries. Read gate mirrors
-- doc_indexes.
CREATE TABLE public.doc_pages (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page        int  NOT NULL,
  text        text NOT NULL DEFAULT '',
  PRIMARY KEY (document_id, page)
);

ALTER TABLE public.doc_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_pages_read ON public.doc_pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = doc_pages.document_id
        AND public.documents_can_read(d)
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 3. QUERY LOG + FEEDBACK
-- ──────────────────────────────────────────────────────────────
-- One row per Ask SURYA question, owned by the caller. Inserted through the
-- caller's scoped client (RLS, no service key). Feedback is an owner update.

CREATE TABLE public.query_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  question    text NOT NULL,
  mode        text NOT NULL,
  answer      text NOT NULL,
  citations   jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback    smallint CHECK (feedback IN (-1, 1)),
  latency_ms  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX query_log_user_idx ON public.query_log (user_id, created_at DESC);

ALTER TABLE public.query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY query_log_owner_insert ON public.query_log
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY query_log_owner_update ON public.query_log
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY query_log_read ON public.query_log
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  );

-- ──────────────────────────────────────────────────────────────
-- 4. COLLECTION INDEXES
-- ──────────────────────────────────────────────────────────────
-- Per-collection (keyed by entity_type) document-summary rollup for
-- cross-document traversal. Built by the service-role worker.

CREATE TABLE public.collection_indexes (
  collection_key text PRIMARY KEY,
  title          text NOT NULL,
  summary        text NOT NULL,
  document_count int NOT NULL DEFAULT 0,
  model          text NOT NULL,
  built_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_indexes ENABLE ROW LEVEL SECURITY;

-- Non-confidential rollups: any authenticated user may read. Only service role writes.
CREATE POLICY collection_indexes_read ON public.collection_indexes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ──────────────────────────────────────────────────────────────
-- 5. ROUTER QUALITY LOOP
-- ──────────────────────────────────────────────────────────────
-- Admin-labeled correct routes for downvoted queries. The query API injects
-- recent labels as few-shot examples into the route prompt; eval/export_labels.py
-- appends them to the gold set.

CREATE TABLE public.route_labels (
  query_id      uuid PRIMARY KEY REFERENCES public.query_log(id) ON DELETE CASCADE,
  question      text NOT NULL,
  correct_route text NOT NULL CHECK (correct_route IN ('structured', 'document', 'hybrid')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.route_labels ENABLE ROW LEVEL SECURITY;

-- Any signed-in user's queries may become few-shots, so reads are
-- institute-internal (same stance as collection_indexes). Only admins label.
CREATE POLICY route_labels_read ON public.route_labels
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY route_labels_admin_insert ON public.route_labels
  FOR INSERT WITH CHECK (
    public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
  );

-- ──────────────────────────────────────────────────────────────
-- 6. ADMIN REQUEUE RPCs
-- ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the client never patches documents.ingest_status
-- directly. Resets ingest_attempts so a manual requeue restarts the retry
-- budget (worker auto-retries up to 3 times, then dead-letters).

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
     SET ingest_status = 'pending', ingest_error = NULL, ingest_attempts = 0
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
     SET ingest_status = 'pending', ingest_error = NULL, ingest_attempts = 0
   WHERE ingest_status IN ('indexed', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rag_requeue_document(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rag_requeue_document(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rag_requeue_all() FROM public;
GRANT EXECUTE ON FUNCTION public.rag_requeue_all() TO authenticated;
