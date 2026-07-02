-- =============================================================
-- MOCK: phd_students
-- =============================================================
-- Depends on: projects (ProjectNo), divisions (DivisionCode),
--             staff (SupervisorName by name match).
-- =============================================================

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
    ('PHD-2020-001', 'Sandeep Malviya', 'Materials Science', 'Dr. Sunita Mishra', 'Dr. Amit Patel', 'CSIR-JRF/SRF', 'Thesis Submitted', 'Magnetron Sputtered TiAlN Coatings: Process-Structure-Property Correlations for Machining Applications', 'OLP-2024-01', 'NST')
ON CONFLICT ("EnrollmentNo") DO NOTHING;
