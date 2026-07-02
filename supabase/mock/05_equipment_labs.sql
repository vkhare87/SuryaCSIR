-- =============================================================
-- MOCK: equipment + labs
-- =============================================================
-- Two tables seeded together — labs first, then equipment so any
-- lab_id FK on equipment rows resolves cleanly.
--
-- labs introduced in migration 20260502000000_instruments_extension.sql.
-- equipment has 9 extra columns (instrument_code, serial_number,
-- lab_id, owner_user_id, etc.) from the same migration — left
-- NULL here since this fixture predates lab assignment.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- labs (6 rows — one per division)
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.labs (id, lab_code, lab_name, div_code) VALUES
    ('11111111-1111-1111-1111-000000000001', 'LAB-ARC-01', 'X-Ray & Thermal Analysis Lab',   'ARC'),
    ('11111111-1111-1111-1111-000000000002', 'LAB-NST-01', 'Electron Microscopy Suite',      'NST'),
    ('11111111-1111-1111-1111-000000000003', 'LAB-EEC-01', 'Electrochemistry & Optical Lab', 'EEC'),
    ('11111111-1111-1111-1111-000000000004', 'LAB-BMS-01', 'Biomaterials & Sensors Lab',     'BMS'),
    ('11111111-1111-1111-1111-000000000005', 'LAB-CPS-01', 'Corrosion Testing Lab',          'CPS'),
    ('11111111-1111-1111-1111-000000000006', 'LAB-PMD-01', 'Powder Processing & Polymer Lab','PMD')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- equipment (12 rows — major instruments only)
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
    ('EQ-012', 'UV-Vis-NIR Spectrophotometer — Shimadzu UV-3600 Plus', 'Optical absorption, band gap determination, diffuse reflectance', 'EEC', 'Dr. Rahul Tiwari', 'Smt. Rekha Bhatt', 'Building 2, Room 206 — Optical Lab', 'Under Maintenance', 'Yes', 'Dark room, stable temperature', 'Detector replacement scheduled — expected back online May 2026', 'Detector module sent to Shimadzu service center for repair')
ON CONFLICT ("UInsID") DO NOTHING;
