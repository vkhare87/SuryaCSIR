-- =============================================================
-- MOCK: ip_intelligence (patents / IP filings)
-- =============================================================
-- type CHECK: Patent | Copyright | Design | Trademark
-- status CHECK: Filed | Published | Granted
-- grant_date is NULL until status = 'Granted'.
-- =============================================================

INSERT INTO public.ip_intelligence
    (id, title, type, status, filing_date, grant_date, inventors, division_code)
VALUES
    ('IP-001', 'Process for manufacturing dense mullite-SiC composite refractory bodies by spark plasma sintering', 'Patent', 'Granted',  '2021-08-15', '2024-02-20', ARRAY['A.K. Sharma', 'M.K. Gupta'], 'ARC'),
    ('IP-002', 'An improved electrochemical biosensor for rapid detection of creatinine in biological fluids',     'Patent', 'Published','2023-11-10', NULL,         ARRAY['D. Krishnamurthy', 'R. Verma'], 'BMS'),
    ('IP-003', 'Eco-friendly corrosion inhibitor formulation derived from Azadirachta indica extract for mild steel protection', 'Patent', 'Filed', '2024-06-22', NULL, ARRAY['V.S. Rathore', 'N. Saxena', 'V. Sahu'], 'CPS'),
    ('IP-004', 'Method for synthesis of phase-pure geopolymer binder from Class F fly ash with ambient curing',   'Patent', 'Granted',  '2020-03-05', '2023-09-18', ARRAY['K. Joshi'], 'PMD'),
    ('IP-005', 'Visible-light-active Z-scheme photocatalytic membrane for degradation of organic pollutants in water', 'Patent', 'Filed', '2025-01-30', NULL,    ARRAY['R. Tiwari', 'P. Nair'], 'EEC')
ON CONFLICT (id) DO NOTHING;
