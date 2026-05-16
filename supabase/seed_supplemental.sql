-- ════════════════════════════════════════════════════════════════════
-- SURYA — Supplemental Seed Data
-- ════════════════════════════════════════════════════════════════════
-- Run AFTER supabase/seed.sql. Covers tables not in the original seed:
--   - helpdesk_routing (8 categories — critical for TicketForm preview)
--   - vacancy_advertisements + vacancy_posts (Recruitment portal data)
--   - irins_sync_log (IRINS Sync admin page history)
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
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.vacancy_advertisements
    (id, title, position, group_level, division_code, status, description, requirements, applicant_count, published_at, closing_date)
VALUES
    ('VAC-2026-001', 'Senior Scientist — Refractory Ceramics', 'Senior Scientist', 'Level 6', 'ARC', 'Published',
     'Lead research on next-gen mullite-bonded SiC refractories for high-temperature industrial applications.',
     'Ph.D. in Ceramic Engineering / Materials Science. Min 5 yrs post-PhD experience. Publications in Acta Materialia / JECS preferred.',
     12, '2026-04-15T00:00:00Z', '2026-06-15T23:59:59Z'),

    ('VAC-2026-002', 'Scientist — Energy Materials', 'Scientist', 'Level 5', 'EEC', 'Published',
     'Develop next-generation cathode materials for sodium-ion battery systems.',
     'Ph.D. in Chemistry / Materials Science. Experience in electrochemistry and battery characterisation.',
     8, '2026-04-20T00:00:00Z', '2026-06-20T23:59:59Z'),

    ('VAC-2026-003', 'Technical Officer — Electron Microscopy', 'Technical Officer', 'Level 4', 'NST', 'Published',
     'Operate SEM/TEM systems, train users, maintain sample preparation lab.',
     'M.Sc. / M.Tech with hands-on experience in electron microscopy. Min 2 yrs in academic / R&D lab.',
     15, '2026-04-25T00:00:00Z', '2026-05-30T23:59:59Z'),

    ('VAC-2026-004', 'HR Admin Officer', 'Section Officer', 'Level 3', NULL, 'Draft',
     'Manage staff records, recruitment coordination, RTI compliance.',
     'M.B.A. / Postgraduate in HR. Min 5 yrs experience in Govt / PSU HR roles.',
     0, NULL, '2026-07-31T23:59:59Z'),

    ('VAC-2026-005', 'Project Associate I — Biomaterials', 'Project Associate', 'Level 4', 'BMS', 'Closed',
     'Hydroxyapatite scaffold synthesis and characterisation under DBT project.',
     'M.Tech / Ph.D. in Biomedical Engineering. Experience in tissue engineering.',
     22, '2026-01-15T00:00:00Z', '2026-03-31T23:59:59Z')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- 3. VACANCY_POSTS (applicants per vacancy)
-- ──────────────────────────────────────────────────────────────
-- Note: post_name represents applicant name in this seed; reservations
-- jsonb holds {status, applicant_email, qualification} per the schema's
-- flexible design.

INSERT INTO public.vacancy_posts
    (id, vacancy_id, post_name, reservations, sanctioned_count, filled_count)
VALUES
    -- VAC-2026-001 applicants
    ('VP-2026-001-01', 'VAC-2026-001', 'Dr. Aniket Patel',  '{"status":"Shortlisted","email":"aniket.patel@example.com","qual":"Ph.D. (IIT Bombay)"}', 1, 0),
    ('VP-2026-001-02', 'VAC-2026-001', 'Dr. Meera Joshi',   '{"status":"Interviewed","email":"meera.joshi@example.com","qual":"Ph.D. (IIT Kanpur)"}',  1, 0),
    ('VP-2026-001-03', 'VAC-2026-001', 'Dr. Rohan Mehta',   '{"status":"Received","email":"rohan.mehta@example.com","qual":"Ph.D. (NIT Trichy)"}',     1, 0),

    -- VAC-2026-002 applicants
    ('VP-2026-002-01', 'VAC-2026-002', 'Dr. Saira Khan',    '{"status":"Selected","email":"saira.khan@example.com","qual":"Ph.D. (CSIR-NCL)"}',        1, 1),
    ('VP-2026-002-02', 'VAC-2026-002', 'Dr. Karan Nayak',   '{"status":"Shortlisted","email":"karan.nayak@example.com","qual":"Ph.D. (IIT Madras)"}',  1, 0),
    ('VP-2026-002-03', 'VAC-2026-002', 'Dr. Pooja Iyer',    '{"status":"Rejected","email":"pooja.iyer@example.com","qual":"M.Tech (BITS Pilani)"}',    1, 0),

    -- VAC-2026-003 applicants
    ('VP-2026-003-01', 'VAC-2026-003', 'Mr. Sanjay Verma',  '{"status":"Shortlisted","email":"sanjay.verma@example.com","qual":"M.Sc. Physics (BHU)"}',  1, 0),
    ('VP-2026-003-02', 'VAC-2026-003', 'Ms. Anjali Gupta',  '{"status":"Interviewed","email":"anjali.gupta@example.com","qual":"M.Tech (NIT Bhopal)"}',  1, 0),
    ('VP-2026-003-03', 'VAC-2026-003', 'Mr. Rakesh Singh',  '{"status":"Received","email":"rakesh.singh@example.com","qual":"M.Sc. Material Science"}',  1, 0),

    -- VAC-2026-005 applicants (closed)
    ('VP-2026-005-01', 'VAC-2026-005', 'Dr. Neha Bhardwaj', '{"status":"Selected","email":"neha.bhardwaj@example.com","qual":"Ph.D. (IIT Roorkee)"}',   1, 1),
    ('VP-2026-005-02', 'VAC-2026-005', 'Dr. Vivek Sinha',   '{"status":"Rejected","email":"vivek.sinha@example.com","qual":"M.Tech (NIT Surat)"}',      1, 0)
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
