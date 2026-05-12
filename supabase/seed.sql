-- =============================================================
-- SURYA — Seed Data
-- CSIR-AMPRI (Advanced Materials and Processes Research Institute)
-- Bhopal, India
-- =============================================================
--
-- PREREQUISITES:
--   1. Run supabase/migrations/00000000000000_init.sql first (creates all tables).
--   2. Create auth users via Supabase Dashboard or Auth API before seeding
--      user_roles / user_profiles (those are auto-created by the auth trigger).
--   3. Run this file as the postgres role (bypasses RLS) in Supabase SQL Editor
--      or via: psql -f seed.sql
--
-- This file seeds HR analytics data only. PMS data (appraisal_cycles etc.)
-- is included at the end with a single open cycle for development.
-- Auth-linked tables (user_roles, user_profiles) are NOT touched here.
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. DIVISIONS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.divisions
    ("divCode", "divName", "divDescription", "divResearchAreas", "divHoD", "divHoDID", "divSanctionedstrength", "divCurrentStrength", "divStatus")
VALUES
    ('ARC', 'Advanced Refractory Ceramics', 'Research on high-temperature ceramics, refractories, and structural ceramic composites for industrial and strategic applications.', 'Oxide ceramics, non-oxide ceramics, ceramic matrix composites, refractory castables, thermal barrier coatings', 'Dr. Arvind Kumar Sharma', 'S001', 12, 8, 'Active'),
    ('EEC', 'Energy & Environment', 'Development of materials and processes for clean energy, energy storage, and environmental remediation.', 'Solid oxide fuel cells, lithium-ion batteries, supercapacitors, photocatalysis, water treatment, CO2 capture', 'Dr. Priya Nair', 'S002', 10, 7, 'Active'),
    ('BMS', 'Biomaterials & Sensors', 'Biocompatible materials for implants, drug delivery systems, and chemical/biosensor development.', 'Hydroxyapatite scaffolds, biopolymer composites, electrochemical sensors, piezoelectric biosensors, drug delivery nanocarriers', 'Dr. Rajesh Verma', 'S003', 10, 6, 'Active'),
    ('NST', 'Nanomaterials & Surface Technology', 'Synthesis and characterization of nanomaterials, thin films, and surface engineering for functional applications.', 'Carbon nanotubes, graphene, quantum dots, plasma-sprayed coatings, PVD/CVD thin films, self-cleaning surfaces', 'Dr. Sunita Mishra', 'S004', 10, 7, 'Active'),
    ('CPS', 'Corrosion Protection & Surface Engineering', 'Corrosion mechanisms, protective coatings, and surface modification techniques for metals and alloys.', 'Hot-dip galvanizing, electroless nickel plating, epoxy-based coatings, cathodic protection, high-temperature oxidation', NULL, NULL, 8, 5, 'Active'),
    ('PMD', 'Polymer & Mineral Processing', 'Processing of industrial minerals, polymer composites, and fly-ash utilization for value-added products.', 'Fly ash beneficiation, polymer nanocomposites, rubber compounding, mineral grinding, geopolymer cements', NULL, NULL, 8, 5, 'Active');


-- ──────────────────────────────────────────────────────────────
-- 2. STAFF
-- ──────────────────────────────────────────────────────────────
-- IDs: S001-S012 (Scientific), T001-T004 (Technical), H001-H002 (Admin)
-- Levels: 7=Chief Scientist, 6=Principal/Senior, 5=Scientist, 4=Technical Officer, 3=Admin

INSERT INTO public.staff
    ("ID", "LabCode", "EmployeeType", "Name", "Designation", "Group", "Division", "DoAPP", "DOJ", "DOB", "Cat", "AppointmentType", "Level", "CoreArea", "Expertise", "Email", "Ext", "VidwanID", "ReportingID", "HighestQualification", "Gender")
VALUES
    -- Chief Scientists (Division Heads, Level 7)
    ('S001', 'AMPRI', 'Regular', 'Dr. Arvind Kumar Sharma', 'Chief Scientist', 'Scientific', 'ARC', '2020-04-01', '2002-07-15', '1968-03-22', 'GEN', 'Direct', '7', 'Advanced Ceramics', 'High-temperature ceramics, refractory composites, thermal barrier coatings, spark plasma sintering', 'ak.sharma@ampri.res.in', '201', 'VID-001', NULL, 'Ph.D. (Ceramic Engineering), BHU', 'Male'),
    ('S002', 'AMPRI', 'Regular', 'Dr. Priya Nair', 'Chief Scientist', 'Scientific', 'EEC', '2019-10-01', '2001-09-03', '1969-11-14', 'GEN', 'Direct', '7', 'Energy Materials', 'Solid oxide fuel cells, lithium-ion cathode materials, electrochemical energy storage, impedance spectroscopy', 'p.nair@ampri.res.in', '202', 'VID-002', NULL, 'Ph.D. (Materials Science), IISc Bangalore', 'Female'),
    ('S003', 'AMPRI', 'Regular', 'Dr. Rajesh Verma', 'Chief Scientist', 'Scientific', 'BMS', '2021-01-01', '2003-01-20', '1970-06-08', 'OBC', 'Direct', '7', 'Biomaterials', 'Hydroxyapatite coatings, bioactive glass, scaffolds for bone tissue engineering, electrochemical biosensors', 'r.verma@ampri.res.in', '203', 'VID-003', NULL, 'Ph.D. (Biomedical Engineering), IIT Bombay', 'Male'),
    ('S004', 'AMPRI', 'Regular', 'Dr. Sunita Mishra', 'Chief Scientist', 'Scientific', 'NST', '2020-07-01', '2000-11-10', '1967-09-30', 'GEN', 'Direct', '7', 'Nanomaterials', 'Carbon nanotubes, graphene synthesis, thin film deposition, plasma spray coatings, surface characterization', 's.mishra@ampri.res.in', '204', 'VID-004', NULL, 'Ph.D. (Physics), University of Delhi', 'Female'),

    -- Principal Scientists (Level 6)
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

    -- Administrative Staff (Level 3)
    ('H001', 'AMPRI', 'Regular', 'Shri Prakash Dubey', 'Section Officer', 'Admin', NULL, '2015-04-01', '2004-12-01', '1973-05-18', 'GEN', 'Direct', '3', 'Administration', 'Establishment matters, service records, recruitment coordination, RTI', 'p.dubey@ampri.res.in', '101', NULL, NULL, 'B.A. (Public Administration), Barkatullah University', 'Male'),
    ('H002', 'AMPRI', 'Regular', 'Smt. Meena Sharma', 'Assistant Section Officer', 'Admin', NULL, '2018-04-01', '2010-08-10', '1982-09-25', 'GEN', 'Direct', '3', 'Finance & Accounts', 'Budget preparation, expenditure monitoring, project accounts, audit compliance', 'm.sharma@ampri.res.in', '102', NULL, 'H001', 'M.Com (Accounting), Barkatullah University', 'Female');


