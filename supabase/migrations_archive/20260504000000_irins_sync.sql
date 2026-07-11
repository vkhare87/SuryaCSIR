-- =============================================================
-- SURYA — IRINS Data Sync
-- Tables for storing scraped IRINS scientist profiles + sync log
-- =============================================================

-- 1. IRINS scientist profiles (JSONB for flexible schema)
CREATE TABLE IF NOT EXISTS public.irins_profiles (
  vidwan_id   text PRIMARY KEY,
  profile_data jsonb NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.irins_profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (used by profile pages)
CREATE POLICY irins_profiles_read_authenticated ON public.irins_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can write (manual updates from sync page)
CREATE POLICY irins_profiles_admin_write ON public.irins_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

-- Service role write policy (for sync script running with service key)
CREATE POLICY irins_profiles_service_write ON public.irins_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Sync execution log
CREATE TABLE IF NOT EXISTS public.irins_sync_log (
  id               bigserial PRIMARY KEY,
  triggered_by     text NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  total_scientists int NOT NULL DEFAULT 0,
  succeeded        int NOT NULL DEFAULT 0,
  failed           int NOT NULL DEFAULT 0,
  error_details    jsonb
);

ALTER TABLE public.irins_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY irins_sync_log_read_authenticated ON public.irins_sync_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY irins_sync_log_admin_write ON public.irins_sync_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('SystemAdmin', 'MasterAdmin')
    )
  );

CREATE POLICY irins_sync_log_service_write ON public.irins_sync_log
  FOR ALL USING (auth.role() = 'service_role');

-- Index for listing recent syncs
CREATE INDEX IF NOT EXISTS irins_sync_log_started_idx ON public.irins_sync_log(started_at DESC);
