-- ============================================================
-- 20261102000008_verified_gates
-- Security review 2026-11-01, SEC-02 / SEC-04 / SEC-11.
--
-- 1. The /ask page is VERIFIED-only in ACCESS_MAP, but the RAG API accepted
--    any valid JWT, so a Guest / DefaultUser account could query the corpus
--    with curl. can_use_ask_surya() answers the SPA's question for the API.
--    Neither function takes an argument, so neither can probe another user.
-- 2. institute-tier documents were readable by any auth.uid(), which includes
--    the two un-provisioned roles. They now need a verified role.
-- 3. The shared 'documents' bucket accepted any path from any user. New
--    objects and their registry rows must live under '<uploader uid>/'.
--    Reads still key on the registry row, not the path, so existing
--    documents keep their paths and stay readable. The ingest worker uses
--    the service role and is not affected.
-- ============================================================

CREATE OR REPLACE FUNCTION public.caller_is_verified()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- Mirrors VERIFIED in src/constants/access.ts: any role held (not only
    -- the active one) other than the two un-provisioned ones.
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = (SELECT auth.uid())
           AND role NOT IN ('Guest', 'DefaultUser')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_use_ask_surya()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- Role gate, then the global kill switch. Per-role blocks stay a UI
    -- concern: the API must not lock a user out over the role they happen
    -- to be acting as in the browser.
    SELECT public.caller_is_verified()
       AND coalesce(
             (SELECT c.enabled FROM public.feature_controls c WHERE c.feature_key = '/ask'),
             true);
$$;

REVOKE ALL ON FUNCTION public.caller_is_verified() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_use_ask_surya()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_verified() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_ask_surya()  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.documents_can_read(d public.documents)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    d.owner_id = (SELECT auth.uid())
    OR public.proposals_caller_has_role('HRAdmin')
    OR public.proposals_caller_has_role('SystemAdmin')
    OR public.proposals_caller_has_role('MasterAdmin')
    OR public.proposals_caller_has_role('Director')
    OR (d.access_tier = 'institute' AND public.caller_is_verified())
    OR (d.access_tier = 'division'
        AND d.division_code IS NOT NULL
        AND d.division_code = public.proposals_caller_division());
$$;

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND name LIKE (SELECT auth.uid())::text || '/%'
  );

-- Keeps the tier rule from 20260725000001; adds the path namespace for the
-- shared bucket only (PMS annexures register from their own bucket).
DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents
  FOR INSERT WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (storage_bucket <> 'documents'
         OR storage_path LIKE (SELECT auth.uid())::text || '/%')
    AND (
      public.caller_is_admin()
      OR public.caller_has_role('Director')
      OR access_tier IN ('owner', 'confidential')
    )
  );

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.can_use_ask_surya()', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can call can_use_ask_surya';
    END IF;
END $$;
