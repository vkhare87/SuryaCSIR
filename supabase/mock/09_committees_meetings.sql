-- =============================================================
-- MOCK: committees, committee_members, meetings, agenda_items,
--       action_items, meeting_documents
-- =============================================================
-- All six tables seeded together since they share an FK chain:
--   committees → committee_members
--             → meetings → agenda_items
--                       → action_items
--                       → meeting_documents
--
-- NOTE: some committee_members reference staff IDs (S025, S026,
-- S037, S040, S045) that are NOT in mock/02_staff.sql — they
-- correspond to a larger staff fixture used by another seed
-- variant. Inserts will succeed because committee_members has
-- no FK to staff (staff_id is text-only). Either trim those rows
-- or expand mock/02_staff.sql when running the full mock set.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- committees
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.committees
    (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date, created_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'Research Advisory Committee',          'Standing', 'Advise on research direction, review project proposals, and evaluate annual research output across all divisions.', 'S001', 'S002', 'Active', '2024-04-01', '2024-04-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'Equipment Procurement Review',         'AdHoc',    'Evaluate major equipment purchase proposals (>10 lakhs), assess technical specifications, and recommend vendor selection.', 'S040', 'T004', 'Active', '2025-08-15', '2025-08-15T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'PhD Progress Review Committee',        'Review',   'Review PhD student progress biannually, evaluate thesis submissions, and recommend synopsis approvals.', 'S025', 'S026', 'Active', '2023-01-10', '2023-01-10T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'Industry Collaboration Advisory Board','Advisory', 'Identify industry partnership opportunities, review MoUs, and guide technology transfer initiatives.', 'S012', 'S014', 'Active', '2025-01-01', '2025-01-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'Infrastructure & Safety Committee',    'Standing', 'Oversee lab infrastructure maintenance, safety compliance audits, and building facility upgrades.', 'S037', 'T002', 'Active', '2023-06-01', '2023-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- committee_members
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.committee_members
    (id, committee_id, staff_id, role)
VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S001', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S012', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S040', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'S045', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'H001', 'Invitee'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'S040', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'T004', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'T001', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'H002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S025', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S026', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S003', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'S013', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S012', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000016', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S014', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000017', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'H002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000018', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'S045', 'Invitee'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000019', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'S037', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000020', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'T002', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000021', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'T003', 'Member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-000000000022', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'H001', 'Invitee')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- meetings
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.meetings
    (id, committee_id, meeting_date, venue, title, summary, status, created_at)
