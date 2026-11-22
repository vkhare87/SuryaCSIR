-- ============================================================
-- Stage 3 — Follow-up Engines, Priorities & Notices
-- Covers Roadmap items 3.1 (SH3 + HH7), 3.2 (HH2 + CD6),
-- 3.3 (SH4), 3.4 (CD4), 3.5 (CM2 + CM3)
-- ============================================================

-- ── 3.0 Helper: check if caller holds any of a set of roles ──
CREATE OR REPLACE FUNCTION public.has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM unnest(COALESCE(p_roles, ARRAY[]::text[])) r
         WHERE public.caller_has_role(r)
    );
$$;

-- ── 3.1 (SH3 + HH7) work_priorities & 6 RPCs ───────────────

CREATE TABLE IF NOT EXISTS public.work_priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    assignee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
    wanted_by date NOT NULL,
    link text NOT NULL DEFAULT '/' CHECK (link LIKE '/%'),
    subject_type text,
    subject_id text,
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'WITHDRAWN')),
    seen_at timestamptz,
    pushback_reason text,
    pushback_date date,
    pushback_at timestamptz,
    pushback_answer text CHECK (pushback_answer IS NULL OR pushback_answer IN ('ACCEPTED', 'KEPT')),
    done_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_priorities_assignee_idx
    ON public.work_priorities (assignee_user_id, status, wanted_by);
CREATE INDEX IF NOT EXISTS work_priorities_asker_idx
    ON public.work_priorities (asked_by, status, created_at DESC);

ALTER TABLE public.work_priorities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_priorities_select_parties ON public.work_priorities;
CREATE POLICY work_priorities_select_parties ON public.work_priorities
    FOR SELECT TO authenticated
    USING (
        assignee_user_id = (SELECT auth.uid())
        OR asked_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['MasterAdmin', 'SystemAdmin', 'Director'])
    );

