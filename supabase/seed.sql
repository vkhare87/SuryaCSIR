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
