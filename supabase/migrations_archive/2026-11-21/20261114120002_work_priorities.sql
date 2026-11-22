-- 20261114120002_work_priorities
-- Lane 1, SH3 (SCIENTIST-HOME-PLAN.md §4): a senior pins up to three
-- priorities on a person. The person sees them first on the home page, says
-- "seen", asks for a new date, or marks them done. The senior sees each step.
--
-- Rules, all enforced here:
--   1. Who may pin: the Director; the head of the person's division (or the
--      acting head); the person's reporting officer; the PI of a project the
--      person works on; a PhD student's supervisor. Nobody pins for themselves.
--   2. At most three OPEN priorities per person.
--   3. A reason of at least 10 characters.
--   4. Two askers wanting the same day: both are told. The app does not order them.
--   5. A new date replaces the old one only when the asker accepts it.

CREATE TABLE IF NOT EXISTS public.work_priorities (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asked_by         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title            text NOT NULL CHECK (btrim(title) <> ''),
    reason           text NOT NULL CHECK (length(btrim(reason)) >= 10),
    wanted_by        date NOT NULL,
    link             text CHECK (link IS NULL OR (link ~ '^/([^/\\]|$)' AND link !~ '[[:cntrl:]]')),
    subject_type     text,
    subject_id       text,
    status           text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'WITHDRAWN')),
    seen_at          timestamptz,
    pushback_reason  text,
    pushback_date    date,
    pushback_at      timestamptz,
    pushback_answer  text CHECK (pushback_answer IS NULL OR pushback_answer IN ('ACCEPTED', 'KEPT')),
    done_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (assignee_user_id <> asked_by)
);
CREATE INDEX IF NOT EXISTS work_priorities_assignee_idx ON public.work_priorities (assignee_user_id, status);
CREATE INDEX IF NOT EXISTS work_priorities_asker_idx    ON public.work_priorities (asked_by, status);

ALTER TABLE public.work_priorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_priorities_select" ON public.work_priorities;
CREATE POLICY "work_priorities_select" ON public.work_priorities FOR SELECT TO authenticated
    USING (assignee_user_id = (SELECT auth.uid()) OR asked_by = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.work_priorities FROM authenticated, anon;
REVOKE ALL ON public.work_priorities FROM anon;
GRANT SELECT ON public.work_priorities TO authenticated;

-- ── Who may pin (rule 1) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.priority_may_pin(p_assignee uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me     uuid := (SELECT auth.uid());
    v_my_sid text;
    v_s      public.staff%ROWTYPE;
BEGIN
    IF v_me IS NULL OR p_assignee IS NULL OR p_assignee = v_me THEN RETURN false; END IF;
    IF public.caller_has_role('Director') THEN RETURN true; END IF;

    SELECT "ID" INTO v_my_sid FROM public.staff WHERE user_id = v_me LIMIT 1;
    SELECT * INTO v_s FROM public.staff WHERE user_id = p_assignee LIMIT 1;

    IF v_s."ID" IS NOT NULL THEN
        -- Head of the person's division, held or acting.
        IF v_s."Division" IS NOT NULL AND (
               EXISTS (SELECT 1 FROM public.user_roles r
                        WHERE r.user_id = v_me AND r.role IN ('HOD', 'DivisionHead') AND r.division_code = v_s."Division")
            OR public.caller_acting_as('HOD', v_s."Division")
            OR public.caller_acting_as('DivisionHead', v_s."Division")) THEN
            RETURN true;
        END IF;
        -- Reporting officer.
        IF v_my_sid IS NOT NULL AND v_s."ReportingID" = v_my_sid THEN RETURN true; END IF;
        -- PI of a project the person works on.
        IF v_my_sid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.project_staff ps JOIN public.projects p ON p."ProjectNo" = ps."ProjectNo"
             WHERE ps.staff_id = v_s."ID" AND p.pi_staff_id = v_my_sid) THEN
            RETURN true;
        END IF;
        -- Supervisor of a PhD student (students are named, as phd_students' policy does).
        IF v_my_sid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.phd_students s
             WHERE s."StudentName" = v_s."Name"
               AND (s.supervisor_staff_id = v_my_sid OR s.cosupervisor_staff_id = v_my_sid)) THEN
            RETURN true;
        END IF;
    END IF;

    -- PI of a project on which the person holds an engagement (project staff).
    IF v_my_sid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.project_staff_persons sp
          JOIN public.project_engagements e ON e.person_id = sp.id
          JOIN public.projects p ON p."ProjectID" = e.project_id
         WHERE sp.user_id = p_assignee AND p.pi_staff_id = v_my_sid
           AND public.ist_today() BETWEEN e.from_on AND e.to_on) THEN
        RETURN true;
    END IF;
    RETURN false;
