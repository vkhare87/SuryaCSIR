-- ============================================================
-- Stage 01 / 08 — Extensions, Default ACLs, Shared Helpers & CSIR Rules
-- Checkpoint : 2026-11-21 clean domain baseline (consolidated from 93 migrations)
-- Depends    : nothing
-- Rerun      : NOT idempotent — fresh installs only. Future changes go in
--              new timestamped migrations, never edits here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Ensure future objects never inherit anon access and grant authenticated/service_role defaults.
DO $$
DECLARE
    v_role text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['postgres', 'supabase_admin', current_user] LOOP
        BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon', v_role);
        EXCEPTION
            WHEN insufficient_privilege OR undefined_object THEN
                RAISE NOTICE 'skipped default-ACL revoke for role %', v_role;
        END;
    END LOOP;

    FOREACH v_role IN ARRAY ARRAY['postgres', current_user] LOOP
        BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated, anon', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role', v_role);
        EXCEPTION
            WHEN insufficient_privilege OR undefined_object THEN
                RAISE NOTICE 'skipped default-ACL grant for role %', v_role;
        END;
    END LOOP;
END;
$$;

-- Early pure helpers referenced by Stage 03 indexes and cross-stage triggers
CREATE OR REPLACE FUNCTION public.ist_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION public.person_name_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(
           regexp_replace(lower(coalesce(p, '')), '\m(dr|prof|sh|smt|mr|mrs|ms)\M\.?', '', 'g'),
           '[^a-z0-9\s]', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.pms_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


-- Effective-dated CSIR institutional rules
CREATE TABLE IF NOT EXISTS public."csir_rules" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "rule_key" text NOT NULL,
    "value" jsonb NOT NULL,
    "unit" text,
    "effective_from" date NOT NULL,
    "effective_to" date,
    "source_ref" text NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "note" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "csir_rules_check" CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT "csir_rules_rule_key_check" CHECK (btrim(rule_key) <> ''::text),
    CONSTRAINT "csir_rules_source_ref_check" CHECK (btrim(source_ref) <> ''::text),
    CONSTRAINT "csir_rules_pkey" PRIMARY KEY (id),
    CONSTRAINT "csir_rules_rule_key_effective_from_key" UNIQUE (rule_key, effective_from)
);
CREATE INDEX csir_rules_created_by_fk_idx ON public.csir_rules USING btree (created_by);

INSERT INTO public.csir_rules (id, rule_key, value, unit, effective_from, effective_to, source_ref, verified, note, created_by)
VALUES
    ('048404d6-3958-405c-9d17-4ed973e68b6f', 'pms.designation_pay_level', '{"Scientist":11,"Scientist-B":10,"Scientist-C":11,"Scientist-D":12,"Scientist-E":13,"Scientist-F":13,"Scientist-G":14,"Chief Scientist":14,"Senior Scientist":12,"Principal Scientist":13}'::jsonb, 'pay level', '2026-01-01'::date, NULL, 'PMS Guidelines 2026, Annexure-A', false, NULL, NULL),
    ('066c2e5b-ccdf-4416-93ac-63f329152448', 'project_staff.maternity_leave_days', '180'::jsonb, 'days', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('1491a2cb-28db-49b1-8bf8-e563ea0accaf', 'project_staff.tenure_cap_years', '6'::jsonb, 'years', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('1fa27981-bff9-4d61-97c9-8264c9372765', 'project_staff.direct_engagement_max_project_months', '12'::jsonb, 'months', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('37cc59ba-4e75-4a1b-9762-bafa2463f05a', 'project_staff.waitlist_min_project_months', '18'::jsonb, 'months', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('54c28b80-05dd-42fe-821a-5210f6ae085e', 'pms.designation_committee_tier', '{"Scientist":"I","Scientist-B":"I","Scientist-C":"I","Scientist-D":"I","Scientist-E":"II","Scientist-F":"III","Scientist-G":"IV","Chief Scientist":"IV","Senior Scientist":"I","Principal Scientist":"II"}'::jsonb, NULL, '2026-01-01'::date, NULL, 'PMS Guidelines 2026, Evaluation Committees', false, NULL, NULL),
    ('57290f3c-f4a6-4ab1-b5cb-84586fc8f228', 'committee.minutes_due_days', '{"LSG":2,"TFM":7}'::jsonb, 'days', '2025-04-25'::date, NULL, '§5', false, NULL, NULL),
    ('70749bf7-7d0b-4db4-8f79-597fec976a1e', 'project_staff.age_relaxation_years', '{"SC":5,"ST":5,"OBC":3,"PwBD":5,"Women":5}'::jsonb, 'years', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('728c3174-b49a-41c5-bacb-db8ed100f6bd', 'project_staff.waitlist_validity_months', '12'::jsonb, 'months', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('7b8d6cf2-9aef-4d43-a205-2db76ca77e92', 'project_staff.selection_quorum', '{"chair":1,"members":2}'::jsonb, NULL, '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('96574979-400a-4813-9a2e-151b8d016bf4', 'monitoring.cpd_halfyearly_due', '["04-15","09-15"]'::jsonb, NULL, '2025-04-25'::date, NULL, '§5', false, NULL, NULL),
    ('9c83936f-7150-4d7a-b62e-24fa839a1ebb', 'project.major_equipment_threshold_inr', '500000'::jsonb, 'INR', '2025-04-25'::date, NULL, '§3.1', false, NULL, NULL),
    ('aa9e93e6-ad3c-40cb-97d0-3742ff3cf4e8', 'project_staff.paternity_leave_days', '15'::jsonb, 'days', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('cb074bd7-018a-4cea-b7d6-d269a38d53d4', 'pms.questionnaire_b_min_pay_level', '13'::jsonb, 'pay level', '2026-01-01'::date, NULL, 'PMS Guidelines 2026, Annexure-A Part II', false, NULL, NULL),
    ('d3897aff-6c89-40a4-ba25-a7790a0143fb', 'project.cost_overrun_dg_limit_pct', '20'::jsonb, 'pct', '2025-04-25'::date, NULL, '§6.4', false, NULL, NULL),
    ('eeeabc84-cee3-4abb-a4d0-d57432680897', 'project_staff.tenure_cap_years_short_industry', '7'::jsonb, 'years', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL),
    ('f21778a1-7926-4487-9524-8027536fdaaf', 'project_staff.paid_leave_days_per_year', '12'::jsonb, 'days', '2025-04-25'::date, NULL, '§3.3', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
