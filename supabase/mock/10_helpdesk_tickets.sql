-- =============================================================
-- MOCK: tickets + ticket_responses + ticket_events
-- =============================================================
-- 20 tickets across 8 categories. Tokens follow the format
-- AMPRI-YYMMDD-NNN — same shape that helpdesk_create_ticket()
-- generates in prod.
--
-- ticket_events covers a subset of tickets only (events for the
-- "interesting" lifecycles — Created/Assigned/Resolved/Closed).
-- audit_log_triggers (migration 20260516000000) will fill the
-- audit_log table for any INSERT here.
--
-- Depends on: staff AND 02b_staff_auth.sql. The actor columns became
-- uuid REFERENCES auth.users(id) in 20260725000004, so the staff codes in
-- the VALUES below are staged in temp tables and resolved through
-- staff.user_id on the way in. The readable 'S001'/'T002' codes are kept
-- because they are what makes this fixture reviewable.
-- Pre-req: seed/01_helpdesk_routing.sql for category routing
-- preview to work in the UI.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- tickets
-- ──────────────────────────────────────────────────────────────

BEGIN;

CREATE TEMP TABLE _raw_tickets (
    id uuid, token text, subject text, category text, urgency text, description text,
    submitted_by text, assigned_to text, status text,
    created_at timestamptz, updated_at timestamptz, resolved_at timestamptz
) ON COMMIT DROP;

INSERT INTO _raw_tickets
    (id, token, subject, category, urgency, description, submitted_by, assigned_to, status, created_at, updated_at, resolved_at)
VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-000000000001', 'AMPRI-260501-001', 'AC not working in Lab-A103',                                  'Infrastructure', 'High',     'The air conditioning unit in Lab-A103 has stopped cooling. Ambient temperature is affecting XRD instrument calibration.',                              'T001', 'S001', 'InProgress', '2026-05-01T09:00:00Z', '2026-05-02T14:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000002', 'AMPRI-260502-001', 'Water leakage in Building D corridor',                       'Infrastructure', 'Medium',   'Water seepage observed near the SEM lab entrance during rain. Needs immediate inspection to prevent equipment damage.',                                 'T002', 'S001', 'Open',       '2026-05-02T11:00:00Z', '2026-05-02T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000003', 'AMPRI-260503-001', 'Generator backup test overdue',                              'Infrastructure', 'Low',      'Quarterly generator backup test for Building A was scheduled in April but not conducted. Request rescheduling.',                                        'H001', 'S037', 'Open',       '2026-05-03T08:00:00Z', '2026-05-03T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000004', 'AMPRI-260430-001', 'TGA-001 calibration error',                                  'EquipmentIT',    'High',     'Thermogravimetric Analyzer showing drift in baseline readings. Calibration failed 3 consecutive attempts. Research work halted.',                       'T003', 'S012', 'InProgress', '2026-04-30T15:00:00Z', '2026-05-01T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000005', 'AMPRI-260504-001', 'Network printer not accessible from Lab-B',                  'EquipmentIT',    'Medium',   'The shared network printer (HP LaserJet M507) is offline for all users in Lab-B wing. Reboot did not resolve.',                                         'S013', 'S012', 'Open',       '2026-05-04T09:30:00Z', '2026-05-04T09:30:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000006', 'AMPRI-260415-001', 'UPS battery replacement for Lab-A servers',                  'EquipmentIT',    'Critical', 'UPS batteries in server room showing end-of-life warning. Risk of data loss during power fluctuations. Needs urgent replacement.',                      'S002', 'S037', 'Resolved',   '2026-04-15T10:00:00Z', '2026-04-28T16:00:00Z', '2026-04-28T16:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000007', 'AMPRI-260501-002', 'Request for visitor gate pass system update',                'Administrative', 'Low',      'Current visitor gate pass system does not capture visitor purpose correctly. Request adding a remarks field to the digital form.',                      'H001', 'H001', 'Open',       '2026-05-01T07:00:00Z', '2026-05-01T07:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000008', 'AMPRI-260420-001', 'Stationery requisition for Q2',                              'Administrative', 'Low',      'Quarterly stationery requisition for all 6 divisions. Attached the consolidated list. Approval needed by May 15.',                                      'H001', 'H001', 'Closed',     '2026-04-20T10:00:00Z', '2026-05-05T12:00:00Z', '2026-05-02T12:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000009', 'AMPRI-260505-001', 'Leave encashment policy clarification',                      'HRGrievance',    'Medium',   'Need clarification on leave encashment rules for project staff whose contracts were extended. Different interpretations from Finance and HR.',          'S003', 'H001', 'Open',       '2026-05-05T12:00:00Z', '2026-05-05T12:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000010', 'AMPRI-260410-001', 'Increment not reflected in March salary',                    'HRGrievance',    'High',     'My annual increment effective January 2026 was not reflected in the March 2026 salary slip. Request correction and arrears.',                           'T004', 'H001', 'Resolved',   '2026-04-10T14:00:00Z', '2026-04-20T09:00:00Z', '2026-04-20T09:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000011', 'AMPRI-260506-001', 'Travel advance settlement for DRDO meeting',                 'Finance',        'Medium',   'Need to settle travel advance of Rs. 25,000 taken for DRDO project review meeting in Delhi on April 20-22. Bills attached.',                            'S040', 'H002', 'InProgress', '2026-05-06T11:00:00Z', '2026-05-07T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000012', 'AMPRI-260425-001', 'Equipment AMC payment renewal — SEM',                        'Finance',        'Critical', 'AMC for Scanning Electron Microscope (E002, Zeiss) expired. Invoice received for renewal. Payment must be processed before May 15 to avoid service gap.','T002', 'H002', 'InProgress', '2026-04-25T09:00:00Z', '2026-05-03T16:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000013', 'AMPRI-260330-001', 'Project fund utilization certificate for OLP-2023-01',       'Finance',        'Medium',   'Utilization certificate for project OLP-2023-01 for FY 2025-26 needs CSIR-HQ submission by April 30. Funds utilized: Rs. 21,00,000.',                   'S001', 'H002', 'Closed',     '2026-03-30T08:00:00Z', '2026-04-25T10:00:00Z', '2026-04-15T10:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000014', 'AMPRI-260507-001', 'Need argon gas cylinder for glovebox',                       'LabResearch',    'High',     'Argon gas cylinder for glovebox in Lab-NST is empty. Thin film deposition work is blocked. Two cylinders needed — one for use, one as backup.',          'T002', 'S037', 'Open',       '2026-05-07T08:00:00Z', '2026-05-07T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000015', 'AMPRI-260503-002', 'Chemical waste disposal — corrosion testing lab',            'LabResearch',    'Medium',   'Corrosion testing lab (E102) has accumulated ~15L of chemical waste from salt spray tests. Needs authorized disposal as per CSIR safety guidelines.',    'T004', 'S040', 'InProgress', '2026-05-03T14:00:00Z', '2026-05-05T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000016', 'AMPRI-260418-001', 'Request for deionized water plant maintenance',              'LabResearch',    'Low',      'DI water plant in Lab-B showing reduced output. RO membrane may need replacement. Last serviced December 2025.',                                        'S026', 'S037', 'Open',       '2026-04-18T09:00:00Z', '2026-04-18T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000017', 'AMPRI-260502-002', 'Journal access expired — Acta Materialia',                   'Library',        'High',     'Access to Acta Materialia journal through CSIR-NISTADS consortium appears to have expired. Multiple researchers unable to access recent articles.',     'S002', 'S001', 'InProgress', '2026-05-02T13:00:00Z', '2026-05-03T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000018', 'AMPRI-260506-002', 'Request to add books to library catalog',                    'Library',        'Low',      'Please add the following 5 books to the CSIR-AMPRI library catalog: (list attached). Recommended by PhD supervisors for student reference.',            'S025', 'S001', 'Open',       '2026-05-06T10:00:00Z', '2026-05-06T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000019', 'AMPRI-260504-002', 'Vehicle booking for field visit to Mandideep',               'Transport',      'Medium',   'Request official vehicle for field visit to industrial cluster in Mandideep on May 12. 4 staff members, full day trip.',                                'S014', 'S012', 'Open',       '2026-05-04T11:00:00Z', '2026-05-04T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000020', 'AMPRI-260408-001', 'Vehicle logbook discrepancy — April 2026',                   'Transport',      'Low',      'Vehicle No. MP04-CA-1234 logbook shows 150km more than odometer reading for April. Request audit of fuel receipts.',                                    'H002', 'S012', 'Resolved',   '2026-04-08T10:00:00Z', '2026-04-18T15:00:00Z', '2026-04-18T15:00:00Z')
;

-- Resolve staff."ID" → auth.users.id. The actor columns became
-- uuid REFERENCES auth.users(id) in 20260725000004, so the staff codes above
-- cannot be inserted directly any more. 02b_staff_auth.sql guarantees every
-- staff row has a link, and its own assertion fails loudly if not.
INSERT INTO public.tickets
    (id, token, subject, category, urgency, description, submitted_by, assigned_to, status, created_at, updated_at, resolved_at)
SELECT r.id, r.token, r.subject, r.category, r.urgency, r.description,
       sb.user_id, ab.user_id, r.status, r.created_at, r.updated_at, r.resolved_at
  FROM _raw_tickets r
  JOIN      public.staff sb ON sb."ID" = r.submitted_by
  LEFT JOIN public.staff ab ON ab."ID" = r.assigned_to
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- ticket_responses (conversation thread per ticket)
-- ──────────────────────────────────────────────────────────────

CREATE TEMP TABLE _raw_responses (
    id uuid, ticket_id uuid, author_id text, message text, created_at timestamptz
) ON COMMIT DROP;

INSERT INTO _raw_responses
    (id, ticket_id, author_id, message, created_at)
