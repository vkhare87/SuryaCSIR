-- ═══════════════════════════════════════════════════════════════════════
-- 20260719000003_import_field_mappings
-- Phase C (data-ingestion design doc, 2026-07-19): LLM any-format mapper —
-- memory half. rag/mapping_service.py proposes a column mapping for a file
-- with unrecognized headers; once a human confirms it in ImportFlow, it's
-- saved here keyed by (file_type, header fingerprint) so the same source's
-- next file auto-maps without asking the LLM (or the human) again.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.import_field_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_type           text NOT NULL,
  header_fingerprint  text NOT NULL,  -- sha256 of sorted, normalized raw headers
  mapping             jsonb NOT NULL, -- { "<raw header>": "<target column>" }
  confirmed_by        uuid NOT NULL REFERENCES auth.users(id),
  confirmed_at        timestamptz NOT NULL DEFAULT now(),
  use_count           integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX import_field_mappings_fingerprint_idx
  ON public.import_field_mappings (file_type, header_fingerprint);

ALTER TABLE public.import_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_field_mappings_select" ON public.import_field_mappings FOR SELECT TO authenticated
USING (public.caller_is_admin());

CREATE POLICY "import_field_mappings_insert" ON public.import_field_mappings FOR INSERT TO authenticated
WITH CHECK (public.caller_is_admin() AND confirmed_by = auth.uid());

CREATE POLICY "import_field_mappings_update" ON public.import_field_mappings FOR UPDATE TO authenticated
USING (public.caller_is_admin()) WITH CHECK (public.caller_is_admin());