-- ──────────────────────────────────────────────────────────────
-- 3. PROJECTS
-- ──────────────────────────────────────────────────────────────
-- ProjectNo format: OLP (In-House), EXP (Extramural), CNS (Consultancy)

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
    ('P010', 'EXP-2024-02', 'Flexible Electrochemical Biosensor Arrays for Point-of-Care Diagnostics', 'Extramural', 'Government', 'DST-SERB', 'Extramural', 'Active', '2024-09-01', '2027-08-31', '35.00', '5.20', 'Dr. Deepa Krishnamurthy', 'BMS', NULL, 'DST');


-- ──────────────────────────────────────────────────────────────
-- 4. PHD STUDENTS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.phd_students
    ("EnrollmentNo", "StudentName", "Specialization", "SupervisorName", "CoSupervisorName", "FellowshipDetails", "CurrentStatus", "ThesisTitle", "ProjectNo", "DivisionCode")
VALUES
    ('PHD-2021-001', 'Arun Kumar Meena', 'Ceramic Engineering', 'Dr. Arvind Kumar Sharma', 'Dr. Manoj Kumar Gupta', 'CSIR-JRF/SRF', 'Thesis Submitted', 'Spark Plasma Sintered Mullite-ZrO2 Composites: Microstructure and Thermo-Mechanical Properties', 'OLP-2023-01', 'ARC'),
    ('PHD-2022-001', 'Sneha Rajput', 'Materials Science', 'Dr. Priya Nair', NULL, 'CSIR-JRF/SRF', 'Ongoing', 'Layered Oxide Cathodes for High-Energy Sodium-Ion Batteries: Synthesis, Electrochemistry and Degradation Mechanisms', 'EXP-2022-01', 'EEC'),
    ('PHD-2022-002', 'Mohammed Irfan Khan', 'Biomedical Engineering', 'Dr. Rajesh Verma', 'Dr. Deepa Krishnamurthy', 'DBT-JRF', 'Ongoing', 'Biomimetic Hydroxyapatite-Collagen Scaffolds with Controlled Porosity for Bone Regeneration', 'EXP-2023-01', 'BMS'),
    ('PHD-2023-001', 'Pooja Yadav', 'Nanotechnology', 'Dr. Sunita Mishra', NULL, 'UGC-NET JRF', 'Ongoing', 'Graphene-Metal Oxide Nanocomposites for Supercapacitor and Sensor Applications', 'OLP-2024-01', 'NST'),
    ('PHD-2023-002', 'Vikas Sahu', 'Corrosion Science', 'Dr. Vikram Singh Rathore', 'Dr. Neha Saxena', 'CSIR-JRF/SRF', 'Ongoing', 'Green Corrosion Inhibitors Derived from Natural Products for Mild Steel in Acidic Media', 'EXP-2023-02', 'CPS'),
    ('PHD-2023-003', 'Divya Shukla', 'Polymer Science', 'Dr. Kavita Joshi', NULL, 'CSIR-JRF/SRF', 'Ongoing', 'Geopolymer-Polymer Hybrid Composites from Fly Ash: Processing, Characterization and Durability', 'OLP-2022-01', 'PMD'),
    ('PHD-2024-001', 'Ravi Shankar Tripathi', 'Chemical Engineering', 'Dr. Rahul Tiwari', NULL, 'GATE Fellowship', 'Course Work', 'Design and Optimization of Z-Scheme Photocatalytic Systems for Simultaneous H2 Generation and Pollutant Degradation', 'EXP-2024-01', 'EEC'),
    ('PHD-2024-002', 'Priyanka Lodhi', 'Electronics', 'Dr. Deepa Krishnamurthy', NULL, 'DST INSPIRE', 'Course Work', 'Wearable Electrochemical Biosensors for Real-Time Metabolite Monitoring', 'EXP-2024-02', 'BMS'),
    ('PHD-2020-001', 'Sandeep Malviya', 'Materials Science', 'Dr. Sunita Mishra', 'Dr. Amit Patel', 'CSIR-JRF/SRF', 'Thesis Submitted', 'Magnetron Sputtered TiAlN Coatings: Process-Structure-Property Correlations for Machining Applications', 'OLP-2024-01', 'NST');


-- ──────────────────────────────────────────────────────────────
-- 5. EQUIPMENT
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.equipment
    ("UInsID", "Name", "EndUse", "Division", "IndenterName", "OperatorName", "Location", "WorkingStatus", "Movable", "RequirementInstallation", "Justification", "Remark")
