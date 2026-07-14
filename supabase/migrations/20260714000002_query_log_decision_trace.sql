-- ──────────────────────────────────────────────────────────────
-- query_log decision trace + definition versioning (RP3 / RP4)
-- Every answer becomes reconstructable for audit: which route the
-- router chose (may differ from mode when the structured path fell
-- back to documents), which whitelisted function ran with which
-- params, why a refusal refused, and which code version produced
-- the answer. Additive columns only; existing RLS policies cover.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.query_log
    ADD COLUMN IF NOT EXISTS route text,
    ADD COLUMN IF NOT EXISTS function_name text,
    ADD COLUMN IF NOT EXISTS function_params jsonb,
    ADD COLUMN IF NOT EXISTS refusal_reason text,
    ADD COLUMN IF NOT EXISTS catalog_version text;

COMMENT ON COLUMN public.query_log.route IS
    'Router decision (structured/document/hybrid). Differs from mode when the structured path fell back.';
COMMENT ON COLUMN public.query_log.catalog_version IS
    'Git SHA (or RAG_BUILD_SHA) of the code that produced the answer — definition provenance.';
