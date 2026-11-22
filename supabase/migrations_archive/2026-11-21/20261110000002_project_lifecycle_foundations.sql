-- ============================================================
-- 20261110000002_project_lifecycle_foundations
-- Project lifecycle PL0 (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md).
--
--   1. project_schemes  — the tracks (ULIP, HQ) and who leads each.
--   2. projects.stage   — one enforced list instead of free-text status.
--                         The upload template said "Ongoing / Completed"
--                         while 22 client sites tested = 'Active'.
--   3. Typed twins      — sanctioned_cost / start_date / end_date beside
--                         the text columns the Excel importer writes.
--   4. track            — on projects and proposals.
--   5. project_id       — beside every project-NUMBER column (proposals,
--                         reports, project staff, PhD students, MoUs, tech
--                         transfers), kept true as projects come and go. "ProjectNo"
--                         is not unique (one umbrella number, several work
--                         packages — see 20261102000006 §6a); "ProjectID"
--                         is the key.
--   6. Private drafts   — a DRAFT proposal is readable by its creator, its
--                         PI and its named co-PIs only.
--   7. PME access       — read submitted proposals and progress reports;
--                         write the project domain.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. Tracks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_schemes (
    code                text PRIMARY KEY,
    name                text NOT NULL,
    -- ULIP: Head RPBD. A setting, not a role.
    leader_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    review_committee_id uuid REFERENCES public.committees(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Structural rows, not demo data: projects.track and proposals.track
-- reference them, so they ship with the schema rather than supabase/seed/.
INSERT INTO public.project_schemes (code, name) VALUES
    ('ULIP', 'In-house (ULIP)'),
    ('HQ',   'CSIR HQ scheme')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.project_schemes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_schemes_select" ON public.project_schemes;
CREATE POLICY "project_schemes_select" ON public.project_schemes
    FOR SELECT TO authenticated
    USING (public.caller_is_verified());

DROP POLICY IF EXISTS "project_schemes_write_master" ON public.project_schemes;
CREATE POLICY "project_schemes_write_master" ON public.project_schemes
    FOR ALL TO authenticated
    USING (public.user_has_role('MasterAdmin'))
    WITH CHECK (public.user_has_role('MasterAdmin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_schemes TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_project_schemes_updated_at ON public.project_schemes;
CREATE TRIGGER trg_project_schemes_updated_at
    BEFORE UPDATE ON public.project_schemes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Stage vocabulary ────────────────────────────────────────────────
-- Mirrored in src/lib/projects/stage.ts — change both together.

CREATE OR REPLACE FUNCTION public.project_stage_of_status(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(btrim(coalesce(p_status, '')))
    WHEN 'active'      THEN 'ACTIVE'
    WHEN 'ongoing'     THEN 'ACTIVE'
    WHEN 'on-going'    THEN 'ACTIVE'
    WHEN 'on going'    THEN 'ACTIVE'
    WHEN 'running'     THEN 'ACTIVE'
    WHEN 'in progress' THEN 'ACTIVE'
    WHEN 'sanctioned'  THEN 'SANCTIONED'
    WHEN 'approved'    THEN 'SANCTIONED'
    WHEN 'on hold'     THEN 'ON_HOLD'
    WHEN 'on-hold'     THEN 'ON_HOLD'
    WHEN 'hold'        THEN 'ON_HOLD'
    WHEN 'closing'     THEN 'CLOSING'
    WHEN 'completed'   THEN 'CLOSED'
    WHEN 'complete'    THEN 'CLOSED'
    WHEN 'closed'      THEN 'CLOSED'
    WHEN 'archived'    THEN 'ARCHIVED'
    WHEN 'foreclosed'  THEN 'FORECLOSED'
    WHEN 'terminated'  THEN 'FORECLOSED'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_stage_label(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_stage
    WHEN 'SANCTIONED' THEN 'Sanctioned'
    WHEN 'ACTIVE'     THEN 'Active'
    WHEN 'ON_HOLD'    THEN 'On Hold'
    WHEN 'CLOSING'    THEN 'Closing'
    WHEN 'CLOSED'     THEN 'Completed'
    WHEN 'ARCHIVED'   THEN 'Archived'
    WHEN 'FORECLOSED' THEN 'Foreclosed'
    ELSE NULL
  END;
$$;

-- "₹ 1,250.50 L" → 1250.50. NULL when nothing numeric is left, or when what
-- is left is not a number ("1.2.3") — a guess here would be read as money.
CREATE OR REPLACE FUNCTION public.project_parse_amount(p text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
    RETURN nullif(regexp_replace(coalesce(p, ''), '[^0-9.\-]+', '', 'g'), '')::numeric;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

-- ── 3. projects: stage, track, typed twins ─────────────────────────────
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS stage           text,
    ADD COLUMN IF NOT EXISTS track           text REFERENCES public.project_schemes(code),
    ADD COLUMN IF NOT EXISTS sanctioned_cost numeric,
    ADD COLUMN IF NOT EXISTS start_date      date,
    ADD COLUMN IF NOT EXISTS end_date        date;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_stage_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_stage_check CHECK (
    stage IS NULL OR stage IN (
        'SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'CLOSED', 'ARCHIVED', 'FORECLOSED'
    ));

CREATE INDEX IF NOT EXISTS projects_project_no_idx ON public.projects ("ProjectNo");
CREATE INDEX IF NOT EXISTS projects_stage_idx      ON public.projects (stage);

-- Backfill before the trigger exists, so this is a plain write. The text
-- columns are left exactly as entered. track is set only where the number
-- says so unambiguously: the nine HQ category prefixes (guidelines §2.2) and
-- a literal ULIP prefix. Everything else stays NULL for PME to classify.
UPDATE public.projects SET
    stage           = coalesce(stage, public.project_stage_of_status("ProjectStatus")),
    sanctioned_cost = coalesce(sanctioned_cost, public.project_parse_amount("SanctionedCost")),
    start_date      = coalesce(start_date, public.try_parse_date("StartDate")),
    end_date        = coalesce(end_date, public.try_parse_date("CompletioDate")),
    track           = coalesce(track, CASE
        WHEN "ProjectNo" ~* '^(FIR|FBR|NCP|FTT|FTC|MMP|FCP|HCP|IST)[0-9]' THEN 'HQ'
        WHEN "ProjectNo" ~* '^ULIP' THEN 'ULIP'
        ELSE NULL END);

-- Keeps the pairs in step on every later write.
--   stage changed          → it is authoritative; the status text follows.
--   only the text changed  → the importer or the form wrote it; stage follows.
--   an unrecognised text   → stage NULL, text kept. Shown on the PME desk.
CREATE OR REPLACE FUNCTION public.projects_derive_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.stage IS NULL THEN
            NEW.stage := public.project_stage_of_status(NEW."ProjectStatus");
        ELSE
            NEW."ProjectStatus" := public.project_stage_label(NEW.stage);
        END IF;
        NEW.sanctioned_cost := coalesce(NEW.sanctioned_cost, public.project_parse_amount(NEW."SanctionedCost"));
        NEW.start_date      := coalesce(NEW.start_date, public.try_parse_date(NEW."StartDate"));
        NEW.end_date        := coalesce(NEW.end_date, public.try_parse_date(NEW."CompletioDate"));
        RETURN NEW;
    END IF;

    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
        IF NEW.stage IS NOT NULL THEN
            NEW."ProjectStatus" := public.project_stage_label(NEW.stage);
        END IF;
    ELSIF NEW."ProjectStatus" IS DISTINCT FROM OLD."ProjectStatus" THEN
        NEW.stage := public.project_stage_of_status(NEW."ProjectStatus");
    END IF;

    IF NEW."SanctionedCost" IS DISTINCT FROM OLD."SanctionedCost" THEN
        NEW.sanctioned_cost := public.project_parse_amount(NEW."SanctionedCost");
    END IF;
    IF NEW."StartDate" IS DISTINCT FROM OLD."StartDate" THEN
        NEW.start_date := public.try_parse_date(NEW."StartDate");
    END IF;
    IF NEW."CompletioDate" IS DISTINCT FROM OLD."CompletioDate" THEN
        NEW.end_date := public.try_parse_date(NEW."CompletioDate");
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_derive_columns ON public.projects;
CREATE TRIGGER trg_projects_derive_columns
    BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_derive_columns();

-- ── 4. proposals.track ─────────────────────────────────────────────────
ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS track text REFERENCES public.project_schemes(code);

-- ── 5. project_id beside every project-number column ───────────────────
ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.project_reports
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.project_staff
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.phd_students
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.mous
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;
ALTER TABLE public.tech_transfers
    ADD COLUMN IF NOT EXISTS project_id text REFERENCES public.projects("ProjectID") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_project_id_idx       ON public.proposals (project_id);
CREATE INDEX IF NOT EXISTS project_reports_project_id_idx ON public.project_reports (project_id);
CREATE INDEX IF NOT EXISTS project_staff_project_id_idx   ON public.project_staff (project_id);
CREATE INDEX IF NOT EXISTS phd_students_project_id_idx   ON public.phd_students (project_id);
CREATE INDEX IF NOT EXISTS mous_project_id_idx            ON public.mous (project_id);
CREATE INDEX IF NOT EXISTS tech_transfers_project_id_idx  ON public.tech_transfers (project_id);

-- Resolve a number to a key ONLY when exactly one project carries it. A
-- shared umbrella number stays unlinked: guessing which work package a
-- report belongs to would file it under the wrong PI.
--
-- SECURITY DEFINER because the writer's own RLS view of `projects` is
-- partial (a PI sees their own work package, not its three siblings), which
-- would make a shared number look unique.
CREATE OR REPLACE FUNCTION public.sync_project_key()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new_no text := nullif(btrim(to_jsonb(NEW) ->> TG_ARGV[0]), '');
    v_id     text;
    v_n      int;
BEGIN
    -- The number moved and nobody set the key by hand: the old key is stale.
    IF TG_OP = 'UPDATE'
       AND v_new_no IS DISTINCT FROM nullif(btrim(to_jsonb(OLD) ->> TG_ARGV[0]), '')
       AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
        NEW.project_id := NULL;
    END IF;

    IF NEW.project_id IS NULL AND v_new_no IS NOT NULL THEN
        SELECT min("ProjectID"), count(*) INTO v_id, v_n
          FROM public.projects WHERE "ProjectNo" = v_new_no;
        IF v_n = 1 THEN
            NEW.project_id := v_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_project_key() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proposals_project_key ON public.proposals;
CREATE TRIGGER trg_proposals_project_key
    BEFORE INSERT OR UPDATE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('linked_project_no');

DROP TRIGGER IF EXISTS trg_project_reports_project_key ON public.project_reports;
CREATE TRIGGER trg_project_reports_project_key
    BEFORE INSERT OR UPDATE ON public.project_reports
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('project_no');

DROP TRIGGER IF EXISTS trg_project_staff_project_key ON public.project_staff;
CREATE TRIGGER trg_project_staff_project_key
    BEFORE INSERT OR UPDATE ON public.project_staff
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('ProjectNo');

DROP TRIGGER IF EXISTS trg_phd_students_project_key ON public.phd_students;
CREATE TRIGGER trg_phd_students_project_key
    BEFORE INSERT OR UPDATE ON public.phd_students
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('ProjectNo');

DROP TRIGGER IF EXISTS trg_mous_project_key ON public.mous;
CREATE TRIGGER trg_mous_project_key
    BEFORE INSERT OR UPDATE ON public.mous
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('linked_project_no');

DROP TRIGGER IF EXISTS trg_tech_transfers_project_key ON public.tech_transfers;
CREATE TRIGGER trg_tech_transfers_project_key
    BEFORE INSERT OR UPDATE ON public.tech_transfers
    FOR EACH ROW EXECUTE FUNCTION public.sync_project_key('linked_project_no');

-- Backfill, set-based, same rule as the trigger. The updated_at triggers on
-- mous / tech_transfers are held off so a schema change does not make every
-- linked row look freshly edited.
ALTER TABLE public.mous           DISABLE TRIGGER trg_mous_updated_at;
ALTER TABLE public.tech_transfers DISABLE TRIGGER trg_tech_transfers_updated_at;

WITH uniq AS (
    SELECT "ProjectNo" AS no, min("ProjectID") AS id
      FROM public.projects
     WHERE "ProjectNo" IS NOT NULL AND btrim("ProjectNo") <> ''
     GROUP BY "ProjectNo" HAVING count(*) = 1
),
p AS (UPDATE public.proposals t       SET project_id = u.id FROM uniq u
       WHERE t.project_id IS NULL AND btrim(t.linked_project_no) = u.no RETURNING 1),
r AS (UPDATE public.project_reports t SET project_id = u.id FROM uniq u
       WHERE t.project_id IS NULL AND btrim(t.project_no) = u.no RETURNING 1),
s AS (UPDATE public.project_staff t   SET project_id = u.id FROM uniq u
       WHERE t.project_id IS NULL AND btrim(t."ProjectNo") = u.no RETURNING 1),
h AS (UPDATE public.phd_students t    SET project_id = u.id FROM uniq u
       WHERE t.project_id IS NULL AND btrim(t."ProjectNo") = u.no RETURNING 1),
m AS (UPDATE public.mous t            SET project_id = u.id FROM uniq u
       WHERE t.project_id IS NULL AND btrim(t.linked_project_no) = u.no RETURNING 1)
UPDATE public.tech_transfers t SET project_id = u.id FROM uniq u
 WHERE t.project_id IS NULL AND btrim(t.linked_project_no) = u.no;

ALTER TABLE public.mous           ENABLE TRIGGER trg_mous_updated_at;
ALTER TABLE public.tech_transfers ENABLE TRIGGER trg_tech_transfers_updated_at;

-- The other half: the PROJECT set changes after the children are in.
-- sync_project_key only looks when a child row is written, so a link made
-- while a number was unique would survive that number becoming shared — the
-- staff of four work packages all filed under whichever was uploaded first.
-- This keeps the links a function of the current data, not of upload order:
--   number now carried by exactly one project → link its unlinked children
--   number just became shared (1 → 2)         → unlink them; PME decides
-- Beyond two, links are left alone: by then any that exist were set by a
-- person choosing between work packages, not inferred.
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

    UPDATE public.proposals       SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    UPDATE public.project_reports SET project_id = v_id WHERE btrim(project_no) = v_no        AND project_id IS DISTINCT FROM v_id;
    UPDATE public.project_staff   SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.phd_students    SET project_id = v_id WHERE btrim("ProjectNo") = v_no       AND project_id IS DISTINCT FROM v_id;
    UPDATE public.mous            SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    UPDATE public.tech_transfers  SET project_id = v_id WHERE btrim(linked_project_no) = v_no AND project_id IS DISTINCT FROM v_id;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.projects_resync_child_keys() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_resync_child_keys ON public.projects;
CREATE TRIGGER trg_projects_resync_child_keys
    AFTER INSERT OR UPDATE OF "ProjectNo" ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_resync_child_keys();

-- ── 6. Private drafts ──────────────────────────────────────────────────
-- Is the caller a named co-PI? SECURITY DEFINER because proposal_copis's own
-- SELECT policy calls proposals_can_read(), which calls this — as an invoker
-- function that is infinite recursion (42P17). It answers only about the
-- caller, so it cannot be used to probe anyone else's proposals.
CREATE OR REPLACE FUNCTION public.proposal_caller_is_copi(p_proposal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.proposal_copis c
         WHERE c.proposal_id = p_proposal_id
           AND c.staff_id = public.caller_staff_id()
    );
$$;

REVOKE ALL ON FUNCTION public.proposal_caller_is_copi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_caller_is_copi(uuid) TO authenticated, service_role;

-- Was: PI, creator, the division's managers, Director and every admin, at
-- every status. A scientist's unsubmitted idea was readable by all of them.
-- Now a DRAFT is the PI's and co-PIs' alone; the wider audience (plus PME
-- and the scheme leader) begins at submission. Co-PIs had no read at all.
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
        OR public.caller_is_pme()
        OR EXISTS (
            SELECT 1 FROM public.project_schemes s
             WHERE s.code = p_row.track
               AND s.leader_user_id = (SELECT auth.uid()))
      )
    );
$$;

-- ── 7. PME access ──────────────────────────────────────────────────────
-- Read every progress report (reviewing stays with the existing reviewers).
CREATE OR REPLACE FUNCTION public.project_reports_can_read(d public.project_reports)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d.submitted_by = (SELECT auth.uid())
      OR public.project_reports_can_review(d)
      OR public.caller_is_pme();
$$;

-- Own the project domain. Separate policies, so the existing HRAdmin /
-- SystemAdmin / MasterAdmin write policies are untouched: they are withdrawn
-- at rollout (plan PL7), once PME accounts exist to take over — removing
-- them here would leave a live institute with nobody able to edit a project.
DROP POLICY IF EXISTS "projects_write_pme" ON public.projects;
CREATE POLICY "projects_write_pme" ON public.projects
    FOR ALL TO authenticated
    USING (public.caller_is_pme()) WITH CHECK (public.caller_is_pme());

DROP POLICY IF EXISTS "project_staff_write_pme" ON public.project_staff;
CREATE POLICY "project_staff_write_pme" ON public.project_staff
    FOR ALL TO authenticated
    USING (public.caller_is_pme()) WITH CHECK (public.caller_is_pme());

DROP POLICY IF EXISTS "mous_write_pme" ON public.mous;
CREATE POLICY "mous_write_pme" ON public.mous
    FOR ALL TO authenticated
    USING (public.caller_is_pme()) WITH CHECK (public.caller_is_pme());

DROP POLICY IF EXISTS "tech_transfers_write_pme" ON public.tech_transfers;
CREATE POLICY "tech_transfers_write_pme" ON public.tech_transfers
    FOR ALL TO authenticated
    USING (public.caller_is_pme()) WITH CHECK (public.caller_is_pme());

-- ── 8. Assert the outcome ──────────────────────────────────────────────
DO $$
BEGIN
    IF has_function_privilege('authenticated', 'public.sync_project_key()', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can call sync_project_key() directly';
    END IF;
    IF has_function_privilege('anon', 'public.proposal_caller_is_copi(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can call proposal_caller_is_copi()';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.project_schemes WHERE code IN ('ULIP', 'HQ') HAVING count(*) = 2) THEN
        RAISE EXCEPTION 'project_schemes is missing ULIP or HQ';
    END IF;
END $$;
