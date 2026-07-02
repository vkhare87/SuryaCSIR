-- =============================================================
-- MOCK: irins_sync_log (IRINS scraper history)
-- =============================================================
-- Powers the /irins-sync admin page's "Recent runs" table.
-- irins_profiles itself is NOT seeded — that data is JSONB
-- scraped from CSIR Vidwan profiles and should be populated by
-- running the sync via the admin UI.
-- =============================================================

INSERT INTO public.irins_sync_log
    (triggered_by, started_at, completed_at, status, total_scientists, succeeded, failed, error_details)
VALUES
    ('cron',   '2026-05-01T02:00:00Z', '2026-05-01T02:14:32Z', 'success', 12, 12, 0, NULL),
    ('cron',   '2026-05-08T02:00:00Z', '2026-05-08T02:12:45Z', 'success', 12, 12, 0, NULL),
    ('manual', '2026-05-12T14:30:00Z', '2026-05-12T14:33:10Z', 'partial', 12, 10, 2,
        '{"errors":[{"vidwan_id":"VID-007","reason":"Profile page timeout after 30s"},{"vidwan_id":"VID-011","reason":"Selector .faculty-name not found"}]}'::jsonb),
    ('cron',   '2026-05-15T02:00:00Z', '2026-05-15T02:13:18Z', 'success', 12, 12, 0, NULL);
