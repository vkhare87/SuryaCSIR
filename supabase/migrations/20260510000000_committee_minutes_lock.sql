-- Migration: Add minutes lock RLS policy + admin unlock RPC
-- Overrides Phase 1 Decision D-03 per CONTEXT.md D-19:
--   Minutes auto-lock 7 days after meeting completion.
--   RLS prevents UPDATE/DELETE on meetings when locked.
--   SELECT remains open to all authenticated users.
--   Admin roles (Director, SystemAdmin, MasterAdmin) can bypass via unlock RPC.

-- 1. Drop the existing all-in-one meetings_write policy
DROP POLICY IF EXISTS "meetings_write" ON public.meetings;

-- 2. SELECT policy — all authenticated users can read meetings (no lock guard)
CREATE POLICY "meetings_select"
    ON public.meetings FOR SELECT TO authenticated
    USING (true);

-- 3. INSERT policy — admin roles only; lock condition applies to new rows
CREATE POLICY "meetings_insert"
    ON public.meetings FOR INSERT TO authenticated
    WITH CHECK (
        public.user_has_role('Director')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('MasterAdmin')
    );

-- 4. UPDATE policy — role check + lock guard prevents editing locked meetings
--    A meeting is "locked" when status = 'Completed' AND
--    meeting_date < CURRENT_DATE - INTERVAL '7 days'.
--    MasterAdmin can always override the lock.
CREATE POLICY "meetings_update"
    ON public.meetings FOR UPDATE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    )
    WITH CHECK (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 5. DELETE policy — role check + lock guard prevents deleting locked meetings
CREATE POLICY "meetings_delete"
    ON public.meetings FOR DELETE TO authenticated
    USING (
        (public.user_has_role('Director')
         OR public.user_has_role('SystemAdmin')
         OR public.user_has_role('MasterAdmin'))
        AND (
            status != 'Completed'
            OR meeting_date >= CURRENT_DATE - INTERVAL '7 days'
            OR public.user_has_role('MasterAdmin')
        )
    );

-- 6. SECURITY DEFINER function: resets meeting_date to "unlock" minutes
--    Moves meeting_date to today so the lock window resets.
CREATE OR REPLACE FUNCTION public.unlock_meeting_minutes(
    p_meeting_id uuid
) RETURNS void AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT public.user_has_role('MasterAdmin')
        OR public.user_has_role('SystemAdmin')
        OR public.user_has_role('Director')
    INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only administrators can unlock meeting minutes';
    END IF;

    UPDATE public.meetings
    SET meeting_date = CURRENT_DATE
    WHERE id = p_meeting_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Meeting not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
