-- ============================================================
-- 20261111000003_project_monitoring
-- Project lifecycle PL4 — monitoring
-- (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md §8.3–8.5; guidelines §5).
--
--   1. project_review_slots — every review and progress report a project
--      owes, generated from its track, category and dates. A report nobody
--      wrote shows as overdue without anyone creating a record.
--   2. Recording a review: decision, minutes, and a minutes deadline.
--   3. Committee link: scheduling a review puts it on a meeting's agenda.
--   4. Progress reports attach themselves to the slot they answer.
--   5. Call for review: the Director (or PME) asks for one at any time.
--   6. project_portfolio: one row per project for management.
--
-- Rerun: idempotent.
-- ============================================================

-- ── 1. What a project owes, by track and category ─────────────────────
-- Guidelines §5. Months are the calendar months whose ends close a period:
-- {3,9} half-yearly (Apr–Sep, Oct–Mar), {3,6,9,12} quarterly.
--   every project      progress report, half-yearly, due 15 days after
--   ULIP               the ULIP review committee, half-yearly
--   HQ                 Research Council, half-yearly (all lab projects)
--   MMP FBR NCP FIR
--   FTT FTC            Task Force, quarterly; minutes within 7 days
--   FCP                Task Force, half-yearly; minutes within 7 days
--   FBR NCP FIR        External Monitoring Committee, half-yearly
--   MMP FTT FTC        Stage-gate review, at most every 6 months
-- Not generated: the Mission Director's monthly MMP review and the Lab
-- Strategic Group, which meets "as and when required" — use Call for review.
CREATE OR REPLACE FUNCTION public.project_slot_plan(p_track text, p_category text)
RETURNS TABLE (kind text, body text, months int[], minutes_days int)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT v.kind, v.body, v.months, v.minutes_days FROM (VALUES
    ('PROGRESS_REPORT',      'Progress report',                 ARRAY[3, 9],        NULL::int, true),
    ('REVIEW_COMMITTEE',     'ULIP review committee',           ARRAY[3, 9],        NULL,      p_track = 'ULIP'),
    ('RESEARCH_COUNCIL',     'Research Council',                ARRAY[3, 9],        NULL,      p_track = 'HQ'),
    ('TASK_FORCE',           'Task Force',                      ARRAY[3, 6, 9, 12], 7,         p_track = 'HQ' AND p_category IN ('MMP','FBR','NCP','FIR','FTT','FTC')),
    ('TASK_FORCE',           'Task Force (FCP)',                ARRAY[3, 9],        7,         p_track = 'HQ' AND p_category = 'FCP'),
    ('MONITORING_COMMITTEE', 'External Monitoring Committee',   ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('FBR','NCP','FIR')),
    ('STAGE_GATE',           'Stage-gate review',               ARRAY[3, 9],        NULL,      p_track = 'HQ' AND p_category IN ('MMP','FTT','FTC'))
  ) v(kind, body, months, minutes_days, applies)
  WHERE applies;
$$;

-- The HQ category of a project: its recorded category when it is one of the
-- nine codes, else the prefix of its number (guidelines §2.2 coding).
CREATE OR REPLACE FUNCTION public.project_category_code(p public.projects)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN upper(left(coalesce(p."ProjectCategory", ''), 3)) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST')
         AND length(btrim(p."ProjectCategory")) = 3 THEN upper(p."ProjectCategory")
    WHEN upper(left(coalesce(p."ProjectNo", ''), 3)) IN ('FIR','FBR','NCP','FTT','FTC','MMP','FCP','HCP','IST')
         THEN upper(left(p."ProjectNo", 3))
  END;
$$;

CREATE TABLE IF NOT EXISTS public.project_review_slots (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    text NOT NULL REFERENCES public.projects("ProjectID") ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('PROGRESS_REPORT', 'REVIEW_COMMITTEE', 'RESEARCH_COUNCIL', 'TASK_FORCE',
                                                'MONITORING_COMMITTEE', 'STAGE_GATE', 'CALLED_REVIEW')),
    body          text NOT NULL,
    period_label  text NOT NULL,
    period_end    date NOT NULL,
    due_date      date NOT NULL,
    -- Generated from the schedule (regenerated when dates change) or called
    -- for by a person (never regenerated).
    generated     boolean NOT NULL DEFAULT true,
    status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'CANCELLED')),
    meeting_id    uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
    held_on       date,
    decision      text CHECK (decision IS NULL OR decision IN (
                      'CONTINUE', 'CONTINUE_WITH_CHANGES', 'HOLD', 'FORECLOSURE_RECOMMENDED',
                      'GO', 'CONDITIONAL_GO', 'KILL', 'RECYCLE')),
    outcome       text,
    minutes_days  int,
    minutes_due   date,
    minutes_document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
    report_id     uuid REFERENCES public.project_reports(id) ON DELETE SET NULL,
    notes         text,
    recorded_by   uuid REFERENCES auth.users(id),
    recorded_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, kind, period_end)
);
CREATE INDEX IF NOT EXISTS project_review_slots_due_idx ON public.project_review_slots (status, due_date);
CREATE INDEX IF NOT EXISTS project_review_slots_project_idx ON public.project_review_slots (project_id, due_date);

