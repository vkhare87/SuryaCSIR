-- ============================================================
-- 20260726000001_pms_senior_track
-- Scientist G / Chief Scientist / Outstanding Scientist /
-- Distinguished Scientist file CSIR Annexure-I; the Director files
-- Annexure-II. Both are outside the 2026 guidelines implemented in
-- 20260712000004_pms.sql, so they run as a parallel track on the same
-- tables: a `track` discriminator on pms_reports, a categorical
-- pen-picture payload on pms_evaluations, and a score-free finalize RPC.
--
-- Additive: no existing row, policy, or RPC changes behaviour for
-- track = 'STANDARD'.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. COLUMNS
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.pms_reports
    ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'STANDARD'
    CHECK (track IN ('STANDARD','ANNEXURE_I','ANNEXURE_II'));

COMMENT ON COLUMN public.pms_reports.track IS
    'Which CSIR proforma this report uses. Derived on INSERT from the '
    'caller''s staff designation by trg_pms_reports_track — never client-set.';

-- Appendix-C pen picture: categorical ratings + a ~100 word narrative.
-- Senior tracks leave scores = {} and total_score = NULL.
ALTER TABLE public.pms_evaluations
    ADD COLUMN IF NOT EXISTS pen_picture jsonb NOT NULL DEFAULT '{}';

-- Tier IV = the Annexure-I evaluation committee (Scientist G tier).
ALTER TABLE public.pms_evaluation_committees
    DROP CONSTRAINT IF EXISTS pms_evaluation_committees_tier_check;
ALTER TABLE public.pms_evaluation_committees
    ADD CONSTRAINT pms_evaluation_committees_tier_check
    CHECK (tier IN ('I','II','III','IV'));

-- ──────────────────────────────────────────────────────────────
-- 2. TRACK DERIVATION
-- ──────────────────────────────────────────────────────────────

-- Authorization: reads only the caller's own staff row (auth.uid(), falling
-- back to the verified email like caller_staff_name does) and the caller's
-- own roles. Returns a classification, never another person's data.
CREATE OR REPLACE FUNCTION public.pms_caller_track()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_designation text;
BEGIN
    IF public.user_has_role('Director') THEN
        RETURN 'ANNEXURE_II';
    END IF;

    SELECT trim("Designation") INTO v_designation
      FROM public.staff
     WHERE user_id = auth.uid()
        OR (user_id IS NULL AND lower("Email") = public.caller_email())
     ORDER BY (user_id = auth.uid()) DESC NULLS LAST
     LIMIT 1;

    IF v_designation ~* '^scientist[[:space:]-]*G$'
       OR v_designation ILIKE 'Chief Scientist'
       OR v_designation ILIKE 'Outstanding Scientist'
       OR v_designation ILIKE 'Distinguished Scientist' THEN
        RETURN 'ANNEXURE_I';
    END IF;

    RETURN 'STANDARD';
END;
$$;

-- Not SECURITY DEFINER: it runs with the writer's rights on a row RLS has
-- already authorized. Its only job is to stop the client choosing its own
-- proforma, on INSERT and on every later UPDATE.
CREATE OR REPLACE FUNCTION public.pms_set_report_track()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.track := coalesce(public.pms_caller_track(), 'STANDARD');
    ELSE
        NEW.track := OLD.track;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_reports_track ON public.pms_reports;
CREATE TRIGGER trg_pms_reports_track
    BEFORE INSERT OR UPDATE ON public.pms_reports
    FOR EACH ROW EXECUTE FUNCTION public.pms_set_report_track();

-- ──────────────────────────────────────────────────────────────
-- 3. RPC — senior-track finalize (no score)
-- ──────────────────────────────────────────────────────────────
-- Annexure-I: the tier-IV Evaluation Committee files pen pictures, the
-- existing trg_pms_evaluation_complete advances the report to
-- EMPOWERED_COMMITTEE_REVIEW, and the Director/DG review remark lands here.
-- Annexure-II: the DG evaluates outside SURYA, so an administrator records
-- the returned Appendix-C outcome directly from SUBMITTED.
--
-- score_communicated_at is deliberately left NULL: there is no score, so the
-- 15-day representation window must not open.
CREATE OR REPLACE FUNCTION public.pms_finalize_senior_report(
    p_report_id uuid,
    p_remarks   text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_report public.pms_reports%ROWTYPE;
BEGIN
    SELECT * INTO v_report FROM public.pms_reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;

    IF NOT (public.pms_is_admin()
            OR EXISTS (SELECT 1 FROM public.pms_empowered_committee_members
                        WHERE cycle_id = v_report.cycle_id AND user_id = auth.uid())) THEN
        RAISE EXCEPTION 'Only PMS administrators or Empowered Committee members can finalize senior-track reports';
    END IF;

    IF v_report.track = 'STANDARD' THEN
        RAISE EXCEPTION 'Standard-track reports are finalized with a score via pms_finalize_report';
    END IF;
    IF v_report.status NOT IN ('SUBMITTED','UNDER_EVALUATION_COMMITTEE_REVIEW','EMPOWERED_COMMITTEE_REVIEW') THEN
        RAISE EXCEPTION 'Report cannot be finalized from status %', v_report.status;
    END IF;
    IF length(trim(coalesce(p_remarks, ''))) < 50 THEN
        RAISE EXCEPTION 'Review remarks must be at least 50 characters';
    END IF;

    UPDATE public.pms_reports
        SET status        = 'FINALIZED',
            system_remark = p_remarks,
            updated_at    = now()
        WHERE id = p_report_id;

    INSERT INTO public.pms_audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'SENIOR_REPORT_FINALIZED', 'pms_reports', p_report_id,
            jsonb_build_object('track', v_report.track));

    INSERT INTO public.pms_notifications (user_id, type, title, body, report_id)
    VALUES (v_report.scientist_id, 'report_finalized',
            'Your performance mapping proforma has been finalized',
            'The reviewing authority has recorded its evaluation on your report.',
            p_report_id);
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. RLS
-- ──────────────────────────────────────────────────────────────
-- No new tables and no new policies: `track` and `pen_picture` are columns on
-- pms_reports / pms_evaluations, both already RLS-enabled with policies that
-- gate the whole row. The Nov 30 lock triggers likewise already cover them.
