-- ═══════════════════════════════════════════════════════════════════════
-- 20260719000001_import_events
-- Phase A (data-ingestion design doc, 2026-07-19): upload-recency signal.
--
-- One row per completed import commit (ImportFlow confirm step), keyed by
-- FileType domain. Institute-wide per-domain granularity for now — a staff
-- file covering 3 divisions still stamps the whole "staff" domain fresh.
-- Per-division fan-out is deferred to Phase B (see TODOS.md).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.import_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_type           text NOT NULL,
  row_count           integer NOT NULL,
  uploaded_by         uuid NOT NULL REFERENCES auth.users(id),
  uploaded_by_email   text NOT NULL,
  uploaded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_events_file_type_idx
  ON public.import_events (file_type, uploaded_at DESC);

ALTER TABLE public.import_events ENABLE ROW LEVEL SECURITY;

-- Non-PII operational metadata (which domain, when, row count) — institute
-- readable, same tier as divisions/scientific_outputs. Needed by the
-- Data Management ledger and the steward dashboard digest.
CREATE POLICY "import_events_select" ON public.import_events FOR SELECT TO authenticated
USING (true);

-- Insert restricted to the same roles that can reach the /data upload flow
-- (DATA_ADMINS in src/constants/access.ts), and only for one's own upload.
CREATE POLICY "import_events_insert" ON public.import_events FOR INSERT TO authenticated
WITH CHECK (public.caller_is_admin() AND uploaded_by = auth.uid());
