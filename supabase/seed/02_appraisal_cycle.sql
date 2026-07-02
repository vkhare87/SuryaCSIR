-- =============================================================
-- SEED: default appraisal cycle (PMS)
-- =============================================================
-- One OPEN cycle is required before scientists can create
-- pms_reports — the reports_insert RLS policy checks that the
-- referenced cycle exists and has status='OPEN'.
--
-- Replace cycle name + dates per fiscal year. Only ONE cycle
-- should be OPEN at any time; close prior cycles via UPDATE
-- once the empowered committee finalizes all reports.
-- =============================================================

INSERT INTO public.appraisal_cycles
    (id, name, start_date, end_date, status)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
     'FY 2025-26', '2025-04-01', '2026-03-31', 'OPEN')
ON CONFLICT (id) DO NOTHING;
