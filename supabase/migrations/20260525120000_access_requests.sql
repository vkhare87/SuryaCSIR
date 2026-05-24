-- Access requests: self-service role requests for DefaultUser accounts.
CREATE TABLE IF NOT EXISTS public.access_requests (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email              text,
    requested_roles    text[] NOT NULL,
    requested_division text NULL,
    justification      text NOT NULL DEFAULT '',
    status             text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    review_note        text NULL,
    reviewed_by        uuid NULL REFERENCES auth.users(id),
    reviewed_at        timestamptz NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- At most one open request per user.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
    ON public.access_requests(user_id) WHERE status = 'PENDING';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_select_own" ON public.access_requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "access_requests_insert_own" ON public.access_requests
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "access_requests_select_admin" ON public.access_requests
    FOR SELECT TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));
CREATE POLICY "access_requests_update_admin" ON public.access_requests
    FOR UPDATE TO authenticated
    USING (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin'));

-- Approve: grant chosen roles, drop DefaultUser, set active_role, mark approved.
CREATE OR REPLACE FUNCTION public.approve_access_request(
    p_request_id uuid, p_roles text[], p_division text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user uuid;
    v_role text;
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    IF array_length(p_roles, 1) IS NULL THEN
        RAISE EXCEPTION 'no roles selected';
    END IF;
    SELECT user_id INTO v_user FROM public.access_requests
        WHERE id = p_request_id AND status = 'PENDING';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'request not found or not pending';
    END IF;

    FOREACH v_role IN ARRAY p_roles LOOP
        INSERT INTO public.user_roles (user_id, role, division_code, must_change_password)
        VALUES (v_user, v_role, p_division, false)
        ON CONFLICT (user_id, role) DO UPDATE SET division_code = EXCLUDED.division_code;
    END LOOP;

    DELETE FROM public.user_roles WHERE user_id = v_user AND role = 'DefaultUser';
    UPDATE public.user_profiles SET active_role = p_roles[1] WHERE user_id = v_user;

    UPDATE public.access_requests
        SET status = 'APPROVED', review_note = NULL, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_access_request(
    p_request_id uuid, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT (public.user_has_role('SystemAdmin') OR public.user_has_role('MasterAdmin')) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
    UPDATE public.access_requests
        SET status = 'REJECTED', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
        WHERE id = p_request_id AND status = 'PENDING';
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid, text) TO authenticated;
