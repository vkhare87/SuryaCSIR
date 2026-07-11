-- ============================================================
-- Stage 01 / 08 — Extensions & shared helpers
-- Contains : Postgres extensions, generic trigger functions used
--            across every later stage.
-- Depends  : nothing
-- Rerun    : NOT idempotent — fresh installs only. Changes go in
--            new timestamped migrations, never edits here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Generic updated_at maintenance, reused by PMS, HR, committees/helpdesk,
-- proposals/reports, MOUs and tech-transfer tables. Two names exist because
-- the PMS-prefixed one shipped first and non-PMS tables later needed a
-- neutrally-named alias — both bodies are identical.
CREATE OR REPLACE FUNCTION pms_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
