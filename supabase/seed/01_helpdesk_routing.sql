-- =============================================================
-- SEED: helpdesk_routing — ticket category → handler map
-- =============================================================
-- Bootstrap data. Required for TicketForm.tsx to display the
-- "Will be routed to…" preview and for route_ticket() to assign
-- new tickets to the right handler.
--
-- One row per TicketCategory (8 total). target_type is either
-- 'role' (matches user_roles.role) or 'division' (matches
-- divisions."divCode", resolves to that division's HoD).
--
-- Safe to run on prod. ON CONFLICT keeps existing overrides.
-- =============================================================

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
