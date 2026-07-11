-- =============================================================
-- seed_proposals.sql
-- Idempotent mock data for the proposals module.
-- Run as `postgres` (Supabase SQL Editor) — bypasses RLS.
-- Re-running deletes the mock set and re-inserts.
-- =============================================================

-- Adjust this to your auth.users.id for the PI/created_by columns.
-- Default: vivek.khare@csir.res.in (per current session).
do $$
declare
  v_uid uuid := 'c746ed73-1e0f-4ea1-a247-f42ef525bc72';
  v_division text := 'AMD';
begin

  -- Wipe previous mock set (status_history + copis cascade via FK)
  delete from public.proposals where proposal_code like 'PROP-MOCK-%';

  -- ---------- 1. DRAFT ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, created_by
  ) values (
    'PROP-MOCK-0001',
    'Graphene-based supercapacitor electrodes',
    'GSCE',
    'Energy Materials',
    'External',
    'Government',
    'DST-SERB',
    'Applied Research',
    '2026-07-01', 24, 4500000,
    v_uid, 'Dr. A. Researcher', v_division,
    'Develop high-energy-density supercapacitor electrodes using doped graphene composites.',
    'Conventional supercapacitors suffer from low energy density limiting EV use cases.',
    '1. Synthesize N-doped graphene 2. Fabricate electrode 3. Characterize 1000 cycles',
    'Prototype electrode with >150 F/g capacitance.',
    3, 6,
    'DRAFT', v_uid
  );

  -- ---------- 2. SUBMITTED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, created_by, submitted_at
  ) values (
    'PROP-MOCK-0002',
    'Lightweight Mg-alloy chassis for two-wheelers',
    'LMAC',
    'Structural Materials',
    'External',
    'Industry',
    'Hero MotoCorp',
    'Product Development',
    '2026-08-15', 18, 8200000,
    v_uid, 'Dr. B. Metallurgist', v_division,
    'Develop Mg-Zn-Ca alloy chassis components achieving 30% weight reduction over Al-6061.',
    'Two-wheeler OEMs need lighter chassis to meet fuel-economy regulation FY2027.',
    '1. Alloy design 2. Casting trials 3. Fatigue testing 4. Pilot batch',
    '50-unit pilot batch delivered to OEM for road trials.',
    4, 7,
    'SUBMITTED', v_uid, now() - interval '5 days'
  );

  -- ---------- 3. UNDER_REVIEW ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0003',
    'Self-healing polymer coating for marine structures',
    'SHPC-Marine',
    'Functional Materials',
    'External',
    'Government',
    'Ministry of Earth Sciences',
    'Sponsored Project',
    '2026-09-01', 36, 12000000,
    v_uid, 'Dr. C. Polymer', v_division,
    'Microcapsule-loaded epoxy coatings that auto-repair micro-cracks in marine splash zones.',
    'Offshore structures lose 15% wall thickness to corrosion within 5 years.',
    '1. Capsule synthesis 2. Coating formulation 3. Salt-spray test 5000 hr 4. Field panel deployment',
    'Coating meeting ASTM B117 5000 hr with <5 mm corrosion creep.',
    3, 6,
    'UNDER_REVIEW',
    'MoES Project Appraisal Committee',
    (now() - interval '10 days')::date,
    v_uid, now() - interval '15 days', v_uid, now() - interval '10 days'
  );

  -- ---------- 4. REVISION_REQUESTED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date, revision_notes,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0004',
    'Bio-derived ceramic membranes for water filtration',
    'BCM-Water',
    'Biomaterials',
    'Internal',
    'CSIR-Internal',
    'CSIR HQ',
    'Basic Research',
    '2026-08-01', 24, 3200000,
    v_uid, 'Dr. D. Membrane', v_division,
    'Ceramic membranes derived from rice husk ash for low-cost water purification.',
    'Rural communities lack affordable point-of-use filtration.',
    '1. Source rice husk 2. Sintering optimization 3. Pore characterization 4. E. coli rejection test',
    'Membrane with >99% bacteria rejection at <Rs.500/m2 cost.',
    2, 5,
    'REVISION_REQUESTED',
    'CSIR Research Council',
    (now() - interval '20 days')::date,
    'Add detailed scale-up cost analysis. Clarify IP ownership for husk supplier. Include lifecycle assessment.',
    v_uid, now() - interval '30 days', v_uid, now() - interval '7 days'
  );

  -- ---------- 5. REJECTED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date, rejection_reason,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0005',
    'Quantum dot solar cells with rare-earth dopants',
    'QDSC-RE',
    'Nano Materials',
    'External',
    'International',
    'EU Horizon',
    'Basic Research',
    '2026-10-01', 36, 18000000,
    v_uid, 'Dr. E. Photon', v_division,
    'Explore Eu and Tb dopants in PbS QDs for enhanced photon up-conversion.',
    'Conventional QDSC efficiency capped at 18%.',
    '1. QD synthesis with dopants 2. Spectroscopy 3. Device fabrication',
    'PoC cell demonstrating >22% efficiency.',
    2, 4,
    'REJECTED',
    'EU Horizon Panel B',
    (now() - interval '60 days')::date,
    'Out of scope for current EU work programme. Resubmit under EIC Pathfinder 2027.',
    v_uid, now() - interval '90 days', v_uid, now() - interval '40 days'
  );

  -- ---------- 6. RECOMMENDED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0006',
    'AI-driven defect detection in additive manufacturing',
    'AI-AM-Defect',
    'Process Engineering',
    'External',
    'Industry',
    'GE Aerospace India',
    'Process Development',
    '2026-09-15', 24, 9500000,
    v_uid, 'Dr. F. Manufacturing', v_division,
    'In-situ defect detection in laser powder-bed fusion using ML on melt-pool imagery.',
    'Post-build CT scans add 40% to part lead time.',
    '1. Camera rig 2. Dataset labeling 3. Model training 4. Closed-loop trial',
    'Detection F1 > 0.9 with <100 ms latency, validated on 200 parts.',
    4, 7,
    'RECOMMENDED',
    'GE Industry Liaison Cell',
    (now() - interval '45 days')::date,
    v_uid, now() - interval '60 days', v_uid, now() - interval '12 days'
  );

  -- ---------- 7. APPROVED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date, sanctioned_amount, sanction_date,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0007',
    'Hydrogen storage in MOF-decorated carbon foams',
    'H2-MOF-CF',
    'Energy Materials',
    'External',
    'Government',
    'MNRE',
    'Mission Mode',
    '2026-11-01', 30, 14500000,
    v_uid, 'Dr. G. Storage', v_division,
    'Hybrid hydrogen storage media combining MOFs and reticulated carbon foam scaffolds.',
    'Onboard H2 storage at 700 bar is unsafe for passenger vehicles.',
    '1. MOF screening 2. Foam impregnation 3. Sieverts measurement 4. 100 g prototype tank',
    'Storage capacity > 5.5 wt% at -77 deg C and 100 bar.',
    3, 6,
    'APPROVED',
    'MNRE Hydrogen Mission Steering Group',
    (now() - interval '70 days')::date,
    13800000,  -- sanctioned slightly less than requested
    (now() - interval '15 days')::date,
    v_uid, now() - interval '100 days', v_uid, now() - interval '15 days'
  );

  -- ---------- 8. OM_ISSUED ----------
  insert into public.proposals (
    proposal_code, title, acronym, domain_theme, fund_type, sponsor_type,
    sponsor_name, project_category, proposed_start_date, proposed_duration_months,
    requested_budget, pi_user_id, pi_name, division_code, abstract,
    problem_statement, objectives, expected_outcomes, current_trl, target_trl,
    status, review_body, review_sent_date, sanctioned_amount, sanction_date,
    om_number, om_date,
    created_by, submitted_at, last_status_change_by, last_status_change_at
  ) values (
    'PROP-MOCK-0008',
    'Recyclable thermoset epoxies for wind turbine blades',
    'RTE-WTB',
    'Functional Materials',
    'External',
    'Industry',
    'Suzlon Energy',
    'Consultancy',
    '2026-06-01', 24, 6800000,
    v_uid, 'Dr. H. Composite', v_division,
    'Dynamic covalent network epoxies enabling end-of-life blade recycling.',
    'Wind blade waste reaches 43 million tonnes by 2050.',
    '1. Resin synthesis 2. Layup with glass fiber 3. Mechanical testing 4. Recycling demo',
    'Blade coupon with retained 90% modulus after one recycle pass.',
    4, 7,
    'OM_ISSUED',
    'Suzlon R&D Steering Committee',
    (now() - interval '120 days')::date,
    6500000,
    (now() - interval '40 days')::date,
    'CSIR-AMPRI/RTE-WTB/2026/041',
    (now() - interval '10 days')::date,
    v_uid, now() - interval '160 days', v_uid, now() - interval '10 days'
  );

  -- ---------- Co-PIs for a couple ----------
  insert into public.proposal_copis (proposal_id, staff_id, staff_name)
  select id, 'S00123', 'Dr. Co-PI One'
    from public.proposals where proposal_code = 'PROP-MOCK-0003';
  insert into public.proposal_copis (proposal_id, staff_id, staff_name)
  select id, 'S00456', 'Dr. Co-PI Two'
    from public.proposals where proposal_code = 'PROP-MOCK-0003';
  insert into public.proposal_copis (proposal_id, staff_id, staff_name)
  select id, 'S00789', 'Dr. AM Expert'
    from public.proposals where proposal_code = 'PROP-MOCK-0006';

  -- ---------- Synthetic status history ----------
  -- DRAFT (PROP-MOCK-0001) has none.
  -- SUBMITTED (0002): DRAFT -> SUBMITTED
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '5 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0002';

  -- UNDER_REVIEW (0003): DRAFT -> SUBMITTED -> UNDER_REVIEW
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '15 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0003';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'MoES Project Appraisal Committee',
                            'review_sent_date', (now() - interval '10 days')::date),
         v_uid, now() - interval '10 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0003';

  -- REVISION_REQUESTED (0004): full chain
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '30 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0004';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'CSIR Research Council',
                            'review_sent_date', (now() - interval '20 days')::date),
         v_uid, now() - interval '20 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0004';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'UNDER_REVIEW', 'REVISION_REQUESTED',
         jsonb_build_object('revision_notes', 'Add detailed scale-up cost analysis. Clarify IP ownership for husk supplier. Include lifecycle assessment.'),
         v_uid, now() - interval '7 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0004';

  -- REJECTED (0005)
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '90 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0005';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'EU Horizon Panel B',
                            'review_sent_date', (now() - interval '60 days')::date),
         v_uid, now() - interval '60 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0005';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'UNDER_REVIEW', 'REJECTED',
         jsonb_build_object('rejection_reason', 'Out of scope for current EU work programme. Resubmit under EIC Pathfinder 2027.'),
         v_uid, now() - interval '40 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0005';

  -- RECOMMENDED (0006)
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '60 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0006';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'GE Industry Liaison Cell',
                            'review_sent_date', (now() - interval '45 days')::date),
         v_uid, now() - interval '45 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0006';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, v_uid, now() - interval '12 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0006';

  -- APPROVED (0007)
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '100 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0007';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'MNRE Hydrogen Mission Steering Group',
                            'review_sent_date', (now() - interval '70 days')::date),
         v_uid, now() - interval '70 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0007';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, v_uid, now() - interval '30 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0007';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'RECOMMENDED', 'APPROVED',
         jsonb_build_object('sanctioned_amount', 13800000,
                            'sanction_date', (now() - interval '15 days')::date),
         v_uid, now() - interval '15 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0007';

  -- OM_ISSUED (0008) — full chain including APPROVED
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'DRAFT', 'SUBMITTED', '{}'::jsonb, v_uid, now() - interval '160 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0008';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'SUBMITTED', 'UNDER_REVIEW',
         jsonb_build_object('review_body', 'Suzlon R&D Steering Committee',
                            'review_sent_date', (now() - interval '120 days')::date),
         v_uid, now() - interval '120 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0008';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'UNDER_REVIEW', 'RECOMMENDED', '{}'::jsonb, v_uid, now() - interval '70 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0008';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'RECOMMENDED', 'APPROVED',
         jsonb_build_object('sanctioned_amount', 6500000,
                            'sanction_date', (now() - interval '40 days')::date),
         v_uid, now() - interval '40 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0008';
  insert into public.proposal_status_history (proposal_id, from_status, to_status, payload, changed_by, changed_at)
  select id, 'APPROVED', 'OM_ISSUED',
         jsonb_build_object('om_number', 'CSIR-AMPRI/RTE-WTB/2026/041',
                            'om_date', (now() - interval '10 days')::date,
                            'om_doc_id', gen_random_uuid()::text),
         v_uid, now() - interval '10 days'
    from public.proposals where proposal_code = 'PROP-MOCK-0008';

end $$;

-- Verify
select proposal_code, status, sanctioned_amount, om_number
  from public.proposals
 where proposal_code like 'PROP-MOCK-%'
 order by proposal_code;
