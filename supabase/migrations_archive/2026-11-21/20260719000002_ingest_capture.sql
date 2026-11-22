-- ═══════════════════════════════════════════════════════════════════════
-- 20260719000002_ingest_capture
-- Phase B (data-ingestion design doc, 2026-07-19): zero-behavior-change
-- capture. Structured files harvested from a watched folder or a mail-in
-- inbox land here for human review (they do NOT auto-commit to HR tables —
-- same trust boundary as today's manual ImportFlow). Unstructured files
-- (PDFs/scans) reuse the existing `documents` RAG queue and auto-ingest.
--
-- Written from the app side only — all inserts come from the ingest/ Python
-- worker using the service-role key, which bypasses RLS entirely. The
-- policies below govern the review UI (DATA_ADMINS on /data).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.harvested_imports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name          text NOT NULL,
  source             text NOT NULL CHECK (source IN ('folder','mail')),
  source_identifier  text NOT NULL,  -- folder subpath (division code) or sender email
  division_code      text,           -- resolved division, if known; null = unmapped
  storage_bucket     text NOT NULL DEFAULT 'documents',
  storage_path       text NOT NULL,
  file_size          bigint NOT NULL DEFAULT 0,
  content_hash       text NOT NULL,  -- sha256, dedupe key
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','reviewed','discarded')),
  landed_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by        uuid REFERENCES auth.users(id),
  reviewed_at        timestamptz
);

CREATE UNIQUE INDEX harvested_imports_hash_idx ON public.harvested_imports (content_hash);
CREATE INDEX harvested_imports_pending_idx ON public.harvested_imports (landed_at)
  WHERE status = 'pending';

ALTER TABLE public.harvested_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "harvested_imports_select" ON public.harvested_imports FOR SELECT TO authenticated
USING (public.caller_is_admin());

CREATE POLICY "harvested_imports_update" ON public.harvested_imports FOR UPDATE TO authenticated
USING (public.caller_is_admin()) WITH CHECK (public.caller_is_admin());

-- Mail-in sender → division mapping (doc's "sender mapping" tagging rule).
-- Folder mode needs no equivalent table: the division code IS the immediate
-- subfolder name under WATCH_ROOT.
CREATE TABLE public.ingest_sender_map (
  email          text PRIMARY KEY,
  division_code  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingest_sender_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingest_sender_map_all" ON public.ingest_sender_map FOR ALL TO authenticated
USING (public.caller_is_admin()) WITH CHECK (public.caller_is_admin());

-- documents: dedupe support for harvested unstructured files (mail
-- attachments re-sent, folder files re-scanned unchanged).
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_idx
  ON public.documents (content_hash) WHERE content_hash IS NOT NULL;
