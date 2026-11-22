-- 20261122000005_priority_answer_expected_date
-- The asker accepts the push-back date they saw, not a newer one.
--
-- PR #32 had this check (archive 20261114120007_home_review_fixes.sql).
-- Stage 3 rebuilt priority_answer(uuid, boolean) without it: if the assignee
-- pushed back a second time while the asker's screen still showed the first
-- date, "Accept" moved wanted_by to the date the asker never saw. The answer
-- now carries the date that was shown; a different date stops it unchanged.
-- The two-argument version is dropped, so an old client fails loudly.
-- Tests: scripts/db/stage3.db.test.ts.

DROP FUNCTION IF EXISTS public.priority_answer(uuid, boolean);

CREATE OR REPLACE FUNCTION public.priority_answer(
    p_id uuid,
    p_accept boolean,
    p_expected_date date
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
       AND pushback_at IS NOT NULL
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Priority with pending push-back not found for asker';
    END IF;

    IF v_row.pushback_date IS DISTINCT FROM p_expected_date THEN
        RAISE EXCEPTION 'The date asked for has changed to %. Reload and answer again.', v_row.pushback_date;
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

REVOKE ALL ON FUNCTION public.priority_answer(uuid, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.priority_answer(uuid, boolean, date) TO authenticated, service_role;
