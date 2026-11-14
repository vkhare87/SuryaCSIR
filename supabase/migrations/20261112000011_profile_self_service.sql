-- ============================================================
-- 20261112000011_profile_self_service
-- Enterprise P2 / EX7 — a scientist keeps their own research fields current.
--
-- update_own_profile() changes only Expertise, CoreArea, Ext, orcid and
-- VidwanID, only on the caller's own staff row (linked by user_id — never
-- by email), and writes what changed to staff_profile_changes. Any other
-- key is refused. Everything else on the staff row stays HR's.
-- The change log joins entity_timeline as entity_type 'staff'.
-- Tests: scripts/db/profile.db.test.ts.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_profile_changes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id   text NOT NULL REFERENCES public.staff("ID") ON DELETE CASCADE,
    user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    changes    jsonb NOT NULL,   -- {field: {"from": old, "to": new}}
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_profile_changes_staff_idx ON public.staff_profile_changes (staff_id, changed_at DESC);

-- Readable by whoever may read the staff row; written only by the RPC.
ALTER TABLE public.staff_profile_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_profile_changes_select" ON public.staff_profile_changes;
CREATE POLICY "staff_profile_changes_select" ON public.staff_profile_changes FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.staff s WHERE s."ID" = staff_profile_changes.staff_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_profile_changes FROM authenticated, anon;
REVOKE ALL ON public.staff_profile_changes FROM anon;
GRANT SELECT ON public.staff_profile_changes TO authenticated;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_row     public.staff%ROWTYPE;
    v_key     text;
    v_new     text;
    v_old     text;
    v_changes jsonb := '{}';
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    SELECT * INTO v_row FROM public.staff WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Your login is not linked to a staff record. Ask HR to link it.';
    END IF;
    IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
        RAISE EXCEPTION 'Send the fields to change';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
        IF v_key NOT IN ('Expertise', 'CoreArea', 'Ext', 'orcid', 'VidwanID') THEN
            RAISE EXCEPTION 'You cannot change %; ask HR', v_key;
        END IF;
        IF jsonb_typeof(p_fields -> v_key) NOT IN ('string', 'null') THEN
            RAISE EXCEPTION '% must be text', v_key;
        END IF;
        v_new := nullif(btrim(p_fields ->> v_key), '');
        IF length(v_new) > 1000 THEN RAISE EXCEPTION '% is too long', v_key; END IF;
        IF v_key = 'orcid' AND v_new IS NOT NULL AND v_new !~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$' THEN
            RAISE EXCEPTION 'An ORCID iD looks like 0000-0002-1825-0097';
        END IF;
        v_old := to_jsonb(v_row) ->> v_key;
        IF v_old IS DISTINCT FROM v_new THEN
            v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old, 'to', v_new));
        END IF;
    END LOOP;

    IF v_changes = '{}' THEN RETURN; END IF;

    UPDATE public.staff SET
        "Expertise" = CASE WHEN v_changes ? 'Expertise' THEN v_changes -> 'Expertise' ->> 'to' ELSE "Expertise" END,
        "CoreArea"  = CASE WHEN v_changes ? 'CoreArea'  THEN v_changes -> 'CoreArea'  ->> 'to' ELSE "CoreArea"  END,
        "Ext"       = CASE WHEN v_changes ? 'Ext'       THEN v_changes -> 'Ext'       ->> 'to' ELSE "Ext"       END,
        orcid       = CASE WHEN v_changes ? 'orcid'     THEN v_changes -> 'orcid'     ->> 'to' ELSE orcid       END,
        "VidwanID"  = CASE WHEN v_changes ? 'VidwanID'  THEN v_changes -> 'VidwanID'  ->> 'to' ELSE "VidwanID"  END
     WHERE "ID" = v_row."ID";

    INSERT INTO public.staff_profile_changes (staff_id, user_id, changes) VALUES (v_row."ID", v_uid, v_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated, service_role;

-- Body is 20261112000007 plus the profile-change branch.
CREATE OR REPLACE VIEW public.entity_timeline WITH (security_invoker = true) AS
SELECT 'project'::text AS entity_type, e.project_id AS entity_id, e.at, e.actor AS actor_user_id,
       e.kind, e.summary, 'project_events'::text AS source
  FROM public.project_events e
UNION ALL
SELECT lower(a.entity_type), a.entity_id::text, a.created_at, a.user_id,
       a.action, a.action, 'pms_audit_logs'
  FROM public.pms_audit_logs a
UNION ALL
SELECT 'contribution_request', c.request_id::text, c.created_at, c.actor_id,
       c.action, coalesce(c.note, coalesce(c.from_status || ' → ', '') || c.to_status), 'contribution_request_events'
  FROM public.contribution_request_events c
UNION ALL
SELECT l.entity_type, l.entity_id::text, l.created_at,
       CASE WHEN l.actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.actor_id::uuid END,
       l.action, l.entity_type || ' ' || l.action, 'audit_log'
  FROM public.audit_log l
UNION ALL
SELECT 'staff', p.staff_id, p.changed_at, p.user_id,
       'profile', 'Profile updated: ' || (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(p.changes) k),
       'staff_profile_changes'
  FROM public.staff_profile_changes p;

COMMIT;