CREATE OR REPLACE FUNCTION public.can_pin_priority(p_assignee uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_staff text;
    v_assignee_staff text;
    v_assignee_div text;
    v_assignee_rep text;
BEGIN
    IF v_caller IS NULL OR p_assignee IS NULL OR v_caller = p_assignee THEN
        RETURN false;
    END IF;

    IF public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin']) THEN
        RETURN true;
    END IF;

    v_caller_staff := public.caller_staff_id();

    SELECT s."ID", s."Division", s."ReportingID"
      INTO v_assignee_staff, v_assignee_div, v_assignee_rep
      FROM public.staff s
     WHERE s.user_id = p_assignee
     LIMIT 1;

    IF v_assignee_staff IS NOT NULL THEN
        IF v_assignee_div IS NOT NULL AND v_assignee_div = ANY(public.caller_division_codes()) THEN
            RETURN true;
        END IF;

        IF v_caller_staff IS NOT NULL AND v_assignee_rep = v_caller_staff THEN
            RETURN true;
        END IF;

        IF v_caller_staff IS NOT NULL AND EXISTS (
            SELECT 1
              FROM public.projects p
              JOIN public.proposal_copis pc ON pc.proposal_id = p.proposal_id
             WHERE p.pi_staff_id = v_caller_staff
               AND pc.staff_id = v_assignee_staff
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_pin(
    p_assignee uuid,
    p_title text,
    p_reason text,
    p_wanted_by date,
    p_link text DEFAULT '/',
    p_subject_type text DEFAULT NULL,
    p_subject_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_open_count integer;
    v_assignee_name text;
    v_id uuid;
    v_clash record;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.can_pin_priority(p_assignee) THEN
        RAISE EXCEPTION 'Not authorized to pin priority for this user';
    END IF;

    IF length(btrim(COALESCE(p_title, ''))) = 0 THEN
        RAISE EXCEPTION 'Priority title is required';
    END IF;

    IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN
        RAISE EXCEPTION 'A reason of at least 10 characters is required';
    END IF;

    IF p_wanted_by IS NULL THEN
        RAISE EXCEPTION 'Target date (wanted_by) is required';
    END IF;

    IF p_link IS NULL OR p_link NOT LIKE '/%' THEN
        RAISE EXCEPTION 'Priority link must be a relative app path starting with /';
    END IF;

    SELECT count(*)::integer
      INTO v_open_count
      FROM public.work_priorities wp
     WHERE wp.assignee_user_id = p_assignee
       AND wp.status = 'OPEN';

    IF v_open_count >= 3 THEN
        SELECT COALESCE(s."Name", u.email, 'User')
          INTO v_assignee_name
          FROM auth.users u
          LEFT JOIN public.staff s ON s.user_id = u.id
         WHERE u.id = p_assignee
         LIMIT 1;
        RAISE EXCEPTION '% already holds 3 priorities. Withdraw one first.', v_assignee_name;
    END IF;

    INSERT INTO public.work_priorities (
        assignee_user_id, asked_by, title, reason, wanted_by, link, subject_type, subject_id
    ) VALUES (
        p_assignee, v_caller, btrim(p_title), btrim(p_reason), p_wanted_by, p_link, p_subject_type, p_subject_id
    )
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        p_assignee,
        'PRIORITY_PINNED',
        'warning',
        'New priority: ' || btrim(p_title),
        btrim(p_reason),
        p_link,
        'priority:pinned:' || v_id::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;

    -- Clash rule: if another OPEN priority for the same assignee has the same wanted_by from a different asker, notify both askers
    FOR v_clash IN
        SELECT wp.id, wp.asked_by, wp.title
          FROM public.work_priorities wp
         WHERE wp.assignee_user_id = p_assignee
           AND wp.status = 'OPEN'
           AND wp.wanted_by = p_wanted_by
           AND wp.asked_by <> v_caller
           AND wp.id <> v_id
    LOOP
        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
        VALUES (
            v_caller,
            'PRIORITY_CLASH',
            'info',
            'Priority date clash on ' || p_wanted_by::text,
            'Another senior also pinned "' || v_clash.title || '" for the same person on ' || p_wanted_by::text || '.',
            p_link,
            'priority:clash:' || v_id::text || ':' || v_clash.id::text || ':' || v_caller::text
        )
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;

        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
        VALUES (
            v_clash.asked_by,
            'PRIORITY_CLASH',
            'info',
            'Priority date clash on ' || p_wanted_by::text,
            'Another senior also pinned "' || btrim(p_title) || '" for the same person on ' || p_wanted_by::text || '.',
            p_link,
            'priority:clash:' || v_clash.id::text || ':' || v_id::text || ':' || v_clash.asked_by::text
        )
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END LOOP;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_seen(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.work_priorities
       SET seen_at = COALESCE(seen_at, now())
     WHERE id = p_id
       AND assignee_user_id = v_caller
       AND status = 'OPEN';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open priority not found for caller';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_push_back(
    p_id uuid,
    p_reason text,
    p_new_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.work_priorities%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'Push-back reason is required';
    END IF;

    IF p_new_date IS NULL THEN
        RAISE EXCEPTION 'Proposed new date is required';
    END IF;

    UPDATE public.work_priorities
       SET pushback_reason = btrim(p_reason),
           pushback_date = p_new_date,
           pushback_at = now(),
           pushback_answer = NULL
     WHERE id = p_id
       AND assignee_user_id = v_caller
       AND status = 'OPEN'
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open priority not found for caller';
    END IF;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        v_row.asked_by,
        'PRIORITY_PUSHBACK',
        'warning',
        'Push-back on priority: ' || v_row.title,
        'Proposed ' || p_new_date::text || ': ' || btrim(p_reason),
        v_row.link,
        'priority:pushback:' || v_row.id::text || ':' || extract(epoch FROM now())::bigint::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_answer(
    p_id uuid,
    p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.work_priorities%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_row
      FROM public.work_priorities
     WHERE id = p_id
       AND asked_by = v_caller
       AND status = 'OPEN'
       AND pushback_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Priority with pending push-back not found for asker';
    END IF;

    UPDATE public.work_priorities
       SET pushback_answer = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'KEPT' END,
           wanted_by = CASE WHEN p_accept AND pushback_date IS NOT NULL THEN pushback_date ELSE wanted_by END
     WHERE id = p_id;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        v_row.assignee_user_id,
        'PRIORITY_ANSWER',
        'info',
        CASE WHEN p_accept THEN 'New date accepted: ' ELSE 'Original date kept: ' END || v_row.title,
        CASE WHEN p_accept THEN 'Target date moved to ' || v_row.pushback_date::text ELSE 'Target date remains ' || v_row.wanted_by::text END,
        v_row.link,
        'priority:answer:' || v_row.id::text || ':' || extract(epoch FROM now())::bigint::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_done(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.work_priorities%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.work_priorities
       SET status = 'DONE',
           done_at = now()
     WHERE id = p_id
       AND assignee_user_id = v_caller
       AND status = 'OPEN'
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open priority not found for caller';
    END IF;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        v_row.asked_by,
        'PRIORITY_DONE',
        'info',
        'Priority completed: ' || v_row.title,
        'Marked done by assignee.',
        v_row.link,
        'priority:done:' || v_row.id::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_withdraw(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.work_priorities
       SET status = 'WITHDRAWN'
     WHERE id = p_id
       AND asked_by = v_caller
       AND status = 'OPEN';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open priority not found for asker';
    END IF;
END;
$$;

-- ── 3.2 (HH2 + CD6) decision_questions, my_decisions(), my_answer_time() ──

CREATE TABLE IF NOT EXISTS public.decision_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    asked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asked_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question text NOT NULL CHECK (length(btrim(question)) > 0),
    answer text,
    asked_at timestamptz NOT NULL DEFAULT now(),
    answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS decision_questions_subject_idx
    ON public.decision_questions (subject_type, subject_id, asked_at DESC);

ALTER TABLE public.decision_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decision_questions_select_parties ON public.decision_questions;
CREATE POLICY decision_questions_select_parties ON public.decision_questions
    FOR SELECT TO authenticated
    USING (
        asked_by = (SELECT auth.uid())
        OR asked_to = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin'])
    );

CREATE OR REPLACE FUNCTION public.decision_ask(
    p_subject_type text,
    p_subject_id text,
    p_asked_to uuid,
    p_question text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF length(btrim(COALESCE(p_question, ''))) = 0 THEN
        RAISE EXCEPTION 'Question text is required';
    END IF;

    INSERT INTO public.decision_questions (subject_type, subject_id, asked_by, asked_to, question)
    VALUES (p_subject_type, p_subject_id, v_caller, p_asked_to, btrim(p_question))
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        p_asked_to,
        'DECISION_QUESTION',
        'warning',
        'Clarification requested',
        btrim(p_question),
        '/',
        'decision_question:' || v_id::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decision_answer(
    p_id uuid,
    p_answer text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_row public.decision_questions%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF length(btrim(COALESCE(p_answer, ''))) = 0 THEN
        RAISE EXCEPTION 'Answer text is required';
    END IF;

    UPDATE public.decision_questions
       SET answer = btrim(p_answer),
           answered_at = now()
     WHERE id = p_id
       AND asked_to = v_caller
       AND answered_at IS NULL
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open decision question not found for caller';
    END IF;

    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
    VALUES (
        v_row.asked_by,
        'DECISION_ANSWERED',
        'info',
        'Clarification answered',
        btrim(p_answer),
        '/',
        'decision_answer:' || v_row.id::text
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END;
$$;

CREATE TABLE IF NOT EXISTS public.decision_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    waiting_since timestamptz,
    decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_audit_log_user_idx
    ON public.decision_audit_log (decided_by, decided_at DESC);

ALTER TABLE public.decision_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decision_audit_log_select_self ON public.decision_audit_log;
CREATE POLICY decision_audit_log_select_self ON public.decision_audit_log
    FOR SELECT TO authenticated
    USING (decided_by = (SELECT auth.uid()) OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin']));

CREATE OR REPLACE FUNCTION public.my_decisions()
RETURNS TABLE(
    kind text,
    subject_type text,
    subject_id text,
    title text,
    requester_user_id uuid,
    waiting_since timestamptz,
    quick boolean,
    link text,
    days_waiting integer,
    open_question boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH div_codes AS (
        SELECT unnest(public.caller_division_codes()) AS code
    ),
    raw_items AS (
        -- 1. Proposal review steps
        SELECT
            prs.kind,
            'proposal'::text AS subject_type,
            prs.proposal_id::text AS subject_id,
            COALESCE(pr.title, 'Proposal review') AS title,
            pr.created_by AS requester_user_id,
            prs.created_at AS waiting_since,
            false AS quick,
            '/proposals/' || prs.proposal_id::text AS link
          FROM public.proposal_review_steps prs
          JOIN public.proposals pr ON pr.id = prs.proposal_id
         WHERE prs.status = 'PENDING'
           AND (
               (prs.kind IN ('DIRECTOR_APPROVAL', 'DIRECTOR_FORWARD') AND public.has_any_role(ARRAY['Director', 'MasterAdmin']))
               OR (prs.kind = 'PME_VETTING' AND public.has_any_role(ARRAY['PME', 'MasterAdmin']))
               OR (prs.kind = 'FINANCE' AND public.has_any_role(ARRAY['Finance', 'Admin', 'MasterAdmin']))
           )

        UNION ALL

        -- 2. Project progress reports awaiting division / PME review
        SELECT
            'PROGRESS_REPORT'::text AS kind,
            'project_report'::text AS subject_type,
            rep.id::text AS subject_id,
            'Progress report: ' || rep.project_no || ' (' || rep.period_label || ')' AS title,
            rep.submitted_by AS requester_user_id,
            COALESCE(rep.submitted_at, rep.created_at) AS waiting_since,
            false AS quick,
            '/reports/' || rep.id::text || '/edit' AS link
          FROM public.project_reports rep
         WHERE rep.status IN ('SUBMITTED', 'UNDER_REVIEW')
           AND (
               public.has_any_role(ARRAY['PME', 'Director', 'MasterAdmin'])
               OR (rep.division_code IS NOT NULL AND EXISTS (SELECT 1 FROM div_codes d WHERE d.code = rep.division_code))
           )

        UNION ALL

        -- 3. Project change steps
        SELECT
            pcs.kind,
            'project_change'::text AS subject_type,
            pcs.change_id::text AS subject_id,
            'Project change (' || pcr.kind || ')' AS title,
            pcr.created_by AS requester_user_id,
            pcs.created_at AS waiting_since,
            false AS quick,
            '/projects/' || pcr.project_id AS link
          FROM public.project_change_steps pcs
          JOIN public.project_change_requests pcr ON pcr.id = pcs.change_id
         WHERE pcs.status = 'PENDING'
           AND (
               (pcs.kind IN ('DIRECTOR_APPROVAL', 'DIRECTOR_FORWARD') AND public.has_any_role(ARRAY['Director', 'MasterAdmin']))
               OR (pcs.kind = 'PME_VETTING' AND public.has_any_role(ARRAY['PME', 'MasterAdmin']))
               OR (pcs.kind = 'FINANCE' AND public.has_any_role(ARRAY['Finance', 'Admin', 'MasterAdmin']))
           )

        UNION ALL

        -- 4. Project completion steps
        SELECT
            pcomp.kind,
            'project_completion'::text AS subject_type,
            pcomp.report_id::text AS subject_id,
            'Project completion report' AS title,
            pcr.created_by AS requester_user_id,
            pcomp.created_at AS waiting_since,
            false AS quick,
            '/projects/' || pcr.project_id AS link
          FROM public.project_completion_steps pcomp
          JOIN public.project_completion_reports pcr ON pcr.id = pcomp.report_id
         WHERE pcomp.status = 'PENDING'
           AND (
               (pcomp.kind = 'DIRECTOR_APPROVAL' AND public.has_any_role(ARRAY['Director', 'MasterAdmin']))
               OR (pcomp.kind = 'PME_VETTING' AND public.has_any_role(ARRAY['PME', 'MasterAdmin']))
               OR (pcomp.kind = 'FINANCE' AND public.has_any_role(ARRAY['Finance', 'Admin', 'MasterAdmin']))
           )

        UNION ALL

        -- 5. Room bookings waiting on desk / authority
        SELECT
            'ROOM_BOOKING'::text AS kind,
            'room_booking'::text AS subject_type,
            rb.id::text AS subject_id,
            'Room booking: ' || COALESCE(r.name, 'Room') || ' — ' || rb.purpose AS title,
            rb.booked_by AS requester_user_id,
            rb.created_at AS waiting_since,
            true AS quick,
            '/rooms'::text AS link
          FROM public.room_bookings rb
          JOIN public.rooms r ON r.id = rb.room_id
         WHERE rb.status = 'PENDING'
           AND (
               public.caller_is_committee_authority()
               OR public.has_any_role(ARRAY['Admin', 'MasterAdmin', 'SystemAdmin'])
           )

        UNION ALL

        -- 6. Hospitality requests waiting on desk / authority
        SELECT
            'HOSPITALITY'::text AS kind,
            'hospitality_request'::text AS subject_type,
            hr.id::text AS subject_id,
            'Refreshments (' || hr.headcount::text || '): ' || hr.items AS title,
            hr.requested_by AS requester_user_id,
            hr.created_at AS waiting_since,
            true AS quick,
            '/rooms'::text AS link
          FROM public.hospitality_requests hr
         WHERE hr.status = 'PENDING'
           AND (
               public.caller_is_committee_authority()
               OR public.has_any_role(ARRAY['Admin', 'MasterAdmin', 'SystemAdmin'])
           )
    )
    SELECT
        ri.kind,
        ri.subject_type,
        ri.subject_id,
        ri.title,
        ri.requester_user_id,
        ri.waiting_since,
        ri.quick,
        ri.link,
        GREATEST(0, (public.ist_today() - ri.waiting_since::date))::integer AS days_waiting,
        EXISTS (
            SELECT 1
              FROM public.decision_questions dq
             WHERE dq.subject_type = ri.subject_type
               AND dq.subject_id = ri.subject_id
               AND dq.answered_at IS NULL
        ) AS open_question
      FROM raw_items ri
     ORDER BY ri.waiting_since ASC;
$$;

CREATE OR REPLACE FUNCTION public.my_answer_time()
RETURNS TABLE(median_days numeric, decision_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT
        COALESCE(
            ROUND(
                percentile_cont(0.5) WITHIN GROUP (
                    ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (dal.decided_at - COALESCE(dal.waiting_since, dal.decided_at))) / 86400.0)
                )::numeric,
                1
            ),
            0::numeric
        ) AS median_days,
        count(*)::integer AS decision_count
      FROM public.decision_audit_log dal
     WHERE dal.decided_by = auth.uid()
       AND dal.decided_at >= now() - interval '30 days';
$$;

-- ── 3.3 (SH4) home_snoozes, escalation sweep & on-time record ──

CREATE TABLE IF NOT EXISTS public.home_snoozes (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_key text NOT NULL,
    until date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_key)
);

ALTER TABLE public.home_snoozes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_snoozes_self ON public.home_snoozes;
CREATE POLICY home_snoozes_self ON public.home_snoozes
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.home_snooze_tomorrow(
    p_item_key text,
    p_due_date date DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_today date := public.ist_today();
    v_until date := v_today + 1;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_item_key IS NULL OR length(btrim(p_item_key)) = 0 THEN
        RAISE EXCEPTION 'Item key is required';
    END IF;
    IF p_item_key LIKE 'priority:%' THEN
        RAISE EXCEPTION 'Priorities cannot be postponed until tomorrow.';
    END IF;
    IF p_due_date IS NOT NULL AND p_due_date <= v_today THEN
        RAISE EXCEPTION 'Cannot postpone an item on or after its due date.';
    END IF;

    INSERT INTO public.home_snoozes (user_id, item_key, until)
    VALUES (v_caller, p_item_key, v_until)
    ON CONFLICT (user_id, item_key) DO UPDATE SET until = EXCLUDED.until;

    RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_nudge_sweep(p_today date DEFAULT public.ist_today())
RETURNS TABLE(
    nudged_user_id uuid,
    stage text,
    subject text,
    escalated_to_hod boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row record;
    v_days_left integer;
    v_stage text;
    v_hod_user uuid;
    v_escalated boolean;
BEGIN
    IF NOT (
        public.caller_has_role('SystemAdmin')
        OR public.caller_has_role('MasterAdmin')
        OR public.caller_has_role('PME')
        OR public.caller_has_role('Director')
    ) THEN
        RAISE EXCEPTION 'Only administrators or PME may run nudge sweep';
    END IF;

    FOR v_row IN
        SELECT
            prs.id AS slot_id,
            prs.project_id,
            p."ProjectNo" || ' — ' || p."ProjectName" AS subj,
            p."DivisionCode" AS div_code,
            prs.due_date,
            s.user_id AS pi_user_id
          FROM public.project_review_slots prs
          JOIN public.projects p ON p."ProjectID" = prs.project_id
          LEFT JOIN public.staff s ON s."ID" = p.pi_staff_id
         WHERE prs.kind = 'PROGRESS_REPORT'
           AND prs.status IN ('DUE', 'PENDING', 'OVERDUE')
           AND s.user_id IS NOT NULL
    LOOP
        v_days_left := v_row.due_date - p_today;
        v_stage := NULL;
        v_escalated := false;

        IF v_days_left = 30 THEN
            v_stage := 'DRAFT_OFFERED';
        ELSIF v_days_left = 7 THEN
            v_stage := 'REMINDER_7D';
        ELSIF v_days_left = 2 THEN
            v_stage := 'REMINDER_2D';
        ELSIF v_days_left = 0 THEN
            v_stage := 'DUE_TODAY';
        ELSIF v_days_left <= -7 THEN
            v_stage := 'ESCALATED_HOD';
            v_escalated := true;
        END IF;

        IF v_stage IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
            VALUES (
                v_row.pi_user_id,
                'REPORT_NUDGE_' || v_stage,
                CASE WHEN v_escalated OR v_stage = 'DUE_TODAY' THEN 'critical' ELSE 'warning' END,
                CASE v_stage
                    WHEN 'DRAFT_OFFERED' THEN 'Report draft ready (30d): ' || v_row.subj
                    WHEN 'REMINDER_7D' THEN 'Report due in 7 days: ' || v_row.subj
                    WHEN 'REMINDER_2D' THEN 'Report due in 2 days: ' || v_row.subj
                    WHEN 'DUE_TODAY' THEN 'Report due today: ' || v_row.subj
                    ELSE 'Report 7+ days overdue (HoD told): ' || v_row.subj
                END,
                'Due date: ' || v_row.due_date::text,
                '/reports/new?project=' || v_row.project_id,
                'nudge:' || v_row.slot_id::text || ':' || v_stage
            )
            ON CONFLICT (user_id, dedupe_key) DO NOTHING;

            IF v_escalated AND v_row.div_code IS NOT NULL THEN
                SELECT s_h.user_id
                  INTO v_hod_user
                  FROM public.divisions d
                  JOIN public.staff s_h ON s_h."ID" = d."divHoDID"
                 WHERE d."divCode" = v_row.div_code
                 LIMIT 1;

                IF v_hod_user IS NOT NULL AND v_hod_user <> v_row.pi_user_id THEN
                    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
                    VALUES (
                        v_hod_user,
                        'REPORT_OVERDUE_HOD',
                        'warning',
                        'Overdue progress report (7d+): ' || v_row.subj,
                        'Due date was ' || v_row.due_date::text || '.',
                        '/projects/' || v_row.project_id,
                        'nudge_hod:' || v_row.slot_id::text
                    )
                    ON CONFLICT (user_id, dedupe_key) DO NOTHING;
                END IF;
            END IF;

            nudged_user_id := v_row.pi_user_id;
            stage := v_stage;
            subject := v_row.subj;
            escalated_to_hod := v_escalated;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_on_time_record()
RETURNS TABLE(on_time_count integer, total_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT
        count(*) FILTER (
            WHERE rep.submitted_at IS NOT NULL
              AND (rep.due_date IS NULL OR rep.submitted_at::date <= rep.due_date)
        )::integer AS on_time_count,
        count(*)::integer AS total_count
      FROM public.project_reports rep
     WHERE rep.submitted_by = auth.uid()
       AND EXTRACT(YEAR FROM rep.created_at) = EXTRACT(YEAR FROM public.ist_today());
$$;

-- ── 3.4 (CD4) notices & notice_reads ───────────────────────

CREATE TABLE IF NOT EXISTS public.notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    notice_no text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('OFFICE_ORDER', 'CIRCULAR', 'NOTICE', 'EVENT')),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    body text NOT NULL DEFAULT '',
    issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    issued_on date NOT NULL DEFAULT public.ist_today(),
    audience jsonb NOT NULL DEFAULT '{"scope":"ALL"}'::jsonb,
    must_ack boolean NOT NULL DEFAULT false,
    ack_by date,
    valid_to date,
    document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    supersedes uuid REFERENCES public.notices(id) ON DELETE SET NULL,
    superseded_by uuid REFERENCES public.notices(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notices_issued_idx ON public.notices (issued_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notice_reads (
    notice_id uuid NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at timestamptz NOT NULL DEFAULT now(),
    acked_at timestamptz,
    PRIMARY KEY (notice_id, user_id)
);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notice_matches_caller(p_audience jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_scope text := COALESCE(p_audience->>'scope', 'ALL');
    v_staff_div text;
    v_div_codes text[];
BEGIN
    IF v_caller IS NULL THEN
        RETURN false;
    END IF;

    IF v_scope = 'PUBLIC' THEN
        RETURN true;
    END IF;

    IF public.has_any_role(ARRAY['Guest', 'DefaultUser']) AND NOT public.has_any_role(ARRAY['Scientist', 'HoD', 'DivisionHead', 'Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'PME', 'Student', 'ProjectStaff', 'Technician', 'Finance']) THEN
        RETURN false;
    END IF;

    IF v_scope = 'ALL' THEN
        RETURN true;
    END IF;

    IF v_scope = 'DIVISIONS' THEN
        SELECT s."Division"
          INTO v_staff_div
          FROM public.staff s
         WHERE s.user_id = v_caller
         LIMIT 1;

        v_div_codes := public.caller_division_codes();

        RETURN EXISTS (
            SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p_audience->'divisions', '[]'::jsonb)) elem
             WHERE elem = v_staff_div
                OR elem = ANY(v_div_codes)
        );
    END IF;

    IF v_scope = 'ROLES' THEN
        RETURN EXISTS (
            SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p_audience->'roles', '[]'::jsonb)) elem
             WHERE public.caller_has_role(elem)
        );
    END IF;

    IF v_scope = 'USERS' THEN
        RETURN EXISTS (
            SELECT 1
              FROM jsonb_array_elements_text(COALESCE(p_audience->'user_ids', '[]'::jsonb)) elem
             WHERE elem = v_caller::text
        );
    END IF;

    RETURN false;
END;
$$;

DROP POLICY IF EXISTS notices_select_audience ON public.notices;
CREATE POLICY notices_select_audience ON public.notices
    FOR SELECT TO authenticated
    USING (
        issued_by = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin'])
        OR public.notice_matches_caller(audience)
    );

DROP POLICY IF EXISTS notice_reads_select_parties ON public.notice_reads;
CREATE POLICY notice_reads_select_parties ON public.notice_reads
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin'])
        OR EXISTS (
            SELECT 1 FROM public.notices n
             WHERE n.id = notice_reads.notice_id AND n.issued_by = (SELECT auth.uid())
        )
    );

CREATE OR REPLACE FUNCTION public.notice_issue(
    p_notice_no text,
    p_kind text,
    p_title text,
    p_body text,
    p_audience jsonb DEFAULT '{"scope":"ALL"}'::jsonb,
    p_must_ack boolean DEFAULT false,
    p_ack_by date DEFAULT NULL,
    p_valid_to date DEFAULT NULL,
    p_supersedes uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_scope text := COALESCE(p_audience->>'scope', 'ALL');
    v_id uuid;
    v_is_hod boolean;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_is_hod := public.has_any_role(ARRAY['HOD', 'HoD', 'DivisionHead']);

    IF NOT public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin', 'Admin', 'PME']) THEN
        IF v_is_hod AND v_scope = 'DIVISIONS' THEN
            IF EXISTS (
                SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(p_audience->'divisions', '[]'::jsonb)) elem
                 WHERE NOT (elem = ANY(public.caller_division_codes()))
            ) THEN
                RAISE EXCEPTION 'HoD may only issue notices to their own division';
            END IF;
        ELSE
            RAISE EXCEPTION 'Not authorized to issue this notice';
        END IF;
    END IF;

    INSERT INTO public.notices (
        notice_no, kind, title, body, issued_by, audience, must_ack, ack_by, valid_to, supersedes
    ) VALUES (
        btrim(p_notice_no), p_kind, btrim(p_title), COALESCE(p_body, ''), v_caller,
        COALESCE(p_audience, '{"scope":"ALL"}'::jsonb), COALESCE(p_must_ack, false), p_ack_by, p_valid_to, p_supersedes
    )
    RETURNING id INTO v_id;

    IF p_supersedes IS NOT NULL THEN
        UPDATE public.notices
           SET superseded_by = v_id
         WHERE id = p_supersedes;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notice_mark_read(
    p_notice_id uuid,
    p_ack boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.notices n
         WHERE n.id = p_notice_id
           AND (
               n.issued_by = v_caller
               OR public.has_any_role(ARRAY['Director', 'MasterAdmin', 'SystemAdmin'])
               OR public.notice_matches_caller(n.audience)
           )
    ) THEN
        RAISE EXCEPTION 'Notice not found or not readable';
    END IF;

    INSERT INTO public.notice_reads (notice_id, user_id, read_at, acked_at)
    VALUES (p_notice_id, v_caller, now(), CASE WHEN p_ack THEN now() ELSE NULL END)
    ON CONFLICT (notice_id, user_id) DO UPDATE
       SET acked_at = COALESCE(public.notice_reads.acked_at, EXCLUDED.acked_at);
END;
$$;

-- ── 3.5 (CM2 + CM3) Agenda circulation & live attendance/quorum ──

CREATE TABLE IF NOT EXISTS public.agenda_circulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1,
    circulated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    circulated_at timestamptz NOT NULL DEFAULT now(),
    notes text NOT NULL DEFAULT '',
    UNIQUE (meeting_id, version)
);

CREATE TABLE IF NOT EXISTS public.agenda_receipts (
    circulation_id uuid NOT NULL REFERENCES public.agenda_circulations(id) ON DELETE CASCADE,
    member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    opened_at timestamptz,
    replied_at timestamptz,
    reply_note text,
    PRIMARY KEY (circulation_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS public.meeting_attendance (
    meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    staff_id text,
    external_member_id uuid REFERENCES public.external_members(id) ON DELETE CASCADE,
    person_key text NOT NULL,
    seat text NOT NULL DEFAULT 'MEMBER',
    status text NOT NULL DEFAULT 'ABSENT' CHECK (status IN ('PRESENT', 'ONLINE', 'ABSENT', 'LEAVE_GRANTED')),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (meeting_id, person_key)
);

ALTER TABLE public.agenda_circulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_circulations_read ON public.agenda_circulations;
CREATE POLICY agenda_circulations_read ON public.agenda_circulations
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = agenda_circulations.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

DROP POLICY IF EXISTS agenda_receipts_read ON public.agenda_receipts;
CREATE POLICY agenda_receipts_read ON public.agenda_receipts
    FOR SELECT TO authenticated
    USING (
        member_user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1
              FROM public.agenda_circulations ac
              JOIN public.meetings m ON m.id = ac.meeting_id
             WHERE ac.id = agenda_receipts.circulation_id
               AND public.committee_can_run(m.committee_id)
        )
    );

DROP POLICY IF EXISTS meeting_attendance_read ON public.meeting_attendance;
CREATE POLICY meeting_attendance_read ON public.meeting_attendance
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.meetings m
         WHERE m.id = meeting_attendance.meeting_id
           AND public.committee_can_read(m.committee_id)
    ));

CREATE OR REPLACE FUNCTION public.agenda_circulate(
    p_meeting_id uuid,
    p_notes text DEFAULT ''
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_term_id uuid;
    v_title text;
    v_version integer;
    v_circ_id uuid;
    v_member record;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT m.committee_id, m.term_id, m.title
      INTO v_committee_id, v_term_id, v_title
      FROM public.meetings m
     WHERE m.id = p_meeting_id;

    IF v_committee_id IS NULL THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to circulate agenda for this committee';
    END IF;

    SELECT COALESCE(max(version), 0) + 1
      INTO v_version
      FROM public.agenda_circulations
     WHERE meeting_id = p_meeting_id;

    INSERT INTO public.agenda_circulations (meeting_id, version, circulated_by, notes)
    VALUES (p_meeting_id, v_version, v_caller, COALESCE(p_notes, ''))
    RETURNING id INTO v_circ_id;

    UPDATE public.meetings
       SET stage = CASE WHEN stage = 'PLANNED' OR stage = 'NOTICE_ISSUED' THEN 'AGENDA_CIRCULATED' ELSE stage END
     WHERE id = p_meeting_id;

    FOR v_member IN
        SELECT DISTINCT COALESCE(s.user_id, em.user_id) AS user_id
          FROM public.committee_memberships cm
          LEFT JOIN public.staff s ON s."ID" = cm.staff_id
          LEFT JOIN public.external_members em ON em.id = cm.external_member_id
         WHERE cm.committee_id = v_committee_id
           AND (v_term_id IS NULL OR cm.term_id = v_term_id)
           AND cm.to_on IS NULL
           AND COALESCE(s.user_id, em.user_id) IS NOT NULL
    LOOP
        INSERT INTO public.agenda_receipts (circulation_id, member_user_id)
        VALUES (v_circ_id, v_member.user_id)
        ON CONFLICT (circulation_id, member_user_id) DO NOTHING;

        INSERT INTO public.notifications (user_id, kind, severity, title, body, link, dedupe_key)
        VALUES (
            v_member.user_id,
            'AGENDA_CIRCULATED',
            'info',
            'Agenda v' || v_version::text || ' circulated: ' || v_title,
            COALESCE(NULLIF(btrim(p_notes), ''), 'Please review the meeting agenda.'),
            '/committees/meetings/' || p_meeting_id::text,
            'agenda:circ:' || v_circ_id::text || ':' || v_member.user_id::text
        )
        ON CONFLICT (user_id, dedupe_key) DO NOTHING;
    END LOOP;

    RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_receipt_ack(
    p_circulation_id uuid,
    p_reply_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.agenda_receipts
       SET opened_at = COALESCE(opened_at, now()),
           replied_at = CASE WHEN p_reply_note IS NOT NULL AND length(btrim(p_reply_note)) > 0 THEN now() ELSE replied_at END,
           reply_note = COALESCE(NULLIF(btrim(p_reply_note), ''), reply_note)
     WHERE circulation_id = p_circulation_id
       AND member_user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agenda receipt not found for caller';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_attendance_set(
    p_meeting_id uuid,
    p_person_key text,
    p_status text,
    p_staff_id text DEFAULT NULL,
    p_external_member_id uuid DEFAULT NULL,
    p_seat text DEFAULT 'MEMBER'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT committee_id INTO v_committee_id FROM public.meetings WHERE id = p_meeting_id;
    IF v_committee_id IS NULL THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to record attendance for this committee';
    END IF;

    INSERT INTO public.meeting_attendance (meeting_id, person_key, staff_id, external_member_id, seat, status, recorded_by)
    VALUES (p_meeting_id, p_person_key, p_staff_id, p_external_member_id, COALESCE(p_seat, 'MEMBER'), p_status, v_caller)
    ON CONFLICT (meeting_id, person_key) DO UPDATE
       SET status = EXCLUDED.status,
           seat = EXCLUDED.seat,
           recorded_at = now(),
           recorded_by = v_caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_quorum_status(p_meeting_id uuid)
RETURNS TABLE(
    present_count integer,
    required_min integer,
    chair_present boolean,
    chair_required boolean,
    quorum_met boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
    v_committee_id uuid;
    v_term_id uuid;
    v_min integer := 1;
    v_needs_chair boolean := false;
    v_present integer := 0;
    v_chair boolean := false;
BEGIN
    SELECT m.committee_id, m.term_id
      INTO v_committee_id, v_term_id
      FROM public.meetings m
     WHERE m.id = p_meeting_id;

    IF v_committee_id IS NULL THEN
        RETURN;
    END IF;

    IF v_term_id IS NOT NULL THEN
        SELECT ct.quorum_min, ct.quorum_needs_chair
          INTO v_min, v_needs_chair
          FROM public.committee_terms ct
         WHERE ct.id = v_term_id;
    ELSE
        SELECT ct.quorum_min, ct.quorum_needs_chair
          INTO v_min, v_needs_chair
          FROM public.committee_terms ct
         WHERE ct.committee_id = v_committee_id AND ct.status = 'ACTIVE'
         ORDER BY ct.term_no DESC
         LIMIT 1;
    END IF;

    v_min := COALESCE(v_min, 1);
    v_needs_chair := COALESCE(v_needs_chair, false);

    SELECT
        count(*) FILTER (WHERE ma.status IN ('PRESENT', 'ONLINE'))::integer,
        COALESCE(bool_or(ma.seat = 'CHAIRPERSON' AND ma.status IN ('PRESENT', 'ONLINE')), false)
      INTO v_present, v_chair
      FROM public.meeting_attendance ma
     WHERE ma.meeting_id = p_meeting_id;

    present_count := COALESCE(v_present, 0);
    required_min := v_min;
    chair_present := v_chair;
    chair_required := v_needs_chair;
    quorum_met := (present_count >= required_min) AND (NOT chair_required OR chair_present);
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_mark_held(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_committee_id uuid;
    v_q record;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT committee_id INTO v_committee_id FROM public.meetings WHERE id = p_meeting_id;
    IF v_committee_id IS NULL THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_committee_id) THEN
        RAISE EXCEPTION 'Not authorized to mark meeting held';
    END IF;

    SELECT * INTO v_q FROM public.meeting_quorum_status(p_meeting_id) LIMIT 1;
    IF NOT COALESCE(v_q.quorum_met, false) THEN
        RAISE EXCEPTION 'Quorum not met (present: %, required: %, chair_required: %, chair_present: %)',
            COALESCE(v_q.present_count, 0), COALESCE(v_q.required_min, 1),
            COALESCE(v_q.chair_required, false), COALESCE(v_q.chair_present, false);
    END IF;

    UPDATE public.meetings
       SET stage = 'HELD'
     WHERE id = p_meeting_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meeting_adjourn(
    p_meeting_id uuid,
    p_next_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_m public.meetings%ROWTYPE;
    v_new_id uuid;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_m FROM public.meetings WHERE id = p_meeting_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;

    IF NOT public.committee_can_run(v_m.committee_id) THEN
        RAISE EXCEPTION 'Not authorized to adjourn meeting';
    END IF;

    UPDATE public.meetings
       SET stage = 'ADJOURNED'
     WHERE id = p_meeting_id;

    INSERT INTO public.meetings (
        committee_id, meeting_date, venue, title, summary, status, stage, term_id, adjourned_from_id
    ) VALUES (
        v_m.committee_id, p_next_date, v_m.venue, v_m.title || ' (Adjourned)', v_m.summary,
        'Scheduled', 'PLANNED', v_m.term_id, p_meeting_id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.agenda_items (
        meeting_id, sequence, description, proposed_by, status, subject_type, subject_id, item_type, title, presenter_staff_id, minutes_allotted
    )
    SELECT
        v_new_id, sequence, description, proposed_by, 'Pending', subject_type, subject_id, item_type, title, presenter_staff_id, minutes_allotted
      FROM public.agenda_items
     WHERE meeting_id = p_meeting_id
       AND status IN ('Pending', 'Deferred');

    RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
    public.has_any_role(text[]),
    public.can_pin_priority(uuid),
    public.priority_pin(uuid, text, text, date, text, text, text),
    public.priority_seen(uuid),
    public.priority_push_back(uuid, text, date),
    public.priority_answer(uuid, boolean),
    public.priority_done(uuid),
    public.priority_withdraw(uuid),
    public.decision_ask(text, text, uuid, text),
    public.decision_answer(uuid, text),
    public.my_decisions(),
    public.my_answer_time(),
    public.home_snooze_tomorrow(text, date),
    public.report_nudge_sweep(date),
    public.my_on_time_record(),
    public.notice_matches_caller(jsonb),
    public.notice_issue(text, text, text, text, jsonb, boolean, date, date, uuid),
    public.notice_mark_read(uuid, boolean),
    public.agenda_circulate(uuid, text),
    public.agenda_receipt_ack(uuid, text),
    public.meeting_attendance_set(uuid, text, text, text, uuid, text),
    public.meeting_quorum_status(uuid),
    public.meeting_mark_held(uuid),
    public.meeting_adjourn(uuid, date)
TO authenticated;
