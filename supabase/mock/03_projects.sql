-- =============================================================
-- MOCK: projects
-- =============================================================
-- ProjectNo prefix conventions:
--   OLP — On-Lab Project (In-House CSIR funding)
--   EXP — Extramural (DST/DBT/DRDO/MNRE etc.)
--   CNS — Consultancy (industry-sponsored)
--
-- Depends on: divisions (DivisionCode).
-- Indirectly referenced by: phd_students, project_staff.
-- =============================================================

INSERT INTO public.projects
    ("ProjectID", "ProjectNo", "ProjectName", "FundType", "SponsorerType", "SponsorerName", "ProjectCategory", "ProjectStatus", "StartDate", "CompletioDate", "SanctionedCost", "UtilizedAmount", "PrincipalInvestigator", "DivisionCode", "Extension", "ApprovalAuthority")
VALUES
    ('P001', 'OLP-2023-01', 'Development of Mullite-Bonded SiC Refractories for Steel Ladle Applications', 'In-House', 'Government', 'CSIR', 'In-House', 'Active', '2023-04-01', '2026-03-31', '85.00', '52.30', 'Dr. Arvind Kumar Sharma', 'ARC', NULL, 'CSIR HQ'),
    ('P002', 'OLP-2024-01', 'Carbon Nanotube Reinforced Alumina Composites for Wear-Resistant Applications', 'In-House', 'Government', 'CSIR', 'In-House', 'Active', '2024-04-01', '2027-03-31', '65.00', '18.75', 'Dr. Sunita Mishra', 'NST', NULL, 'CSIR HQ'),
    ('P003', 'EXP-2022-01', 'High-Performance Cathode Materials for Next-Generation Sodium-Ion Batteries', 'Extramural', 'Government', 'DST-SERB', 'Extramural', 'Active', '2022-10-01', '2025-09-30', '42.50', '35.80', 'Dr. Priya Nair', 'EEC', NULL, 'DST'),
    ('P004', 'EXP-2023-01', 'Nano-Hydroxyapatite/Bioglass Scaffolds for Load-Bearing Bone Implants', 'Extramural', 'Government', 'DBT', 'Extramural', 'Active', '2023-07-01', '2026-06-30', '55.00', '28.40', 'Dr. Rajesh Verma', 'BMS', NULL, 'DBT'),
    ('P005', 'EXP-2023-02', 'Corrosion-Resistant Coatings for Defence Equipment under Tropical Conditions', 'Extramural', 'Government', 'DRDO', 'Extramural', 'Active', '2023-01-15', '2025-12-31', '78.00', '61.20', 'Dr. Vikram Singh Rathore', 'CPS', NULL, 'DRDO'),
    ('P006', 'EXP-2024-01', 'Visible-Light-Active Photocatalytic Membranes for Industrial Effluent Treatment', 'Extramural', 'Government', 'MNRE', 'Extramural', 'Active', '2024-01-01', '2026-12-31', '38.00', '9.50', 'Dr. Rahul Tiwari', 'EEC', NULL, 'MNRE'),
    ('P007', 'CNS-2024-01', 'Failure Analysis and Life Assessment of Refractory Lining for Bhilai Steel Plant', 'Consultancy', 'Industry', 'SAIL Bhilai', 'Consultancy', 'Active', '2024-06-01', '2025-05-31', '12.50', '8.90', 'Dr. Manoj Kumar Gupta', 'ARC', NULL, 'SAIL'),
    ('P008', 'CNS-2023-01', 'Development of Anti-Corrosion Paint Formulations for IOCL Pipeline Network', 'Consultancy', 'Industry', 'Indian Oil Corporation Ltd', 'Consultancy', 'Completed', '2023-03-01', '2024-08-31', '18.00', '18.00', 'Dr. Vikram Singh Rathore', 'CPS', NULL, 'IOCL'),
    ('P009', 'OLP-2022-01', 'Fly-Ash Based Geopolymer Binders for Sustainable Construction Materials', 'In-House', 'Government', 'CSIR', 'In-House', 'Completed', '2022-04-01', '2025-03-31', '48.00', '46.50', 'Dr. Kavita Joshi', 'PMD', NULL, 'CSIR HQ'),
    ('P010', 'EXP-2024-02', 'Flexible Electrochemical Biosensor Arrays for Point-of-Care Diagnostics', 'Extramural', 'Government', 'DST-SERB', 'Extramural', 'Active', '2024-09-01', '2027-08-31', '35.00', '5.20', 'Dr. Deepa Krishnamurthy', 'BMS', NULL, 'DST')
ON CONFLICT ("ProjectID") DO NOTHING;