ALTER TABLE public.project_review_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_review_slots_select" ON public.project_review_slots;
CREATE POLICY "project_review_slots_select" ON public.project_review_slots
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.projects p WHERE p."ProjectID" = project_review_slots.project_id));
REVOKE INSERT, UPDATE, DELETE ON public.project_review_slots FROM authenticated;
GRANT SELECT ON public.project_review_slots TO authenticated, service_role;

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_doc_type_check CHECK (
    doc_type IN ('receipt_order', 'expenditure_statement', 'milestone_evidence', 'minutes', 'other'));

-- Internal: (re)build a project's schedule. Slots already acted on — held,
-- scheduled into a meeting, answered by a report, or called for by a person —
-- are kept; untouched generated ones are replaced, so moving the end date
-- moves the schedule.
CREATE OR REPLACE FUNCTION public.project_generate_slots(p_project_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr public.projects%ROWTYPE;
BEGIN
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RETURN; END IF;

    DELETE FROM public.project_review_slots
     WHERE project_id = p_project_id AND generated AND status = 'PENDING'
       AND meeting_id IS NULL AND report_id IS NULL;

    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING')
       OR v_pr.start_date IS NULL OR v_pr.end_date IS NULL OR v_pr.end_date < v_pr.start_date THEN
        RETURN;
    END IF;

    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, minutes_days)
    SELECT p_project_id, s.kind, s.body,
           CASE WHEN s.months = ARRAY[3, 9]
                THEN CASE extract(month FROM me)::int WHEN 9 THEN 'H1 ' ELSE 'H2 ' END
                ELSE CASE extract(month FROM me)::int WHEN 6 THEN 'Q1 ' WHEN 9 THEN 'Q2 ' WHEN 12 THEN 'Q3 ' ELSE 'Q4 ' END
           END || public.fiscal_year_of(me),
           me,
           CASE WHEN s.kind = 'PROGRESS_REPORT' THEN me + 15 ELSE me END,
           s.minutes_days
      FROM public.project_slot_plan(v_pr.track, public.project_category_code(v_pr)) s
     CROSS JOIN LATERAL (
        SELECT (g + interval '1 month' - interval '1 day')::date AS me
          FROM generate_series(date_trunc('month', v_pr.start_date)::date, v_pr.end_date, interval '1 month') g
     ) m
     WHERE extract(month FROM me)::int = ANY (s.months)
    ON CONFLICT (project_id, kind, period_end) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.project_generate_slots(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.projects_regenerate_slots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.project_generate_slots(NEW."ProjectID");
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.projects_regenerate_slots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_regenerate_slots ON public.projects;
CREATE TRIGGER trg_projects_regenerate_slots
    -- The text columns too: UPDATE OF fires on the columns a statement names,
    -- and the importer and edit form write "CompletioDate", not end_date
    -- (which a BEFORE trigger derives from it).
    AFTER INSERT OR UPDATE OF stage, track, start_date, end_date, "StartDate", "CompletioDate",
                              "ProjectStatus", "ProjectCategory", "ProjectNo" ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.projects_regenerate_slots();

-- ── 2. Progress reports answer their slot ──────────────────────────────
ALTER TABLE public.project_reports
    ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES public.project_review_slots(id) ON DELETE SET NULL;

-- Before: a report on a known project takes the earliest open report slot.
-- (Runs after trg_project_reports_project_key, which resolves project_id —
-- triggers of the same timing fire in name order.)
CREATE OR REPLACE FUNCTION public.project_reports_take_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.slot_id IS NULL AND NEW.project_id IS NOT NULL THEN
        SELECT s.id INTO NEW.slot_id
          FROM public.project_review_slots s
         WHERE s.project_id = NEW.project_id AND s.kind = 'PROGRESS_REPORT'
           AND s.status = 'PENDING' AND s.report_id IS NULL
         ORDER BY s.due_date
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;
-- After: the slot is answered once the report has been submitted.
CREATE OR REPLACE FUNCTION public.project_reports_answer_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.slot_id IS NOT NULL THEN
        UPDATE public.project_review_slots
           SET report_id = NEW.id,
               status = CASE WHEN NEW.status IN ('SUBMITTED', 'UNDER_REVIEW', 'REVIEWED') THEN 'DONE' ELSE 'PENDING' END,
               recorded_at = CASE WHEN NEW.status IN ('SUBMITTED', 'UNDER_REVIEW', 'REVIEWED') THEN coalesce(recorded_at, now()) END
         WHERE id = NEW.slot_id;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.project_reports_take_slot()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_reports_answer_slot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_reports_slot ON public.project_reports;
CREATE TRIGGER trg_project_reports_slot
    BEFORE INSERT OR UPDATE ON public.project_reports
    FOR EACH ROW EXECUTE FUNCTION public.project_reports_take_slot();
DROP TRIGGER IF EXISTS trg_project_reports_slot_answer ON public.project_reports;
CREATE TRIGGER trg_project_reports_slot_answer
    AFTER INSERT OR UPDATE OF status, slot_id ON public.project_reports
    FOR EACH ROW EXECUTE FUNCTION public.project_reports_answer_slot();

-- ── 3. Committee link: put a review on a meeting's agenda ──────────────
ALTER TABLE public.agenda_items
    ADD COLUMN IF NOT EXISTS subject_type text CHECK (subject_type IS NULL OR subject_type IN ('project_review', 'proposal')),
    ADD COLUMN IF NOT EXISTS subject_id   text;

CREATE OR REPLACE FUNCTION public.project_slot_schedule(p_slot_id uuid, p_meeting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_s  public.project_review_slots%ROWTYPE;
    v_pr public.projects%ROWTYPE;
    v_by text;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME schedules a review, and not on a project of their own';
    END IF;
    IF v_s.kind = 'PROGRESS_REPORT' THEN RAISE EXCEPTION 'A progress report is not held at a meeting'; END IF;
    IF v_s.status <> 'PENDING' THEN RAISE EXCEPTION 'This review has already been held'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id) THEN RAISE EXCEPTION 'Meeting not found'; END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = v_s.project_id;
    SELECT "ID" INTO v_by FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

    UPDATE public.project_review_slots SET meeting_id = p_meeting_id WHERE id = p_slot_id;
    DELETE FROM public.agenda_items WHERE subject_type = 'project_review' AND subject_id = p_slot_id::text;
    INSERT INTO public.agenda_items (meeting_id, sequence, description, proposed_by, subject_type, subject_id)
    VALUES (p_meeting_id,
            coalesce((SELECT max(sequence) FROM public.agenda_items WHERE meeting_id = p_meeting_id), 0) + 1,
            v_s.body || ' — ' || v_pr."ProjectNo" || ' ' || coalesce(v_pr."ProjectName", '') || ' (' || v_s.period_label || ')',
            coalesce(v_by, 'PME'), 'project_review', p_slot_id::text);
END;
$$;

-- ── 4. Recording what a review decided ─────────────────────────────────
--   CONTINUE / CONTINUE_WITH_CHANGES / HOLD / FORECLOSURE_RECOMMENDED, or for
--   a stage-gate GO / CONDITIONAL_GO / HOLD / KILL / RECYCLE (guidelines §4.2).
--   HOLD puts a running project on hold; a go-ahead takes it off hold.
--   Foreclosure and KILL are recorded here and carried out through a
--   foreclosure request (PL5).
CREATE OR REPLACE FUNCTION public.project_slot_record(
    p_slot_id      uuid,
    p_held_on      date,
    p_decision     text,
    p_outcome      text,
    p_minutes_document_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_s     public.project_review_slots%ROWTYPE;
    v_stage text;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME records a review, and not on a project of their own';
    END IF;
    IF v_s.kind = 'PROGRESS_REPORT' THEN RAISE EXCEPTION 'A progress report is answered by filing the report'; END IF;
    IF v_s.status <> 'PENDING' THEN RAISE EXCEPTION 'This review has already been recorded'; END IF;
    IF p_held_on IS NULL THEN RAISE EXCEPTION 'Give the date the review was held'; END IF;
    IF NOT coalesce(CASE WHEN v_s.kind = 'STAGE_GATE'
                         THEN p_decision IN ('GO', 'CONDITIONAL_GO', 'HOLD', 'KILL', 'RECYCLE')
                         ELSE p_decision IN ('CONTINUE', 'CONTINUE_WITH_CHANGES', 'HOLD', 'FORECLOSURE_RECOMMENDED') END, false) THEN
        RAISE EXCEPTION 'Decision % does not apply to a %', coalesce(p_decision, '(none)'), lower(v_s.body);
    END IF;
    IF p_minutes_document_id IS NOT NULL THEN
        PERFORM public.project_assert_document(v_s.project_id, p_minutes_document_id, 'minutes');
    END IF;

    UPDATE public.project_review_slots
       SET status = 'DONE', held_on = p_held_on, decision = p_decision, outcome = nullif(btrim(p_outcome), ''),
           minutes_document_id = p_minutes_document_id,
           minutes_due = CASE WHEN p_minutes_document_id IS NULL AND minutes_days IS NOT NULL
                              THEN p_held_on + minutes_days END,
           recorded_by = auth.uid(), recorded_at = now()
     WHERE id = p_slot_id;

    SELECT stage INTO v_stage FROM public.projects WHERE "ProjectID" = v_s.project_id;
    IF p_decision = 'HOLD' AND v_stage = 'ACTIVE' THEN
        UPDATE public.projects SET stage = 'ON_HOLD' WHERE "ProjectID" = v_s.project_id;
    ELSIF p_decision IN ('CONTINUE', 'CONTINUE_WITH_CHANGES', 'GO', 'CONDITIONAL_GO') AND v_stage = 'ON_HOLD' THEN
        UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = v_s.project_id;
    END IF;
END;
$$;

-- Minutes filed after the meeting.
CREATE OR REPLACE FUNCTION public.project_slot_add_minutes(p_slot_id uuid, p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_s public.project_review_slots%ROWTYPE;
BEGIN
    SELECT * INTO v_s FROM public.project_review_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
    IF NOT public.project_caller_is_office(v_s.project_id) THEN
        RAISE EXCEPTION 'Only PME files minutes, and not on a project of their own';
    END IF;
    IF v_s.status <> 'DONE' THEN RAISE EXCEPTION 'Record the review first'; END IF;
    PERFORM public.project_assert_document(v_s.project_id, p_document_id, 'minutes');
    UPDATE public.project_review_slots SET minutes_document_id = p_document_id, minutes_due = NULL WHERE id = p_slot_id;
END;
$$;

-- ── 5. Call for review ─────────────────────────────────────────────────
-- The Director (or PME) asks for a review at any time; the PI is notified.
CREATE OR REPLACE FUNCTION public.project_call_review(p_project_id text, p_due_date date, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pr  public.projects%ROWTYPE;
    v_id  uuid;
    v_pi  uuid;
BEGIN
    IF public.project_caller_is_party(p_project_id)
       OR NOT (public.caller_has_role('Director') OR public.caller_is_pme() OR public.caller_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'Only the Director or PME can call a review';
    END IF;
    SELECT * INTO v_pr FROM public.projects WHERE "ProjectID" = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    IF v_pr.stage NOT IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') THEN
        RAISE EXCEPTION 'Only a running project can be called for review';
    END IF;
    IF p_due_date IS NULL OR p_due_date < public.ist_today() THEN RAISE EXCEPTION 'Give a review date from today on'; END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Say what the review should look at'; END IF;

    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, generated, notes)
    VALUES (p_project_id, 'CALLED_REVIEW',
            CASE WHEN public.caller_has_role('Director') THEN 'Review called by the Director' ELSE 'Review called by PME' END,
            'Called ' || to_char(public.ist_today(), 'DD Mon YYYY'), p_due_date, p_due_date, false, btrim(p_reason))
    ON CONFLICT (project_id, kind, period_end) DO UPDATE SET notes = EXCLUDED.notes
    RETURNING id INTO v_id;

    SELECT coalesce(
        (SELECT pi_user_id FROM public.proposals WHERE id = v_pr.proposal_id),
        (SELECT user_id FROM public.staff WHERE "ID" = v_pr.pi_staff_id)) INTO v_pi;
    IF v_pi IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
        VALUES (v_pi, 'project_review_called', 'warning',
                'Review called: ' || v_pr."ProjectNo",
                'A review of ' || coalesce(v_pr."ProjectName", v_pr."ProjectNo") || ' is called for '
                    || to_char(p_due_date, 'DD Mon YYYY') || '. ' || btrim(p_reason),
                '/projects/' || p_project_id || '?tab=monitoring', 'rule', 'review_called:' || v_id)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN v_id;
END;
$$;

-- ── 6. Portfolio ───────────────────────────────────────────────────────
-- One row per project the caller may see (security_invoker: every subquery
-- runs under the caller's RLS). Time elapsed, money spent and milestones met
-- side by side, plus what is overdue.
CREATE OR REPLACE VIEW public.project_portfolio WITH (security_invoker = on) AS
SELECT p."ProjectID"            AS project_id,
       p."ProjectNo"            AS project_no,
       p."ProjectName"          AS project_name,
       p."DivisionCode"         AS division_code,
       p."PrincipalInvestigator" AS pi_name,
       p.stage, p.track, p.start_date, p.end_date, p.sanctioned_cost,
       CASE WHEN p.start_date IS NOT NULL AND p.end_date > p.start_date
            THEN least(100, greatest(0, round(100.0 * (public.ist_today() - p.start_date) / (p.end_date - p.start_date))))
       END AS elapsed_pct,
       (SELECT coalesce(sum(amount), 0) FROM public.project_fund_receipts r WHERE r.project_id = p."ProjectID") AS received,
       (SELECT coalesce(sum(amount), 0) FROM public.project_expenditure e WHERE e.project_id = p."ProjectID") AS spent,
       (SELECT count(*) FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status <> 'DROPPED') AS milestones_total,
       (SELECT count(*) FROM public.project_milestones m WHERE m.project_id = p."ProjectID" AND m.status = 'ACHIEVED') AS milestones_achieved,
       (SELECT count(*) FROM public.project_review_slots s
         WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING' AND s.due_date < public.ist_today()) AS overdue,
       (SELECT count(*) FROM public.project_review_slots s
         WHERE s.project_id = p."ProjectID" AND s.status = 'DONE' AND s.minutes_due < public.ist_today()) AS minutes_overdue,
       (SELECT min(s.due_date) FROM public.project_review_slots s
         WHERE s.project_id = p."ProjectID" AND s.status = 'PENDING' AND s.due_date >= public.ist_today()) AS next_due,
       (SELECT max(r.submitted_at)::date FROM public.project_reports r
         WHERE r.project_id = p."ProjectID" AND r.submitted_at IS NOT NULL) AS last_report_on,
       (SELECT s.decision FROM public.project_review_slots s
         WHERE s.project_id = p."ProjectID" AND s.status = 'DONE' AND s.decision IS NOT NULL
         ORDER BY s.held_on DESC NULLS LAST LIMIT 1) AS last_decision
  FROM public.projects p
 WHERE p.stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING');

REVOKE ALL ON public.project_portfolio FROM anon, PUBLIC;
GRANT SELECT ON public.project_portfolio TO authenticated, service_role;

-- What the caller owes on projects they lead: open slots due within 30 days
-- or already past. Answers only about the caller's own projects.
CREATE OR REPLACE FUNCTION public.my_due_project_slots()
RETURNS TABLE (slot_id uuid, project_id text, project_no text, kind text, body text, period_label text, due_date date)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.id, s.project_id, p."ProjectNo", s.kind, s.body, s.period_label, s.due_date
    FROM public.project_review_slots s
    JOIN public.projects p ON p."ProjectID" = s.project_id
   WHERE s.status = 'PENDING'
     AND s.kind IN ('PROGRESS_REPORT', 'CALLED_REVIEW')
     AND s.due_date <= public.ist_today() + 30
     AND public.project_caller_is_party(s.project_id)
   ORDER BY s.due_date;
$$;

-- ── 7. Timeline: reviews ───────────────────────────────────────────────
-- project_log_event (20261111000002) gains the slots branch. Generated slots
-- are not logged as they are created — only what people do with them.
CREATE OR REPLACE FUNCTION public.project_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_amount text;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        IF TG_OP = 'INSERT' THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'created',
                    CASE WHEN NEW.proposal_id IS NOT NULL
                         THEN 'Sanctioned (' || coalesce(NEW.sanction_ref, 'no order number') || ') and created from proposal'
                         ELSE 'Project record created' END);
        ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary)
            VALUES (NEW."ProjectID", auth.uid(), 'stage',
                    'Stage: ' || coalesce(public.project_stage_label(OLD.stage), 'not set') || ' → '
                              || coalesce(public.project_stage_label(NEW.stage), 'not set'));
        END IF;
    ELSIF TG_TABLE_NAME = 'project_fund_receipts' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'receipt',
                CASE WHEN NEW.reverses_id IS NULL THEN 'Received ' || v_amount || ' (' || NEW.order_no || ')'
                     ELSE 'Receipt of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_expenditure' THEN
        v_amount := '₹' || to_char(abs(NEW.amount), 'FM99,99,99,99,990');
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'expenditure',
                CASE WHEN NEW.reverses_id IS NULL
                     THEN 'Spent ' || v_amount || ' on ' || lower(replace(NEW.head, '_', ' ')) || ', ' || NEW.fiscal_year || ' ' || NEW.period
                     ELSE 'Expenditure of ' || v_amount || ' reversed' END, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_milestones' THEN
        IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'milestone',
                    'Milestone "' || NEW.title || '": ' || lower(NEW.status), NEW.id::text);
        END IF;
    ELSIF TG_TABLE_NAME = 'project_documents' THEN
        INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
        VALUES (NEW.project_id, auth.uid(), 'document',
                'Filed ' || replace(NEW.doc_type, '_', ' ') || ': ' || NEW.file_name, NEW.id::text);
    ELSIF TG_TABLE_NAME = 'project_review_slots' THEN
        IF TG_OP = 'INSERT' THEN
            IF NOT NEW.generated THEN
                INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
                VALUES (NEW.project_id, auth.uid(), 'review',
                        NEW.body || ' for ' || to_char(NEW.due_date, 'DD Mon YYYY') || ': ' || coalesce(NEW.notes, ''), NEW.id::text);
            END IF;
        ELSIF NEW.meeting_id IS DISTINCT FROM OLD.meeting_id AND NEW.meeting_id IS NOT NULL THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'review',
                    NEW.body || ' (' || NEW.period_label || ') placed on the agenda of '
                        || coalesce((SELECT title FROM public.meetings WHERE id = NEW.meeting_id), 'a meeting'), NEW.id::text);
        ELSIF NEW.status = 'DONE' AND OLD.status <> 'DONE' THEN
            INSERT INTO public.project_events (project_id, actor, kind, summary, ref_id)
            VALUES (NEW.project_id, auth.uid(), 'review',
                    CASE WHEN NEW.kind = 'PROGRESS_REPORT'
                         THEN 'Progress report submitted (' || NEW.period_label || ')'
                         ELSE NEW.body || ' (' || NEW.period_label || '): ' || lower(replace(NEW.decision, '_', ' '))
                              || coalesce(' — ' || NEW.outcome, '') END, NEW.id::text);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.project_log_event() FROM PUBLIC, anon, authenticated;

-- The projects branch fires on stage changes. Re-created to also watch
-- "ProjectStatus": the importer writes the text, a BEFORE trigger derives the
-- stage, and UPDATE OF only sees columns the statement names — so a stage
-- change by import never reached the timeline.
DROP TRIGGER IF EXISTS trg_projects_log ON public.projects;
CREATE TRIGGER trg_projects_log AFTER INSERT OR UPDATE OF stage, "ProjectStatus" ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();

DROP TRIGGER IF EXISTS trg_project_review_slots_log ON public.project_review_slots;
CREATE TRIGGER trg_project_review_slots_log AFTER INSERT OR UPDATE ON public.project_review_slots
    FOR EACH ROW EXECUTE FUNCTION public.project_log_event();

-- ── 8. Existing running projects get their schedule ────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT "ProjectID" FROM public.projects
              WHERE stage IN ('SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING') AND start_date IS NOT NULL AND end_date IS NOT NULL LOOP
        PERFORM public.project_generate_slots(r."ProjectID");
    END LOOP;
END $$;

-- ── 9. Grants and assertions ───────────────────────────────────────────
REVOKE ALL ON FUNCTION public.project_slot_schedule(uuid, uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_slot_record(uuid, date, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_slot_add_minutes(uuid, uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_call_review(text, date, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_due_project_slots()                            FROM PUBLIC, anon;

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.project_review_slots', 'INSERT') THEN
        RAISE EXCEPTION 'project_review_slots is writable by clients';
    END IF;
    IF has_function_privilege('authenticated', 'public.project_generate_slots(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated can call project_generate_slots() directly';
    END IF;
END $$;