VALUES
    ('cccccccc-cccc-cccc-cccc-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-04-10', 'CSIR-AMPRI Conference Hall', 'Q1 Research Review Meeting',           'Reviewed 8 project proposals. Approved 5 for funding in FY 2026-27.', 'Completed', '2026-03-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-05-07', 'Virtual — MS Teams',         'Mid-Year Research Assessment',         '', 'Scheduled', '2026-04-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-06-15', 'CSIR-AMPRI Auditorium',      'Annual Research Output Evaluation',    '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-04-05', 'Admin Board Room',           'XRD Replacement Procurement',          'Finalized specs for Rigaku SmartLab XRD. Recommended sole-source procurement due to compatibility.', 'Completed', '2026-03-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-05-10', 'Admin Board Room',           'SEM-EDS Upgrade Evaluation',           '', 'Scheduled', '2026-04-25T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-06-20', 'Admin Board Room',           'Q2 Equipment Budget Allocation',       '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-03-20', 'Seminar Hall',               'PhD Synopsis Review — Spring 2026',    'Reviewed 3 synopses. Approved all with minor revisions. Student presentations assessed by panel.', 'Completed', '2026-03-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-05-15', 'Seminar Hall',               'PhD Progress Presentations',           '', 'Scheduled', '2026-04-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-07-01', 'Seminar Hall',               'Thesis Defense Evaluations',           '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-02-15', 'CSIR-AMPRI Guest House',     'Industry MoU Review — Q4 FY2025',      'Reviewed 3 MoUs with NTPC, Tata Steel, and DRDO. Recommended signing all three.', 'Completed', '2026-02-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-05-20', 'CSIR-AMPRI Guest House',     'Technology Transfer Pipeline Review',  '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-06-10', 'Virtual — Google Meet',      'New Partner Identification Workshop',  '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-03-01', 'Admin Board Room',           'Annual Safety Audit Review',           'Reviewed 12 non-conformances from 2025 audit. 10 resolved, 2 pending — assigned action items.', 'Completed', '2026-02-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-05-25', 'Admin Board Room',           'Lab Infrastructure Upgrade Planning',  '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-07-15', 'Admin Board Room',           'Fire Safety Drill & Equipment Audit',  '', 'Scheduled', '2026-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- agenda_items
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.agenda_items
    (id, meeting_id, sequence, description, proposed_by, status)
VALUES
    ('dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 1, 'Review of Q4 FY2025 research output',                            'S001', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 2, 'New project proposal: Nano-refractories for steel industry',     'S002', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000003', 'cccccccc-cccc-cccc-cccc-000000000001', 3, 'Budget allocation for FY 2026-27 research programs',             'S012', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000004', 'cccccccc-cccc-cccc-cccc-000000000001', 4, 'Any other business — patent filing status update',               'S045', 'Deferred'),
    ('dddddddd-dddd-dddd-dddd-000000000005', 'cccccccc-cccc-cccc-cccc-000000000002', 1, 'Mid-year project status reports from all divisions',             'S001', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000006', 'cccccccc-cccc-cccc-cccc-000000000002', 2, 'PhD candidate recruitment plan 2027',                            'S014', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000007', 'cccccccc-cccc-cccc-cccc-000000000004', 1, 'Technical specification review for new XRD system',              'S040', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000008', 'cccccccc-cccc-cccc-cccc-000000000004', 2, 'Vendor comparison: Rigaku vs. Bruker vs. PANalytical',           'T004', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000009', 'cccccccc-cccc-cccc-cccc-000000000007', 1, 'Synopsis review: Arjun Nair (Refractory Ceramics)',              'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000010', 'cccccccc-cccc-cccc-cccc-000000000007', 2, 'Synopsis review: Divya Kapoor (Energy Materials)',               'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000011', 'cccccccc-cccc-cccc-cccc-000000000013', 1, 'Non-conformance closure status review',                          'S037', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000012', 'cccccccc-cccc-cccc-cccc-000000000013', 2, 'Emergency shower and eyewash station inspection report',         'T003', 'Discussed')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- action_items
-- ──────────────────────────────────────────────────────────────
-- source = 'meeting' rows reference meetings.id; 'manual' rows
-- have meeting_id = NULL (admin-created standalone tasks).

INSERT INTO public.action_items
    (id, meeting_id, source, task, assigned_to, deadline, status, completed_at, notes)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Submit revised budget proposal for Nano-refractory project',   'S002', '2026-05-20', 'Pending',    NULL,                       'Include consumables cost escalation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Distribute Q1 review minutes to all division heads',           'H001', '2026-05-01', 'Pending',    NULL,                       ''),
    ('eeeeeeee-eeee-eeee-eeee-000000000003', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Obtain three vendor quotations for XRD procurement',           'T004', '2026-05-30', 'Pending',    NULL,                       'Rigaku quote already received'),
    ('eeeeeeee-eeee-eeee-eeee-000000000004', NULL,                                   'manual',  'Prepare annual equipment calibration schedule for all labs',   'T001', '2026-06-15', 'Pending',    NULL,                       'Coordinate with division heads for access windows'),
    ('eeeeeeee-eeee-eeee-eeee-000000000005', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Replace faulty fire extinguishers in Labs A, C, and D',         'T002', '2026-05-15', 'Pending',    NULL,                       '2 CO2 and 1 Dry Powder type needed'),
    ('eeeeeeee-eeee-eeee-eeee-000000000006', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Compile patent filing tracker for FY 2025-26',                 'S045', '2026-05-10', 'InProgress', NULL,                       'Awaiting legal department confirmation on 2 filings'),
    ('eeeeeeee-eeee-eeee-eeee-000000000007', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Schedule thesis defense for Arjun Nair',                       'S026', '2026-05-25', 'InProgress', NULL,                       'Waiting for external examiner confirmation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000008', NULL,                                   'manual',  'Update chemical inventory database for all labs',              'T003', '2026-06-01', 'InProgress', NULL,                       'BMS and NST labs completed, ARC pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000009', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Install additional fume hoods in Lab-C',                       'S037', '2026-07-01', 'InProgress', NULL,                       'Civil work in progress, electrical connection pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000010', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Draft MoU template for industry-sponsored PhD programs',       'S012', '2026-05-30', 'InProgress', NULL,                       'Legal review awaited'),
    ('eeeeeeee-eeee-eeee-eeee-000000000011', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Archive closed projects documentation for CSIR audit',         'H001', '2026-04-15', 'Completed',  '2026-04-10T00:00:00Z',     'All 5 closed projects documented'),
    ('eeeeeeee-eeee-eeee-eeee-000000000012', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Decommission non-operational HT furnace (E006)',               'T001', '2026-04-30', 'Completed',  '2026-04-28T00:00:00Z',     'Repair order placed, furnace isolated'),
    ('eeeeeeee-eeee-eeee-eeee-000000000013', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Update PhD student handbook with new submission guidelines',   'S026', '2026-03-31', 'Completed',  '2026-03-28T00:00:00Z',     'PDF shared with all supervisors'),
    ('eeeeeeee-eeee-eeee-eeee-000000000014', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Send signed MoUs to CSIR-HQ for ratification',                 'H001', '2026-03-01', 'Completed',  '2026-02-28T00:00:00Z',     'All 3 MoUs acknowledged by HQ'),
    ('eeeeeeee-eeee-eeee-eeee-000000000015', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Complete electrical safety audit for all buildings',           'T002', '2026-03-15', 'Completed',  '2026-03-12T00:00:00Z',     'Minor issues noted in Building D, reported to maintenance')
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- meeting_documents (pointers into committee-docs storage bucket)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.meeting_documents
    (id, meeting_id, file_name, storage_path, uploaded_at)
VALUES
    ('dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Meeting_Agenda.pdf',  'committee-docs/mtg-01/agenda.pdf', '2026-03-15T00:00:00Z'),
    ('dddddddd-dddd-dddd-dddd-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Review_Minutes.pdf',  'committee-docs/mtg-01/minutes.pdf','2026-04-12T00:00:00Z'),
    ('dddddddd-dddd-dddd-dddd-000000000003', 'cccccccc-cccc-cccc-cccc-000000000004', 'XRD_Technical_Specs.pdf',         'committee-docs/mtg-04/specs.pdf',  '2026-03-20T00:00:00Z'),
    ('dddddddd-dddd-dddd-dddd-000000000004', 'cccccccc-cccc-cccc-cccc-000000000007', 'PhD_Synopsis_Review_Minutes.pdf', 'committee-docs/mtg-07/minutes.pdf','2026-03-25T00:00:00Z'),
    ('dddddddd-dddd-dddd-dddd-000000000005', 'cccccccc-cccc-cccc-cccc-000000000013', 'Safety_Audit_Report_2025.pdf',    'committee-docs/mtg-13/audit.pdf',  '2026-02-15T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
