-- =============================================================
-- MOCK: divisions
-- =============================================================
-- Six research divisions of CSIR-AMPRI Bhopal. Reference data —
-- safe to insert before staff/projects (FKs from those tables
-- point at divCode here).
-- =============================================================

INSERT INTO public.divisions
    ("divCode", "divName", "divDescription", "divResearchAreas", "divHoD", "divHoDID", "divSanctionedstrength", "divCurrentStrength", "divStatus")
VALUES
    ('ARC', 'Advanced Refractory Ceramics', 'Research on high-temperature ceramics, refractories, and structural ceramic composites for industrial and strategic applications.', 'Oxide ceramics, non-oxide ceramics, ceramic matrix composites, refractory castables, thermal barrier coatings', 'Dr. Arvind Kumar Sharma', 'S001', 12, 8, 'Active'),
    ('EEC', 'Energy & Environment', 'Development of materials and processes for clean energy, energy storage, and environmental remediation.', 'Solid oxide fuel cells, lithium-ion batteries, supercapacitors, photocatalysis, water treatment, CO2 capture', 'Dr. Priya Nair', 'S002', 10, 7, 'Active'),
    ('BMS', 'Biomaterials & Sensors', 'Biocompatible materials for implants, drug delivery systems, and chemical/biosensor development.', 'Hydroxyapatite scaffolds, biopolymer composites, electrochemical sensors, piezoelectric biosensors, drug delivery nanocarriers', 'Dr. Rajesh Verma', 'S003', 10, 6, 'Active'),
    ('NST', 'Nanomaterials & Surface Technology', 'Synthesis and characterization of nanomaterials, thin films, and surface engineering for functional applications.', 'Carbon nanotubes, graphene, quantum dots, plasma-sprayed coatings, PVD/CVD thin films, self-cleaning surfaces', 'Dr. Sunita Mishra', 'S004', 10, 7, 'Active'),
    ('CPS', 'Corrosion Protection & Surface Engineering', 'Corrosion mechanisms, protective coatings, and surface modification techniques for metals and alloys.', 'Hot-dip galvanizing, electroless nickel plating, epoxy-based coatings, cathodic protection, high-temperature oxidation', NULL, NULL, 8, 5, 'Active'),
    ('PMD', 'Polymer & Mineral Processing', 'Processing of industrial minerals, polymer composites, and fly-ash utilization for value-added products.', 'Fly ash beneficiation, polymer nanocomposites, rubber compounding, mineral grinding, geopolymer cements', NULL, NULL, 8, 5, 'Active')
ON CONFLICT ("divCode") DO NOTHING;