VALUES
    ('bbbb2222-bbbb-bbbb-bbbb-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'S001', 'Acknowledged. I have contacted the HVAC maintenance contractor. They will inspect on May 3.', '2026-05-02T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000002', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'T001', 'Thank you. To clarify — the AC unit model is Blue Star 2TR split. The outdoor unit shows error code E3 (compressor overload). Sharing this for the technician.', '2026-05-02T14:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000003', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'S037', 'Priority approved. I have placed an order for 16 x 12V 42Ah SMF batteries. Expected delivery April 22.', '2026-04-16T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000004', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'S037', 'Batteries installed and tested. UPS runtime restored to ~45 minutes at full load. Closing this ticket.', '2026-04-28T16:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000005', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'H001', 'I have checked your records. The increment order was received from Director office on April 12. Arrears will be processed in April salary.', '2026-04-12T09:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000006', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'T004', 'Thank you. I have received the arrears in April salary. Please close the ticket.', '2026-04-20T09:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000007', 'aaaa1111-aaaa-aaaa-aaaa-000000000012', 'H002', 'Invoice verified against AMC agreement. Payment processing initiated — expected to reflect by May 10.', '2026-05-03T16:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000008', 'aaaa1111-aaaa-aaaa-aaaa-000000000004', 'S012', 'Called TA Instruments service. Engineer visit scheduled for May 5. Please ensure the instrument is powered down before the visit.', '2026-05-01T10:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000009', 'aaaa1111-aaaa-aaaa-aaaa-000000000015', 'S040', 'Contacted authorized waste disposal agency (MPPCB-approved). Collection scheduled for May 10. Please segregate waste by type and label containers.', '2026-05-05T11:00:00Z'),
    ('bbbb2222-bbbb-bbbb-bbbb-000000000010', 'aaaa1111-aaaa-aaaa-aaaa-000000000017', 'S001', 'I have raised this with CSIR-NISTADS consortium coordinator. Will update once I hear back.', '2026-05-03T10:00:00Z')
;

INSERT INTO public.ticket_responses (id, ticket_id, author_id, message, created_at)
SELECT r.id, r.ticket_id, a.user_id, r.message, r.created_at
  FROM _raw_responses r
  JOIN public.staff a ON a."ID" = r.author_id
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- ticket_events (state transitions; 'system' actor = auto-route)
-- ──────────────────────────────────────────────────────────────

CREATE TEMP TABLE _raw_events (
    id uuid, ticket_id uuid, event_type text, actor_id text, details jsonb, created_at timestamptz
) ON COMMIT DROP;

INSERT INTO _raw_events
    (id, ticket_id, event_type, actor_id, details, created_at)
VALUES
    ('cccc3333-cccc-cccc-cccc-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Created',       'T001',   '{"token":"AMPRI-260501-001","category":"Infrastructure"}'::jsonb, '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000002', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Assigned',      'system', '{"assigned_to":"S001"}'::jsonb,                                   '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000003', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'StatusChanged', 'S001',   '{"from":"Open","to":"InProgress"}'::jsonb,                        '2026-05-02T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000004', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Created',       'S002',   '{"token":"AMPRI-260415-001","category":"EquipmentIT"}'::jsonb,    '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000005', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Assigned',      'system', '{"assigned_to":"S037"}'::jsonb,                                   '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000006', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'StatusChanged', 'S037',   '{"from":"Open","to":"InProgress"}'::jsonb,                        '2026-04-16T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000007', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Resolved',      'S037',   '{"from":"InProgress","to":"Resolved"}'::jsonb,                    '2026-04-28T16:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000008', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Created',       'T004',   '{"token":"AMPRI-260410-001","category":"HRGrievance"}'::jsonb,    '2026-04-10T14:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000009', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Resolved',      'H001',   '{"from":"Open","to":"Resolved"}'::jsonb,                          '2026-04-20T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000010', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Created',       'S001',   '{"token":"AMPRI-260330-001","category":"Finance"}'::jsonb,        '2026-03-30T08:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000011', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Closed',        'S001',   '{"from":"Resolved","to":"Closed"}'::jsonb,                        '2026-04-25T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000012', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Created',       'H002',   '{"token":"AMPRI-260408-001","category":"Transport"}'::jsonb,      '2026-04-08T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000013', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Resolved',      'S012',   '{"from":"Open","to":"Resolved"}'::jsonb,                          '2026-04-18T15:00:00Z')
;

-- 'system' actor → NULL. 20260725000004 retired the sentinel: a uuid column
-- cannot hold it, and NULL is the honest representation of "no human did
-- this". The LEFT JOIN yields NULL for it automatically, since no staff row
-- has "ID" = 'system'.
INSERT INTO public.ticket_events (id, ticket_id, event_type, actor_id, details, created_at)
SELECT e.id, e.ticket_id, e.event_type, a.user_id, e.details, e.created_at
  FROM _raw_events e
  LEFT JOIN public.staff a ON a."ID" = e.actor_id
ON CONFLICT (id) DO NOTHING;

COMMIT;
