-- ════════════════════════════════════════════════════════════════════
-- SURYA — Supplemental Seed Data
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER supabase/seed.sql. Covers tables not in the original seed:
--   - helpdesk_routing (8 categories — critical for TicketForm preview)
--   - vacancy_advertisements + vacancy_posts (Recruitment portal data)
--   - irins_sync_log (IRINS Sync admin page history)
--
-- Column shapes match the LIVE Supabase schema (verified 2026-05-16
-- via OpenAPI introspection), not the migration files. The live
-- vacancy_* tables were created by an earlier schema variant — they
-- have advt_no / advertisement_id / post_code instead of the
-- title-keyed columns the migration in 20260501... declares.
--
-- Not included (require auth.users uuids — seed manually after creating
-- additional users via Auth → Users):
--   - pms_reports + pms_evaluations + pms_chairman_reviews
--   - pms_collegiums + pms_collegium_members
--   - pms_notifications
--   - irins_profiles (JSONB scrape data — populate via /irins-sync page)
-- ════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- 1. HELPDESK_ROUTING (one row per ticket category)
-- ──────────────────────────────────────────────────────────────
-- Maps each TicketCategory to a handler (role name OR division code).
-- TicketForm.tsx uses this to show the "Will be routed to..." preview.

INSERT INTO public.helpdesk_routing (id, category, target_type, target_id) VALUES
    ('00000001-0000-0000-0000-000000000001', 'Infrastructure', 'role',     'SystemAdmin'),
    ('00000001-0000-0000-0000-000000000002', 'EquipmentIT',    'role',     'SystemAdmin'),
    ('00000001-0000-0000-0000-000000000003', 'Administrative', 'role',     'HRAdmin'),
    ('00000001-0000-0000-0000-000000000004', 'HRGrievance',    'role',     'HRAdmin'),
    ('00000001-0000-0000-0000-000000000005', 'Finance',        'role',     'FinanceAdmin'),
    ('00000001-0000-0000-0000-000000000006', 'LabResearch',    'division', 'NST'),
    ('00000001-0000-0000-0000-000000000007', 'Library',        'role',     'HRAdmin'),
    ('00000001-0000-0000-0000-000000000008', 'Transport',      'role',     'HRAdmin')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 2. VACANCY_ADVERTISEMENTS
-- Columns: id, advt_no, title, description, division_code,
--          issue_date, closing_date, status, created_by, created_at
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.vacancy_advertisements
    (id, advt_no, title, description, division_code, issue_date, closing_date, status)
VALUES
    ('a0000001-0000-0000-0000-000000000001', 'ADV/2026/001',
     'Senior Scientist — Refractory Ceramics',
     'Lead research on next-gen mullite-bonded SiC refractories for high-temperature industrial applications. Ph.D. + 5 yrs post-PhD experience required.',
     'ARC', '2026-04-15', '2026-06-15', 'Published'),

    ('a0000001-0000-0000-0000-000000000002', 'ADV/2026/002',
     'Scientist — Energy Materials',
     'Develop next-generation cathode materials for sodium-ion battery systems. Ph.D. in Chemistry or Materials Science required.',
     'EEC', '2026-04-20', '2026-06-20', 'Published'),

    ('a0000001-0000-0000-0000-000000000003', 'ADV/2026/003',
     'Technical Officer — Electron Microscopy',
     'Operate SEM/TEM systems, train users, maintain sample preparation lab. M.Sc./M.Tech with hands-on EM experience.',
     'NST', '2026-04-25', '2026-05-30', 'Published'),

    ('a0000001-0000-0000-0000-000000000004', 'ADV/2026/004',
     'HR Admin Officer',
     'Manage staff records, recruitment coordination, RTI compliance. MBA / PG in HR with 5+ yrs Govt/PSU experience.',
     NULL, '2026-05-01', '2026-07-31', 'Draft'),

    ('a0000001-0000-0000-0000-000000000005', 'ADV/2026/005',
     'Project Associate I — Biomaterials',
     'Hydroxyapatite scaffold synthesis and characterisation under DBT project. M.Tech / Ph.D. in Biomedical Engineering.',
     'BMS', '2026-01-15', '2026-03-31', 'Closed')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 3. VACANCY_POSTS (per-position rows under each advertisement)
-- Columns: id, advertisement_id, post_code, designation, discipline,
--          no_of_positions, pay_level, age_limit, qualifications, status
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.vacancy_posts
    (id, advertisement_id, post_code, designation, discipline, no_of_positions, pay_level, age_limit, qualifications, status)
VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
     'POST-001-A', 'Senior Scientist', 'Ceramic Engineering / Materials Science', 2, 'Level 12', 'Max 40 yrs',
     'Ph.D. in Ceramic Engineering or Materials Science with 5+ yrs post-PhD R&D experience. Publications in Acta Materialia / JECS preferred.',
     'Open'),

    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002',
     'POST-002-A', 'Scientist', 'Chemistry / Materials Science', 1, 'Level 11', 'Max 35 yrs',
     'Ph.D. in Chemistry or Materials Science. Experience in electrochemistry and battery characterisation (cyclic voltammetry, GCD, EIS).',
     'Open'),

    ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003',
     'POST-003-A', 'Technical Officer', 'Physics / Instrumentation', 3, 'Level 7', 'Max 32 yrs',
     'M.Sc. / M.Tech with hands-on experience in electron microscopy. Min 2 yrs in academic / R&D lab.',
     'Open'),

    ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000004',
     'POST-004-A', 'Section Officer', 'Human Resources', 1, 'Level 7', 'Max 38 yrs',
     'MBA / Postgraduate in HR with 5+ yrs experience in Govt / PSU HR functions.',
     'Open'),

    ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000005',
     'POST-005-A', 'Project Associate I', 'Biomedical Engineering', 2, 'Level 6', 'Max 30 yrs',
     'M.Tech / Ph.D. in Biomedical Engineering. Experience in tissue engineering and hydroxyapatite scaffolds.',
     'Closed')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 4. IRINS_SYNC_LOG (admin page history)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.irins_sync_log
    (triggered_by, started_at, completed_at, status, total_scientists, succeeded, failed, error_details)
VALUES
    ('cron',   '2026-05-01T02:00:00Z', '2026-05-01T02:14:32Z', 'success', 12, 12, 0, NULL),
    ('cron',   '2026-05-08T02:00:00Z', '2026-05-08T02:12:45Z', 'success', 12, 12, 0, NULL),
    ('manual', '2026-05-12T14:30:00Z', '2026-05-12T14:33:10Z', 'partial', 12, 10, 2,
        '{"errors":[{"vidwan_id":"VID-007","reason":"Profile page timeout after 30s"},{"vidwan_id":"VID-011","reason":"Selector .faculty-name not found"}]}'::jsonb),
    ('cron',   '2026-05-15T02:00:00Z', '2026-05-15T02:13:18Z', 'success', 12, 12, 0, NULL);