VALUES
    ('EQ-001', 'X-Ray Diffractometer (XRD) — Rigaku SmartLab', 'Phase identification, crystal structure analysis, lattice parameter determination', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 3, Room 101 — X-Ray Lab', 'Working', 'No', 'Chilled water supply, vibration-free floor, radiation shielding', 'Central characterization facility for all divisions', NULL),
    ('EQ-002', 'Scanning Electron Microscope (SEM) — ZEISS EVO 18', 'Microstructure imaging, elemental analysis (EDS), fracture surface examination', 'NST', 'Dr. Sunita Mishra', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 105 — Electron Microscopy Suite', 'Working', 'No', 'Electromagnetic shielding, compressed N2 supply, vibration isolation', 'Essential for nano and micro-scale imaging across all projects', NULL),
    ('EQ-003', 'Transmission Electron Microscope (TEM) — JEOL JEM-2100', 'Nanostructure characterization, SAED, lattice imaging', 'NST', 'Dr. Sunita Mishra', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 107 — TEM Lab', 'Working', 'No', 'Liquid nitrogen supply, vibration-free foundation, temperature control', 'High-resolution imaging for nanomaterials research', NULL),
    ('EQ-004', 'Thermogravimetric Analyzer (TGA) — TA Instruments Q500', 'Thermal decomposition, oxidation kinetics, compositional analysis', 'EEC', 'Dr. Priya Nair', 'Smt. Rekha Bhatt', 'Building 2, Room 204 — Thermal Analysis Lab', 'Working', 'No', 'Inert gas supply (N2, Ar), stable power', 'Supports energy, polymer and ceramic research', NULL),
    ('EQ-005', 'Differential Scanning Calorimeter (DSC) — Mettler Toledo DSC 3', 'Phase transitions, glass transition, melting point, heat capacity', 'EEC', 'Dr. Priya Nair', 'Smt. Rekha Bhatt', 'Building 2, Room 204 — Thermal Analysis Lab', 'Working', 'Yes', 'Liquid N2 for sub-ambient, dry N2 purge', 'Complements TGA for comprehensive thermal characterization', NULL),
    ('EQ-006', 'Atomic Force Microscope (AFM) — Bruker Dimension Icon', 'Surface topography, roughness measurement, nanomechanical mapping', 'NST', 'Dr. Amit Patel', 'Shri Dinesh Kumar Pandey', 'Building 3, Room 106 — SPM Lab', 'Working', 'No', 'Vibration isolation table, temperature-controlled room', 'Nanoscale surface characterization for coatings and thin films', NULL),
    ('EQ-007', 'Universal Testing Machine (UTM) — Instron 5982', 'Tensile, compressive, and flexural strength testing of materials', 'ARC', 'Dr. Manoj Kumar Gupta', 'Shri Ramesh Yadav', 'Building 1, Room 008 — Mechanical Testing Lab', 'Working', 'No', 'Hydraulic power supply, level floor', 'Supports all divisions for mechanical property evaluation', NULL),
    ('EQ-008', 'High-Temperature Box Furnace — Nabertherm LHT 04/18', 'Sintering ceramics, heat treatment, calcination up to 1800°C', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 1, Room 012 — Furnace Bay', 'Working', 'No', 'Three-phase power, ventilation hood', 'Core equipment for ceramic processing', NULL),
    ('EQ-009', 'Potentiostat/Galvanostat — Metrohm Autolab PGSTAT302N', 'Electrochemical characterization, corrosion testing, battery cycling', 'CPS', 'Dr. Vikram Singh Rathore', 'Shri Ajay Soni', 'Building 2, Room 210 — Electrochemistry Lab', 'Working', 'Yes', 'Faraday cage, stable power supply', 'Shared between CPS (corrosion) and EEC (energy storage) divisions', NULL),
    ('EQ-010', 'Spark Plasma Sintering System — FCT Systeme HP D 25', 'Rapid densification of ceramics, composites, and nanomaterials', 'ARC', 'Dr. Arvind Kumar Sharma', 'Shri Ramesh Yadav', 'Building 1, Room 015 — SPS Lab', 'Working', 'No', 'Chilled water, high-current power supply, vacuum pump', 'Advanced sintering technique enabling novel ceramic composites', NULL),
    ('EQ-011', 'Planetary Ball Mill — Fritsch Pulverisette 5', 'Mechanical alloying, powder mixing, nanoparticle synthesis', 'PMD', 'Dr. Kavita Joshi', 'Shri Ramesh Yadav', 'Building 1, Room 010 — Powder Processing Lab', 'Working', 'Yes', 'Standard power, ventilation', 'Used for mineral processing and composite powder preparation', NULL),
    ('EQ-012', 'UV-Vis-NIR Spectrophotometer — Shimadzu UV-3600 Plus', 'Optical absorption, band gap determination, diffuse reflectance', 'EEC', 'Dr. Rahul Tiwari', 'Smt. Rekha Bhatt', 'Building 2, Room 206 — Optical Lab', 'Under Maintenance', 'Yes', 'Dark room, stable temperature', 'Detector replacement scheduled — expected back online May 2026', 'Detector module sent to Shimadzu service center for repair');


-- ──────────────────────────────────────────────────────────────
-- 6. PROJECT STAFF
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
    ('PS-007', 'Ankita Dwivedi', 'Senior Research Fellow (SRF)', '2021-I', '2021-06-01', '2021-06-01 to 2025-05-31', 'OLP-2023-01', 'Dr. Arvind Kumar Sharma', 'ARC');


-- ──────────────────────────────────────────────────────────────
-- 7. CONTRACT STAFF
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.contract_staff
    ("id", "Name", "Designation", "Division", "DateOfJoining", "ContractEndDate", "LabCode", "DateOfBirth", "AttachedToStaffID")
VALUES
    ('CS-001', 'Rajendra Vishwakarma', 'Lab Assistant', 'ARC', '2022-04-01', '2026-03-31', 'AMPRI', '1990-07-15', 'T001'),
    ('CS-002', 'Suneel Ahirwar', 'Lab Attendant', 'NST', '2023-01-15', '2026-01-14', 'AMPRI', '1993-11-20', 'T002'),
    ('CS-003', 'Mamta Kushwaha', 'Lab Assistant', 'EEC', '2023-07-01', '2026-06-30', 'AMPRI', '1995-03-08', 'T003'),
    ('CS-004', 'Govind Prasad Saket', 'MTS (Multi-Tasking Staff)', 'BMS', '2024-01-01', '2026-12-31', 'AMPRI', '1991-09-12', 'T004');


-- ──────────────────────────────────────────────────────────────
-- 8. SCIENTIFIC OUTPUTS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.scientific_outputs
    (id, title, authors, journal, year, doi, impact_factor, citation_count, division_code)
VALUES
    ('SO-001', 'Spark plasma sintered mullite-SiC composites: Effect of SiC content on microstructure and thermo-mechanical properties', ARRAY['A.K. Sharma', 'M.K. Gupta', 'A.K. Meena'], 'Journal of the European Ceramic Society', 2024, '10.1016/j.jeurceramsoc.2024.01.045', 6.4, 12, 'ARC'),
    ('SO-002', 'Layered P2-type Na0.67MnO2 cathodes with Al substitution for enhanced sodium-ion battery performance', ARRAY['P. Nair', 'S. Rajput', 'A. Deshmukh'], 'Journal of Power Sources', 2024, '10.1016/j.jpowsour.2024.03.112', 9.2, 8, 'EEC'),
    ('SO-003', 'Electrospun hydroxyapatite-PCL nanofiber scaffolds: In vitro biocompatibility and osteogenic differentiation', ARRAY['R. Verma', 'M.I. Khan', 'D. Krishnamurthy'], 'Biomaterials Science', 2024, '10.1039/D4BM00456A', 7.6, 15, 'BMS'),
    ('SO-004', 'CVD-grown graphene on copper foils: Role of hydrogen partial pressure on domain size and defect density', ARRAY['S. Mishra', 'P. Yadav', 'A. Patel'], 'Carbon', 2023, '10.1016/j.carbon.2023.08.034', 10.9, 22, 'NST'),
    ('SO-005', 'Imidazoline-based corrosion inhibitors for mild steel in 1M HCl: Experimental and DFT investigation', ARRAY['V.S. Rathore', 'V. Sahu', 'N. Saxena'], 'Corrosion Science', 2024, '10.1016/j.corsci.2024.05.018', 7.4, 6, 'CPS'),
    ('SO-006', 'Mechanical and water absorption behaviour of fly ash-filled jute/epoxy hybrid composites', ARRAY['K. Joshi', 'D. Shukla'], 'Composites Part B: Engineering', 2023, '10.1016/j.compositesb.2023.11.002', 13.1, 18, 'PMD'),
    ('SO-007', 'Z-scheme TiO2/g-C3N4 heterojunctions for visible-light-driven photocatalytic degradation of tetracycline', ARRAY['R. Tiwari', 'P. Nair', 'R.S. Tripathi'], 'Applied Catalysis B: Environmental', 2025, '10.1016/j.apcatb.2025.01.078', 22.1, 3, 'EEC'),
    ('SO-008', 'Molecularly imprinted polymer-based electrochemical sensor for selective detection of creatinine', ARRAY['D. Krishnamurthy', 'R. Verma', 'P. Lodhi'], 'Sensors and Actuators B: Chemical', 2025, '10.1016/j.snb.2025.02.034', 8.4, 1, 'BMS'),
    ('SO-009', 'Effect of rare-earth oxide additions on densification and thermal shock resistance of alumina refractories', ARRAY['M.K. Gupta', 'A.K. Sharma'], 'Ceramics International', 2023, '10.1016/j.ceramint.2023.06.190', 5.5, 14, 'ARC'),
    ('SO-010', 'TiAlN/CrN multilayer coatings by reactive magnetron sputtering: Tribological and high-temperature oxidation behaviour', ARRAY['A. Patel', 'S. Mishra', 'S. Malviya'], 'Surface and Coatings Technology', 2024, '10.1016/j.surfcoat.2024.07.011', 5.9, 9, 'NST');


-- ──────────────────────────────────────────────────────────────
-- 9. IP INTELLIGENCE
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.ip_intelligence
    (id, title, type, status, filing_date, grant_date, inventors, division_code)
VALUES
    ('IP-001', 'Process for manufacturing dense mullite-SiC composite refractory bodies by spark plasma sintering', 'Patent', 'Granted', '2021-08-15', '2024-02-20', ARRAY['A.K. Sharma', 'M.K. Gupta'], 'ARC'),
    ('IP-002', 'An improved electrochemical biosensor for rapid detection of creatinine in biological fluids', 'Patent', 'Published', '2023-11-10', NULL, ARRAY['D. Krishnamurthy', 'R. Verma'], 'BMS'),
    ('IP-003', 'Eco-friendly corrosion inhibitor formulation derived from Azadirachta indica extract for mild steel protection', 'Patent', 'Filed', '2024-06-22', NULL, ARRAY['V.S. Rathore', 'N. Saxena', 'V. Sahu'], 'CPS'),
    ('IP-004', 'Method for synthesis of phase-pure geopolymer binder from Class F fly ash with ambient curing', 'Patent', 'Granted', '2020-03-05', '2023-09-18', ARRAY['K. Joshi'], 'PMD'),
    ('IP-005', 'Visible-light-active Z-scheme photocatalytic membrane for degradation of organic pollutants in water', 'Patent', 'Filed', '2025-01-30', NULL, ARRAY['R. Tiwari', 'P. Nair'], 'EEC');


-- ──────────────────────────────────────────────────────────────
-- 10. APPRAISAL CYCLES (PMS)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.appraisal_cycles
    (id, name, start_date, end_date, status)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'FY 2025-26', '2025-04-01', '2026-03-31', 'OPEN');


-- ──────────────────────────────────────────────────────────────
-- 11. LABS
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.labs (id, lab_code, lab_name, div_code)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'LAB-ARC-01', 'X-Ray & Thermal Analysis Lab',      'ARC'),
  ('11111111-1111-1111-1111-000000000002', 'LAB-NST-01', 'Electron Microscopy Suite',          'NST'),
  ('11111111-1111-1111-1111-000000000003', 'LAB-EEC-01', 'Electrochemistry & Optical Lab',     'EEC'),
  ('11111111-1111-1111-1111-000000000004', 'LAB-BMS-01', 'Biomaterials & Sensors Lab',         'BMS'),
  ('11111111-1111-1111-1111-000000000005', 'LAB-CPS-01', 'Corrosion Testing Lab',              'CPS'),
  ('11111111-1111-1111-1111-000000000006', 'LAB-PMD-01', 'Powder Processing & Polymer Lab',    'PMD')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- DEMO SEED (generated by scripts/generate-seed.ts)
-- Generated on first run; review then commit. Do not hand-edit.
-- ============================================================

-- committees
INSERT INTO public.committees
    (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date, created_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'Research Advisory Committee', 'Standing', 'Advise on research direction, review project proposals, and evaluate annual research output across all divisions.', 'S001', 'S002', 'Active', '2024-04-01', '2024-04-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'Equipment Procurement Review', 'AdHoc', 'Evaluate major equipment purchase proposals (>10 lakhs), assess technical specifications, and recommend vendor selection.', 'S040', 'T004', 'Active', '2025-08-15', '2025-08-15T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'PhD Progress Review Committee', 'Review', 'Review PhD student progress biannually, evaluate thesis submissions, and recommend synopsis approvals.', 'S025', 'S026', 'Active', '2023-01-10', '2023-01-10T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'Industry Collaboration Advisory Board', 'Advisory', 'Identify industry partnership opportunities, review MoUs, and guide technology transfer initiatives.', 'S012', 'S014', 'Active', '2025-01-01', '2025-01-01T00:00:00Z'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'Infrastructure & Safety Committee', 'Standing', 'Oversee lab infrastructure maintenance, safety compliance audits, and building facility upgrades.', 'S037', 'T002', 'Active', '2023-06-01', '2023-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- committee_members
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


-- meetings
INSERT INTO public.meetings
    (id, committee_id, meeting_date, venue, title, summary, status, created_at)
VALUES
    ('cccccccc-cccc-cccc-cccc-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-04-10', 'CSIR-AMPRI Conference Hall', 'Q1 Research Review Meeting', 'Reviewed 8 project proposals. Approved 5 for funding in FY 2026-27.', 'Completed', '2026-03-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-05-07', 'Virtual — MS Teams', 'Mid-Year Research Assessment', '', 'Scheduled', '2026-04-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '2026-06-15', 'CSIR-AMPRI Auditorium', 'Annual Research Output Evaluation', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-04-05', 'Admin Board Room', 'XRD Replacement Procurement', 'Finalized specs for Rigaku SmartLab XRD. Recommended sole-source procurement due to compatibility.', 'Completed', '2026-03-20T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-05-10', 'Admin Board Room', 'SEM-EDS Upgrade Evaluation', '', 'Scheduled', '2026-04-25T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '2026-06-20', 'Admin Board Room', 'Q2 Equipment Budget Allocation', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-03-20', 'Seminar Hall', 'PhD Synopsis Review — Spring 2026', 'Reviewed 3 synopses. Approved all with minor revisions. Student presentations assessed by panel.', 'Completed', '2026-03-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-05-15', 'Seminar Hall', 'PhD Progress Presentations', '', 'Scheduled', '2026-04-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '2026-07-01', 'Seminar Hall', 'Thesis Defense Evaluations', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-02-15', 'CSIR-AMPRI Guest House', 'Industry MoU Review — Q4 FY2025', 'Reviewed 3 MoUs with NTPC, Tata Steel, and DRDO. Recommended signing all three.', 'Completed', '2026-02-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-05-20', 'CSIR-AMPRI Guest House', 'Technology Transfer Pipeline Review', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '2026-06-10', 'Virtual — Google Meet', 'New Partner Identification Workshop', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-03-01', 'Admin Board Room', 'Annual Safety Audit Review', 'Reviewed 12 non-conformances from 2025 audit. 10 resolved, 2 pending — assigned action items.', 'Completed', '2026-02-15T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-05-25', 'Admin Board Room', 'Lab Infrastructure Upgrade Planning', '', 'Scheduled', '2026-05-01T00:00:00Z'),
    ('cccccccc-cccc-cccc-cccc-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '2026-07-15', 'Admin Board Room', 'Fire Safety Drill & Equipment Audit', '', 'Scheduled', '2026-06-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- agenda_items
INSERT INTO public.agenda_items
    (id, meeting_id, sequence, description, proposed_by, status)
VALUES
    ('dddddddd-dddd-dddd-dddd-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 1, 'Review of Q4 FY2025 research output', 'S001', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 2, 'New project proposal: Nano-refractories for steel industry', 'S002', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000003', 'cccccccc-cccc-cccc-cccc-000000000001', 3, 'Budget allocation for FY 2026-27 research programs', 'S012', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000004', 'cccccccc-cccc-cccc-cccc-000000000001', 4, 'Any other business — patent filing status update', 'S045', 'Deferred'),
    ('dddddddd-dddd-dddd-dddd-000000000005', 'cccccccc-cccc-cccc-cccc-000000000002', 1, 'Mid-year project status reports from all divisions', 'S001', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000006', 'cccccccc-cccc-cccc-cccc-000000000002', 2, 'PhD candidate recruitment plan 2027', 'S014', 'Pending'),
    ('dddddddd-dddd-dddd-dddd-000000000007', 'cccccccc-cccc-cccc-cccc-000000000004', 1, 'Technical specification review for new XRD system', 'S040', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000008', 'cccccccc-cccc-cccc-cccc-000000000004', 2, 'Vendor comparison: Rigaku vs. Bruker vs. PANalytical', 'T004', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000009', 'cccccccc-cccc-cccc-cccc-000000000007', 1, 'Synopsis review: Arjun Nair (Refractory Ceramics)', 'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000010', 'cccccccc-cccc-cccc-cccc-000000000007', 2, 'Synopsis review: Divya Kapoor (Energy Materials)', 'S025', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000011', 'cccccccc-cccc-cccc-cccc-000000000013', 1, 'Non-conformance closure status review', 'S037', 'Discussed'),
    ('dddddddd-dddd-dddd-dddd-000000000012', 'cccccccc-cccc-cccc-cccc-000000000013', 2, 'Emergency shower and eyewash station inspection report', 'T003', 'Discussed')
ON CONFLICT (id) DO NOTHING;


-- action_items
INSERT INTO public.action_items
    (id, meeting_id, source, task, assigned_to, deadline, status, completed_at, notes)
VALUES
    ('eeeeeeee-eeee-eeee-eeee-000000000001', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Submit revised budget proposal for Nano-refractory project', 'S002', '2026-05-20', 'Pending', NULL, 'Include consumables cost escalation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000002', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Distribute Q1 review minutes to all division heads', 'H001', '2026-05-01', 'Pending', NULL, ''),
    ('eeeeeeee-eeee-eeee-eeee-000000000003', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Obtain three vendor quotations for XRD procurement', 'T004', '2026-05-30', 'Pending', NULL, 'Rigaku quote already received'),
    ('eeeeeeee-eeee-eeee-eeee-000000000004', NULL, 'manual', 'Prepare annual equipment calibration schedule for all labs', 'T001', '2026-06-15', 'Pending', NULL, 'Coordinate with division heads for access windows'),
    ('eeeeeeee-eeee-eeee-eeee-000000000005', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Replace faulty fire extinguishers in Labs A, C, and D', 'T002', '2026-05-15', 'Pending', NULL, '2 CO2 and 1 Dry Powder type needed'),
    ('eeeeeeee-eeee-eeee-eeee-000000000006', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Compile patent filing tracker for FY 2025-26', 'S045', '2026-05-10', 'InProgress', NULL, 'Awaiting legal department confirmation on 2 filings'),
    ('eeeeeeee-eeee-eeee-eeee-000000000007', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Schedule thesis defense for Arjun Nair', 'S026', '2026-05-25', 'InProgress', NULL, 'Waiting for external examiner confirmation'),
    ('eeeeeeee-eeee-eeee-eeee-000000000008', NULL, 'manual', 'Update chemical inventory database for all labs', 'T003', '2026-06-01', 'InProgress', NULL, 'BMS and NST labs completed, ARC pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000009', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Install additional fume hoods in Lab-C', 'S037', '2026-07-01', 'InProgress', NULL, 'Civil work in progress, electrical connection pending'),
    ('eeeeeeee-eeee-eeee-eeee-000000000010', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Draft MoU template for industry-sponsored PhD programs', 'S012', '2026-05-30', 'InProgress', NULL, 'Legal review awaited'),
    ('eeeeeeee-eeee-eeee-eeee-000000000011', 'cccccccc-cccc-cccc-cccc-000000000001', 'meeting', 'Archive closed projects documentation for CSIR audit', 'H001', '2026-04-15', 'Completed', '2026-04-10T00:00:00Z', 'All 5 closed projects documented'),
    ('eeeeeeee-eeee-eeee-eeee-000000000012', 'cccccccc-cccc-cccc-cccc-000000000004', 'meeting', 'Decommission non-operational HT furnace (E006)', 'T001', '2026-04-30', 'Completed', '2026-04-28T00:00:00Z', 'Repair order placed, furnace isolated'),
    ('eeeeeeee-eeee-eeee-eeee-000000000013', 'cccccccc-cccc-cccc-cccc-000000000007', 'meeting', 'Update PhD student handbook with new submission guidelines', 'S026', '2026-03-31', 'Completed', '2026-03-28T00:00:00Z', 'PDF shared with all supervisors'),
    ('eeeeeeee-eeee-eeee-eeee-000000000014', 'cccccccc-cccc-cccc-cccc-000000000010', 'meeting', 'Send signed MoUs to CSIR-HQ for ratification', 'H001', '2026-03-01', 'Completed', '2026-02-28T00:00:00Z', 'All 3 MoUs acknowledged by HQ'),
    ('eeeeeeee-eeee-eeee-eeee-000000000015', 'cccccccc-cccc-cccc-cccc-000000000013', 'meeting', 'Complete electrical safety audit for all buildings', 'T002', '2026-03-15', 'Completed', '2026-03-12T00:00:00Z', 'Minor issues noted in Building D, reported to maintenance')
ON CONFLICT (id) DO NOTHING;


-- meeting_documents
INSERT INTO public.meeting_documents
    (id, meeting_id, file_name, storage_path, uploaded_at)
VALUES
    ('doc-01', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Meeting_Agenda.pdf', 'committee-docs/mtg-01/agenda.pdf', '2026-03-15T00:00:00Z'),
    ('doc-02', 'cccccccc-cccc-cccc-cccc-000000000001', 'Q1_Research_Review_Minutes.pdf', 'committee-docs/mtg-01/minutes.pdf', '2026-04-12T00:00:00Z'),
    ('doc-03', 'cccccccc-cccc-cccc-cccc-000000000004', 'XRD_Technical_Specs.pdf', 'committee-docs/mtg-04/specs.pdf', '2026-03-20T00:00:00Z'),
    ('doc-04', 'cccccccc-cccc-cccc-cccc-000000000007', 'PhD_Synopsis_Review_Minutes.pdf', 'committee-docs/mtg-07/minutes.pdf', '2026-03-25T00:00:00Z'),
    ('doc-05', 'cccccccc-cccc-cccc-cccc-000000000013', 'Safety_Audit_Report_2025.pdf', 'committee-docs/mtg-13/audit.pdf', '2026-02-15T00:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- tickets
INSERT INTO public.tickets
    (id, token, subject, category, urgency, description, submitted_by, assigned_to, status, created_at, updated_at, resolved_at)
VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-000000000001', 'AMPRI-260501-001', 'AC not working in Lab-A103', 'Infrastructure', 'High', 'The air conditioning unit in Lab-A103 has stopped cooling. Ambient temperature is affecting XRD instrument calibration.', 'T001', 'S001', 'InProgress', '2026-05-01T09:00:00Z', '2026-05-02T14:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000002', 'AMPRI-260502-001', 'Water leakage in Building D corridor', 'Infrastructure', 'Medium', 'Water seepage observed near the SEM lab entrance during rain. Needs immediate inspection to prevent equipment damage.', 'T002', 'S001', 'Open', '2026-05-02T11:00:00Z', '2026-05-02T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000003', 'AMPRI-260503-001', 'Generator backup test overdue', 'Infrastructure', 'Low', 'Quarterly generator backup test for Building A was scheduled in April but not conducted. Request rescheduling.', 'H001', 'S037', 'Open', '2026-05-03T08:00:00Z', '2026-05-03T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000004', 'AMPRI-260430-001', 'TGA-001 calibration error', 'EquipmentIT', 'High', 'Thermogravimetric Analyzer showing drift in baseline readings. Calibration failed 3 consecutive attempts. Research work halted.', 'T003', 'S012', 'InProgress', '2026-04-30T15:00:00Z', '2026-05-01T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000005', 'AMPRI-260504-001', 'Network printer not accessible from Lab-B', 'EquipmentIT', 'Medium', 'The shared network printer (HP LaserJet M507) is offline for all users in Lab-B wing. Reboot did not resolve.', 'S013', 'S012', 'Open', '2026-05-04T09:30:00Z', '2026-05-04T09:30:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000006', 'AMPRI-260415-001', 'UPS battery replacement for Lab-A servers', 'EquipmentIT', 'Critical', 'UPS batteries in server room showing end-of-life warning. Risk of data loss during power fluctuations. Needs urgent replacement.', 'S002', 'S037', 'Resolved', '2026-04-15T10:00:00Z', '2026-04-28T16:00:00Z', '2026-04-28T16:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000007', 'AMPRI-260501-002', 'Request for visitor gate pass system update', 'Administrative', 'Low', 'Current visitor gate pass system does not capture visitor purpose correctly. Request adding a remarks field to the digital form.', 'H001', 'H001', 'Open', '2026-05-01T07:00:00Z', '2026-05-01T07:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000008', 'AMPRI-260420-001', 'Stationery requisition for Q2', 'Administrative', 'Low', 'Quarterly stationery requisition for all 6 divisions. Attached the consolidated list. Approval needed by May 15.', 'H001', 'H001', 'Closed', '2026-04-20T10:00:00Z', '2026-05-05T12:00:00Z', '2026-05-02T12:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000009', 'AMPRI-260505-001', 'Leave encashment policy clarification', 'HRGrievance', 'Medium', 'Need clarification on leave encashment rules for project staff whose contracts were extended. Different interpretations from Finance and HR.', 'S003', 'H001', 'Open', '2026-05-05T12:00:00Z', '2026-05-05T12:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000010', 'AMPRI-260410-001', 'Increment not reflected in March salary', 'HRGrievance', 'High', 'My annual increment effective January 2026 was not reflected in the March 2026 salary slip. Request correction and arrears.', 'T004', 'H001', 'Resolved', '2026-04-10T14:00:00Z', '2026-04-20T09:00:00Z', '2026-04-20T09:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000011', 'AMPRI-260506-001', 'Travel advance settlement for DRDO meeting', 'Finance', 'Medium', 'Need to settle travel advance of Rs. 25,000 taken for DRDO project review meeting in Delhi on April 20-22. Bills attached.', 'S040', 'H002', 'InProgress', '2026-05-06T11:00:00Z', '2026-05-07T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000012', 'AMPRI-260425-001', 'Equipment AMC payment renewal — SEM', 'Finance', 'Critical', 'AMC for Scanning Electron Microscope (E002, Zeiss) expired. Invoice received for renewal. Payment must be processed before May 15 to avoid service gap.', 'T002', 'H002', 'InProgress', '2026-04-25T09:00:00Z', '2026-05-03T16:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000013', 'AMPRI-260330-001', 'Project fund utilization certificate for OLP-2023-01', 'Finance', 'Medium', 'Utilization certificate for project OLP-2023-01 for FY 2025-26 needs CSIR-HQ submission by April 30. Funds utilized: Rs. 21,00,000.', 'S001', 'H002', 'Closed', '2026-03-30T08:00:00Z', '2026-04-25T10:00:00Z', '2026-04-15T10:00:00Z'),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000014', 'AMPRI-260507-001', 'Need argon gas cylinder for glovebox', 'LabResearch', 'High', 'Argon gas cylinder for glovebox in Lab-NST is empty. Thin film deposition work is blocked. Two cylinders needed — one for use, one as backup.', 'T002', 'S037', 'Open', '2026-05-07T08:00:00Z', '2026-05-07T08:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000015', 'AMPRI-260503-002', 'Chemical waste disposal — corrosion testing lab', 'LabResearch', 'Medium', 'Corrosion testing lab (E102) has accumulated ~15L of chemical waste from salt spray tests. Needs authorized disposal as per CSIR safety guidelines.', 'T004', 'S040', 'InProgress', '2026-05-03T14:00:00Z', '2026-05-05T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000016', 'AMPRI-260418-001', 'Request for deionized water plant maintenance', 'LabResearch', 'Low', 'DI water plant in Lab-B showing reduced output. RO membrane may need replacement. Last serviced December 2025.', 'S026', 'S037', 'Open', '2026-04-18T09:00:00Z', '2026-04-18T09:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000017', 'AMPRI-260502-002', 'Journal access expired — Acta Materialia', 'Library', 'High', 'Access to Acta Materialia journal through CSIR-NISTADS consortium appears to have expired. Multiple researchers unable to access recent articles.', 'S002', 'S001', 'InProgress', '2026-05-02T13:00:00Z', '2026-05-03T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000018', 'AMPRI-260506-002', 'Request to add books to library catalog', 'Library', 'Low', 'Please add the following 5 books to the CSIR-AMPRI library catalog: (list attached). Recommended by PhD supervisors for student reference.', 'S025', 'S001', 'Open', '2026-05-06T10:00:00Z', '2026-05-06T10:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000019', 'AMPRI-260504-002', 'Vehicle booking for field visit to Mandideep', 'Transport', 'Medium', 'Request official vehicle for field visit to industrial cluster in Mandideep on May 12. 4 staff members, full day trip.', 'S014', 'S012', 'Open', '2026-05-04T11:00:00Z', '2026-05-04T11:00:00Z', NULL),
    ('aaaa1111-aaaa-aaaa-aaaa-000000000020', 'AMPRI-260408-001', 'Vehicle logbook discrepancy — April 2026', 'Transport', 'Low', 'Vehicle No. MP04-CA-1234 logbook shows 150km more than odometer reading for April. Request audit of fuel receipts.', 'H002', 'S012', 'Resolved', '2026-04-08T10:00:00Z', '2026-04-18T15:00:00Z', '2026-04-18T15:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ticket_responses
INSERT INTO public.ticket_responses
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
ON CONFLICT (id) DO NOTHING;


-- ticket_events
INSERT INTO public.ticket_events
    (id, ticket_id, event_type, actor_id, details, created_at)
VALUES
    ('cccc3333-cccc-cccc-cccc-000000000001', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Created', 'T001', '{"token":"AMPRI-260501-001","category":"Infrastructure"}'::jsonb, '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000002', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'Assigned', 'system', '{"assigned_to":"S001"}'::jsonb, '2026-05-01T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000003', 'aaaa1111-aaaa-aaaa-aaaa-000000000001', 'StatusChanged', 'S001', '{"from":"Open","to":"InProgress"}'::jsonb, '2026-05-02T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000004', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Created', 'S002', '{"token":"AMPRI-260415-001","category":"EquipmentIT"}'::jsonb, '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000005', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Assigned', 'system', '{"assigned_to":"S037"}'::jsonb, '2026-04-15T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000006', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'StatusChanged', 'S037', '{"from":"Open","to":"InProgress"}'::jsonb, '2026-04-16T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000007', 'aaaa1111-aaaa-aaaa-aaaa-000000000006', 'Resolved', 'S037', '{"from":"InProgress","to":"Resolved"}'::jsonb, '2026-04-28T16:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000008', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Created', 'T004', '{"token":"AMPRI-260410-001","category":"HRGrievance"}'::jsonb, '2026-04-10T14:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000009', 'aaaa1111-aaaa-aaaa-aaaa-000000000010', 'Resolved', 'H001', '{"from":"Open","to":"Resolved"}'::jsonb, '2026-04-20T09:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000010', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Created', 'S001', '{"token":"AMPRI-260330-001","category":"Finance"}'::jsonb, '2026-03-30T08:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000011', 'aaaa1111-aaaa-aaaa-aaaa-000000000013', 'Closed', 'S001', '{"from":"Resolved","to":"Closed"}'::jsonb, '2026-04-25T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000012', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Created', 'H002', '{"token":"AMPRI-260408-001","category":"Transport"}'::jsonb, '2026-04-08T10:00:00Z'),
    ('cccc3333-cccc-cccc-cccc-000000000013', 'aaaa1111-aaaa-aaaa-aaaa-000000000020', 'Resolved', 'S012', '{"from":"Open","to":"Resolved"}'::jsonb, '2026-04-18T15:00:00Z')
ON CONFLICT (id) DO NOTHING;



-- =============================================================
-- END OF SEED DATA
-- =============================================================
-- Next steps:
--   1. Create auth users via Supabase Dashboard (Authentication > Users > Add User)
--      for each staff member who needs login access.
--   2. The on_auth_user_created trigger will auto-create user_roles (DefaultUser)
--      and user_profiles entries.
--   3. Manually assign roles via SQL or the MasterAdmin UI:
--      INSERT INTO user_roles (user_id, role, division_code)
--      VALUES ('<uuid>', 'Scientist', 'ARC');
--   4. Set active_role in user_profiles:
--      UPDATE user_profiles SET active_role = 'Scientist' WHERE user_id = '<uuid>';
-- =============================================================
