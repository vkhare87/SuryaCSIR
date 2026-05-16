-- =============================================================
-- MOCK: vacancy_advertisements + vacancy_posts
-- =============================================================
-- Schema matches LIVE Supabase (advt_no, issue_date, post_code,
-- designation, …). The earlier migration shape (position,
-- group_level, post_name, sanctioned_count) was never deployed
-- and is reshaped by migration 20260517000000_fixes_and_vacancy_sync.sql.
--
-- Run AFTER that migration applies — these inserts will fail on
-- an un-reshaped schema.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- vacancy_advertisements (one row per published advert)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.vacancy_advertisements
    (id, advt_no, title, description, division_code, issue_date, closing_date, status)
VALUES
    ('a0000001-0000-0000-0000-000000000001', 'ADV/2026/001',
     'Senior Scientist — Refractory Ceramics',
     'Lead research on next-gen mullite-bonded SiC refractories for high-temperature industrial applications. Ph.D. + 5 yrs post-PhD experience required.',
     'ARC', '2026-04-15', '2026-06-15', 'Open'),

    ('a0000001-0000-0000-0000-000000000002', 'ADV/2026/002',
     'Scientist — Energy Materials',
     'Develop next-generation cathode materials for sodium-ion battery systems. Ph.D. in Chemistry or Materials Science required.',
     'EEC', '2026-04-20', '2026-06-20', 'Open'),

    ('a0000001-0000-0000-0000-000000000003', 'ADV/2026/003',
     'Technical Officer — Electron Microscopy',
     'Operate SEM/TEM systems, train users, maintain sample preparation lab. M.Sc./M.Tech with hands-on EM experience.',
     'NST', '2026-04-25', '2026-05-30', 'Open'),

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
-- vacancy_posts (per-position rows under each advertisement)
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
     'Filled')
ON CONFLICT (id) DO NOTHING;
