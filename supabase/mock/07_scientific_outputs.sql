-- =============================================================
-- MOCK: scientific_outputs (publications)
-- =============================================================
-- 10 papers across divisions. authors stored as text[] (Postgres
-- array). impact_factor is the JCR IF at time of publication.
-- citation_count is a snapshot — refresh via IRINS sync.
-- =============================================================

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
    ('SO-010', 'TiAlN/CrN multilayer coatings by reactive magnetron sputtering: Tribological and high-temperature oxidation behaviour', ARRAY['A. Patel', 'S. Mishra', 'S. Malviya'], 'Surface and Coatings Technology', 2024, '10.1016/j.surfcoat.2024.07.011', 5.9, 9, 'NST')
ON CONFLICT (id) DO NOTHING;
