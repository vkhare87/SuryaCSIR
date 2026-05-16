-- =============================================================
-- MOCK: staff
-- =============================================================
-- 18 rows across three bands:
--   S001-S012 Scientific (Levels 5-7)
--   T001-T004 Technical Officers (Level 4)
--   H001-H002 Administrative (Level 3)
--
-- ID schema (also used as FK target by project_staff,
-- contract_staff, committee_members, tickets, etc.):
--   S = Scientist  T = Technical  H = Admin (HR/Finance)
-- Level legend: 7 Chief, 6 Principal/Senior, 5 Scientist,
--               4 Technical Officer, 3 Section Officer.
--
-- Depends on: divisions (FK target via Division column).
-- =============================================================

INSERT INTO public.staff
    ("ID", "LabCode", "EmployeeType", "Name", "Designation", "Group", "Division", "DoAPP", "DOJ", "DOB", "Cat", "AppointmentType", "Level", "CoreArea", "Expertise", "Email", "Ext", "VidwanID", "ReportingID", "HighestQualification", "Gender")
VALUES
    -- Chief Scientists (Division Heads, Level 7)
    ('S001', 'AMPRI', 'Regular', 'Dr. Arvind Kumar Sharma', 'Chief Scientist', 'Scientific', 'ARC', '2020-04-01', '2002-07-15', '1968-03-22', 'GEN', 'Direct', '7', 'Advanced Ceramics', 'High-temperature ceramics, refractory composites, thermal barrier coatings, spark plasma sintering', 'ak.sharma@ampri.res.in', '201', 'VID-001', NULL, 'Ph.D. (Ceramic Engineering), BHU', 'Male'),
    ('S002', 'AMPRI', 'Regular', 'Dr. Priya Nair', 'Chief Scientist', 'Scientific', 'EEC', '2019-10-01', '2001-09-03', '1969-11-14', 'GEN', 'Direct', '7', 'Energy Materials', 'Solid oxide fuel cells, lithium-ion cathode materials, electrochemical energy storage, impedance spectroscopy', 'p.nair@ampri.res.in', '202', 'VID-002', NULL, 'Ph.D. (Materials Science), IISc Bangalore', 'Female'),
    ('S003', 'AMPRI', 'Regular', 'Dr. Rajesh Verma', 'Chief Scientist', 'Scientific', 'BMS', '2021-01-01', '2003-01-20', '1970-06-08', 'OBC', 'Direct', '7', 'Biomaterials', 'Hydroxyapatite coatings, bioactive glass, scaffolds for bone tissue engineering, electrochemical biosensors', 'r.verma@ampri.res.in', '203', 'VID-003', NULL, 'Ph.D. (Biomedical Engineering), IIT Bombay', 'Male'),
    ('S004', 'AMPRI', 'Regular', 'Dr. Sunita Mishra', 'Chief Scientist', 'Scientific', 'NST', '2020-07-01', '2000-11-10', '1967-09-30', 'GEN', 'Direct', '7', 'Nanomaterials', 'Carbon nanotubes, graphene synthesis, thin film deposition, plasma spray coatings, surface characterization', 's.mishra@ampri.res.in', '204', 'VID-004', NULL, 'Ph.D. (Physics), University of Delhi', 'Female'),

    -- Principal / Senior Scientists (Level 6)
    ('S005', 'AMPRI', 'Regular', 'Dr. Manoj Kumar Gupta', 'Principal Scientist', 'Scientific', 'ARC', '2022-04-01', '2008-06-01', '1978-01-15', 'GEN', 'Direct', '6', 'Structural Ceramics', 'Silicon carbide ceramics, alumina-zirconia composites, mechanical characterization, fracture toughness', 'mk.gupta@ampri.res.in', '211', 'VID-005', 'S001', 'Ph.D. (Materials Engineering), IIT Kanpur', 'Male'),
    ('S006', 'AMPRI', 'Regular', 'Dr. Anita Deshmukh', 'Principal Scientist', 'Scientific', 'EEC', '2021-10-01', '2009-03-15', '1979-05-20', 'SC', 'Direct', '6', 'Energy Storage', 'Supercapacitor electrode materials, MnO2 nanostructures, conducting polymers, cyclic voltammetry', 'a.deshmukh@ampri.res.in', '212', 'VID-006', 'S002', 'Ph.D. (Chemistry), NCL Pune', 'Female'),
    ('S007', 'AMPRI', 'Regular', 'Dr. Vikram Singh Rathore', 'Senior Scientist', 'Scientific', 'CPS', '2023-04-01', '2012-08-20', '1983-12-05', 'GEN', 'Direct', '6', 'Corrosion Engineering', 'Corrosion inhibitors, electroless nickel coatings, potentiodynamic polarization, EIS, salt spray testing', 'vs.rathore@ampri.res.in', '215', 'VID-007', 'S001', 'Ph.D. (Metallurgical Engineering), IIT BHU', 'Male'),
    ('S008', 'AMPRI', 'Regular', 'Dr. Kavita Joshi', 'Senior Scientist', 'Scientific', 'PMD', '2023-04-01', '2013-01-10', '1984-08-18', 'OBC', 'Direct', '6', 'Polymer Composites', 'Natural fibre-reinforced polymers, fly ash-filled composites, rubber compounding, DMA, thermal analysis', 'k.joshi@ampri.res.in', '216', 'VID-008', 'S002', 'Ph.D. (Polymer Science), CSJM University Kanpur', 'Female'),

    -- Scientists (Level 5)
    ('S009', 'AMPRI', 'Regular', 'Dr. Amit Patel', 'Scientist', 'Scientific', 'NST', '2024-04-01', '2016-09-01', '1988-04-12', 'GEN', 'Direct', '5', 'Thin Films', 'PVD coatings, magnetron sputtering, tribological films, nanoindentation, XPS analysis', 'a.patel@ampri.res.in', '221', 'VID-009', 'S004', 'Ph.D. (Surface Engineering), IIT Roorkee', 'Male'),
    ('S010', 'AMPRI', 'Regular', 'Dr. Deepa Krishnamurthy', 'Scientist', 'Scientific', 'BMS', '2024-04-01', '2017-04-15', '1990-02-28', 'GEN', 'Direct', '5', 'Biosensors', 'Electrochemical sensors, molecularly imprinted polymers, aptasensors, lab-on-chip, screen-printed electrodes', 'd.krishnamurthy@ampri.res.in', '222', 'VID-010', 'S003', 'Ph.D. (Bioelectronics), CSIR-CECRI Karaikudi', 'Female'),
    ('S011', 'AMPRI', 'Regular', 'Dr. Rahul Tiwari', 'Scientist', 'Scientific', 'EEC', '2024-10-01', '2018-07-22', '1991-07-03', 'OBC', 'Direct', '5', 'Photocatalysis', 'TiO2 nanostructures, visible-light photocatalysis, water splitting, dye degradation, photoreactor design', 'r.tiwari@ampri.res.in', '223', 'VID-011', 'S002', 'Ph.D. (Chemical Engineering), IIT Delhi', 'Male'),
    ('S012', 'AMPRI', 'Regular', 'Dr. Neha Saxena', 'Scientist', 'Scientific', 'CPS', '2025-04-01', '2019-11-05', '1992-10-25', 'GEN', 'Direct', '5', 'Protective Coatings', 'Sol-gel coatings, epoxy nanocomposite coatings, anti-corrosion performance, adhesion testing, weathering studies', 'n.saxena@ampri.res.in', '224', 'VID-012', 'S007', 'Ph.D. (Materials Science), CSIR-NML Jamshedpur', 'Female'),

    -- Technical Officers (Level 4)
    ('T001', 'AMPRI', 'Regular', 'Shri Ramesh Yadav', 'Technical Officer', 'Technical', 'ARC', '2018-04-01', '2005-03-10', '1975-08-20', 'OBC', 'Direct', '4', 'Instrument Operation', 'XRD operation and analysis, sample preparation, powder diffraction, Rietveld refinement', 'r.yadav@ampri.res.in', '301', NULL, 'S001', 'M.Tech (Instrumentation), RGPV Bhopal', 'Male'),
    ('T002', 'AMPRI', 'Regular', 'Shri Dinesh Kumar Pandey', 'Technical Officer', 'Technical', 'NST', '2019-04-01', '2007-06-25', '1977-03-15', 'GEN', 'Direct', '4', 'Electron Microscopy', 'SEM/EDS operation, TEM sample preparation, image analysis, sputter coating', 'd.pandey@ampri.res.in', '302', NULL, 'S004', 'M.Sc. (Physics), Barkatullah University Bhopal', 'Male'),
    ('T003', 'AMPRI', 'Regular', 'Smt. Rekha Bhatt', 'Technical Officer', 'Technical', 'EEC', '2020-04-01', '2010-01-08', '1982-12-10', 'GEN', 'Direct', '4', 'Thermal Analysis', 'TGA/DSC operation, dilatometry, thermal conductivity measurement, sample handling', 'r.bhatt@ampri.res.in', '303', NULL, 'S002', 'M.Sc. (Chemistry), Jiwaji University Gwalior', 'Female'),
    ('T004', 'AMPRI', 'Regular', 'Shri Ajay Soni', 'Technical Officer', 'Technical', 'BMS', '2021-04-01', '2011-09-15', '1984-06-05', 'SC', 'Direct', '4', 'Lab Management', 'Biomaterials testing, cell culture facility maintenance, autoclave operation, ISO documentation', 'a.soni@ampri.res.in', '304', NULL, 'S003', 'M.Sc. (Biotechnology), Devi Ahilya University Indore', 'Male'),

    -- Administrative (Level 3)
    ('H001', 'AMPRI', 'Regular', 'Shri Prakash Dubey', 'Section Officer', 'Admin', NULL, '2015-04-01', '2004-12-01', '1973-05-18', 'GEN', 'Direct', '3', 'Administration', 'Establishment matters, service records, recruitment coordination, RTI', 'p.dubey@ampri.res.in', '101', NULL, NULL, 'B.A. (Public Administration), Barkatullah University', 'Male'),
    ('H002', 'AMPRI', 'Regular', 'Smt. Meena Sharma', 'Assistant Section Officer', 'Admin', NULL, '2018-04-01', '2010-08-10', '1982-09-25', 'GEN', 'Direct', '3', 'Finance & Accounts', 'Budget preparation, expenditure monitoring, project accounts, audit compliance', 'm.sharma@ampri.res.in', '102', NULL, 'H001', 'M.Com (Accounting), Barkatullah University', 'Female')
ON CONFLICT ("ID") DO NOTHING;
