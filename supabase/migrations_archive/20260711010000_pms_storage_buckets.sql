-- PMS storage buckets: signatures + annexures.
-- These were only ever created by hand in the original dev project — never
-- scripted — so fresh environments (and the current live project) lack them,
-- breaking signature upload, annexure upload, and non-submission certificates.
-- Paths are `<report_id>/<filename>`; ownership is enforced by checking the
-- caller owns the pms_reports row named in the path's first segment.

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false), ('annexures', 'annexures', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pms_owns_report_path(p_path text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pms_reports r
        WHERE r.id::text = split_part(p_path, '/', 1)
          AND r.scientist_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "pms_signatures_select" ON storage.objects;
DROP POLICY IF EXISTS "pms_signatures_write"  ON storage.objects;
DROP POLICY IF EXISTS "pms_signatures_update" ON storage.objects;
DROP POLICY IF EXISTS "pms_annexures_select"  ON storage.objects;
DROP POLICY IF EXISTS "pms_annexures_write"   ON storage.objects;
DROP POLICY IF EXISTS "pms_annexures_delete"  ON storage.objects;

-- Read: any authenticated user with a signed URL path; report visibility is
-- already gated by pms_reports RLS before a path is ever surfaced.
CREATE POLICY "pms_signatures_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'signatures');

CREATE POLICY "pms_annexures_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'annexures');

-- Write: report owner, or PMS admins (non-submission certificates).
CREATE POLICY "pms_signatures_write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'signatures'
        AND (public.pms_owns_report_path(name) OR public.pms_is_admin())
    );

-- uploadSignature uses upsert:true — conflict resolution needs UPDATE.
CREATE POLICY "pms_signatures_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'signatures'
        AND (public.pms_owns_report_path(name) OR public.pms_is_admin())
    );

CREATE POLICY "pms_annexures_write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'annexures'
        AND (public.pms_owns_report_path(name) OR public.pms_is_admin())
    );

CREATE POLICY "pms_annexures_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'annexures'
        AND (public.pms_owns_report_path(name) OR public.pms_is_admin())
    );
