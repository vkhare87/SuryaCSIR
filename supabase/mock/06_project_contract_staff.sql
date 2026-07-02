-- =============================================================
-- MOCK: project_staff + contract_staff
-- =============================================================
-- project_staff   — researchers funded against a specific
--                   project, with finite contract via project's
--                   duration window.
-- contract_staff  — lab assistants/MTS attached to a regular
--                   staff (AttachedToStaffID → staff."ID").
--
-- Depends on: projects (ProjectNo), divisions (DivisionCode),
--             staff (AttachedToStaffID).
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- project_staff
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.project_staff
    ("id", "StaffName", "Designation", "RecruitmentCycle", "DateOfJoining", "DateOfProjectDuration", "ProjectNo", "PIName", "DivisionCode")
VALUES
    ('PS-001', 'Ritu Kumari', 'Junior Research Fellow (JRF)', '2023-I', '2023-08-15', '2023-08-15 to 2025-08-14', 'EXP-2022-01', 'Dr. Priya Nair', 'EEC'),
    ('PS-002', 'Aman Verma', 'Senior Research Fellow (SRF)', '2022-II', '2022-12-01', '2022-12-01 to 2025-11-30', 'EXP-2023-01', 'Dr. Rajesh Verma', 'BMS'),
    ('PS-003', 'Nisha Thakur', 'Project Assistant Level-II', '2024-I', '2024-05-01', '2024-05-01 to 2026-04-30', 'EXP-2023-02', 'Dr. Vikram Singh Rathore', 'CPS'),
    ('PS-004', 'Karan Singh', 'Junior Research Fellow (JRF)', '2024-II', '2024-10-15', '2024-10-15 to 2026-10-14', 'EXP-2024-01', 'Dr. Rahul Tiwari', 'EEC'),
    ('PS-005', 'Shalini Mishra', 'Project Assistant Level-II', '2024-I', '2024-04-01', '2024-04-01 to 2026-03-31', 'EXP-2024-02', 'Dr. Deepa Krishnamurthy', 'BMS'),
    ('PS-006', 'Rohit Prajapati', 'Junior Research Fellow (JRF)', '2023-II', '2024-01-10', '2024-01-10 to 2026-01-09', 'OLP-2024-01', 'Dr. Sunita Mishra', 'NST'),
    ('PS-007', 'Ankita Dwivedi', 'Senior Research Fellow (SRF)', '2021-I', '2021-06-01', '2021-06-01 to 2025-05-31', 'OLP-2023-01', 'Dr. Arvind Kumar Sharma', 'ARC')
ON CONFLICT ("id") DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- contract_staff
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.contract_staff
    ("id", "Name", "Designation", "Division", "DateOfJoining", "ContractEndDate", "LabCode", "DateOfBirth", "AttachedToStaffID")
VALUES
    ('CS-001', 'Rajendra Vishwakarma', 'Lab Assistant', 'ARC', '2022-04-01', '2026-03-31', 'AMPRI', '1990-07-15', 'T001'),
    ('CS-002', 'Suneel Ahirwar', 'Lab Attendant', 'NST', '2023-01-15', '2026-01-14', 'AMPRI', '1993-11-20', 'T002'),
    ('CS-003', 'Mamta Kushwaha', 'Lab Assistant', 'EEC', '2023-07-01', '2026-06-30', 'AMPRI', '1995-03-08', 'T003'),
    ('CS-004', 'Govind Prasad Saket', 'MTS (Multi-Tasking Staff)', 'BMS', '2024-01-01', '2026-12-31', 'AMPRI', '1991-09-12', 'T004')
ON CONFLICT ("id") DO NOTHING;
