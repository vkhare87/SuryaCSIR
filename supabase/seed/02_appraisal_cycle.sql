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
--
-- The 2026 guidelines derive all workflow deadlines from the
-- reporting-year end (pms_deadline: self-appraisal = May 15 of
-- end_date's year, EC = Jun 30, empowered = Jul 31, absolute
-- system lock = Nov 30). Keep end_date in the CURRENT/UPCOMING
-- fiscal year so those deadlines stay in the future — otherwise
-- pms_submit_report rejects every submission as past-deadline.
-- =============================================================

INSERT INTO public.appraisal_cycles
    (id, name, start_date, end_date, status)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890',
     'FY 2026-27', '2026-04-01', '2027-03-31', 'OPEN')
ON CONFLICT (id) DO NOTHING;