END;
$$;

-- One message per step; a repeat of the same step is a no-op.
CREATE OR REPLACE FUNCTION public.priority_notify(p_user uuid, p_id uuid, p_step text, p_title text, p_body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO public.notifications (user_id, kind, severity, title, body, link, source, dedupe_key)
    VALUES (p_user, 'work_priority', 'warning', p_title, p_body, '/', 'rule', 'priority:' || p_id || ':' || p_step)
    ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.priority_pin(
    p_assignee uuid, p_title text, p_reason text, p_wanted_by date,
    p_link text DEFAULT NULL, p_subject_type text DEFAULT NULL, p_subject_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me   uuid := (SELECT auth.uid());
    v_id   uuid;
    v_name text;
    v_open integer;
    v_c    record;
BEGIN
    IF v_me IS NULL OR NOT coalesce(public.priority_may_pin(p_assignee), false) THEN
        RAISE EXCEPTION 'You may pin a priority only for someone you lead: your division, your team, your project or your student';
    END IF;
    IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Say what should be done first'; END IF;
    IF length(coalesce(btrim(p_reason), '')) < 10 THEN RAISE EXCEPTION 'Give a reason of at least 10 characters'; END IF;
    IF p_wanted_by IS NULL OR p_wanted_by < public.ist_today() THEN RAISE EXCEPTION 'Give a date, today or later'; END IF;

    -- Rule 2, counted under a lock on the person so two seniors cannot both take the third slot.
    PERFORM pg_advisory_xact_lock(hashtext('work_priorities:' || p_assignee));
    SELECT count(*) INTO v_open FROM public.work_priorities WHERE assignee_user_id = p_assignee AND status = 'OPEN';
    IF v_open >= 3 THEN
        SELECT coalesce((SELECT "Name" FROM public.staff WHERE user_id = p_assignee LIMIT 1), 'This person') INTO v_name;
        RAISE EXCEPTION '% already holds 3 priorities. Withdraw one first.', v_name;
    END IF;

    INSERT INTO public.work_priorities (assignee_user_id, asked_by, title, reason, wanted_by, link, subject_type, subject_id)
    VALUES (p_assignee, v_me, btrim(p_title), btrim(p_reason), p_wanted_by, nullif(btrim(p_link), ''), p_subject_type, p_subject_id)
    RETURNING id INTO v_id;

    PERFORM public.priority_notify(p_assignee, v_id, 'pinned', 'Do first: ' || btrim(p_title),
        btrim(p_reason) || ' · wanted by ' || to_char(p_wanted_by, 'DD Mon'));

    -- Rule 4: same day, different asker. Tell both askers.
    FOR v_c IN SELECT id, asked_by FROM public.work_priorities
                WHERE assignee_user_id = p_assignee AND status = 'OPEN' AND wanted_by = p_wanted_by
                  AND asked_by <> v_me AND id <> v_id LOOP
        PERFORM public.priority_notify(v_c.asked_by, v_c.id, 'clash:' || v_id,
            'Two priorities for the same day', 'Another senior asked the same person for the same day. Agree the order between you.');
        PERFORM public.priority_notify(v_me, v_id, 'clash:' || v_c.id,
            'Two priorities for the same day', 'Another senior asked the same person for the same day. Agree the order between you.');
    END LOOP;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_seen(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.work_priorities SET seen_at = coalesce(seen_at, now())
     WHERE id = p_id AND assignee_user_id = (SELECT auth.uid()) AND status = 'OPEN';
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority of yours'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_push_back(p_id uuid, p_reason text, p_new_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_p public.work_priorities%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.work_priorities
     WHERE id = p_id AND assignee_user_id = (SELECT auth.uid()) AND status = 'OPEN' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority of yours'; END IF;
    IF length(coalesce(btrim(p_reason), '')) < 10 THEN RAISE EXCEPTION 'Give a reason of at least 10 characters'; END IF;
    IF p_new_date IS NULL OR p_new_date <= v_p.wanted_by THEN RAISE EXCEPTION 'The new date must be after %', v_p.wanted_by; END IF;
    UPDATE public.work_priorities
       SET pushback_reason = btrim(p_reason), pushback_date = p_new_date, pushback_at = now(), pushback_answer = NULL,
           seen_at = coalesce(seen_at, now())
     WHERE id = p_id;
    PERFORM public.priority_notify(v_p.asked_by, p_id, 'pushback:' || p_new_date, 'New date asked: ' || v_p.title,
        btrim(p_reason) || ' · asks for ' || to_char(p_new_date, 'DD Mon'));
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_answer(p_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_p public.work_priorities%ROWTYPE;
BEGIN
    SELECT * INTO v_p FROM public.work_priorities
     WHERE id = p_id AND asked_by = (SELECT auth.uid()) AND status = 'OPEN' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority you asked'; END IF;
    IF v_p.pushback_at IS NULL OR v_p.pushback_answer IS NOT NULL THEN RAISE EXCEPTION 'No new date is waiting for your answer'; END IF;
    UPDATE public.work_priorities
       SET pushback_answer = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'KEPT' END,
           wanted_by = CASE WHEN p_accept THEN pushback_date ELSE wanted_by END
     WHERE id = p_id;
    PERFORM public.priority_notify(v_p.assignee_user_id, p_id, 'answer:' || v_p.pushback_date,
        CASE WHEN p_accept THEN 'New date accepted: ' ELSE 'Date kept: ' END || v_p.title,
        CASE WHEN p_accept THEN 'Wanted by ' || to_char(v_p.pushback_date, 'DD Mon') ELSE 'Still wanted by ' || to_char(v_p.wanted_by, 'DD Mon') END);
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_done(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_p public.work_priorities%ROWTYPE;
BEGIN
    UPDATE public.work_priorities SET status = 'DONE', done_at = now(), seen_at = coalesce(seen_at, now())
     WHERE id = p_id AND assignee_user_id = (SELECT auth.uid()) AND status = 'OPEN'
     RETURNING * INTO v_p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority of yours'; END IF;
    PERFORM public.priority_notify(v_p.asked_by, p_id, 'done', 'Done: ' || v_p.title, 'Marked done.');
END;
$$;

CREATE OR REPLACE FUNCTION public.priority_withdraw(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.work_priorities SET status = 'WITHDRAWN'
     WHERE id = p_id AND asked_by = (SELECT auth.uid()) AND status = 'OPEN';
    IF NOT FOUND THEN RAISE EXCEPTION 'Not an open priority you asked'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.priority_notify(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.priority_may_pin(uuid)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_pin(uuid, text, text, date, text, text, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_seen(uuid)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_push_back(uuid, text, date)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_answer(uuid, boolean)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_done(uuid)                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.priority_withdraw(uuid)                                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.priority_may_pin(uuid)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_pin(uuid, text, text, date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_seen(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_push_back(uuid, text, date)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_answer(uuid, boolean)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_done(uuid)                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_withdraw(uuid)                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.priority_notify(uuid, uuid, text, text, text)          TO service_role;
