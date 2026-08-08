import type { CommitteeTier, PmsTrack, ReportStatus, SectionKey, StandardSectionKey } from '../../types/pms';

export const SECTION_KEYS: StandardSectionKey[] = [
  'summary',
  'section_i1', 'section_i2', 'section_i3', 'section_i4', 'section_i5',
  'section_ii',
  'section_iii',
  'section_iv',
  'section_v_curriculum', 'section_v_extension', 'section_v_other',
  'section_v_shortfall',
  'section_vi_national', 'section_vi_international',
];

export interface WizardStep {
  label: string;
  keys: SectionKey[];
  /** Part V — Annual Work Plan. Standard track only; saved to pms_awp_activities. */
  awp?: boolean;
}

// Sections that carry period_from / period_to for their track. ReportWizard
// lifts those two dates onto pms_reports so pms_submit_report can accept.
export const PERIOD_SECTION_KEYS: SectionKey[] = ['summary', 'sr_identification', 'dir_identification'];

// 2026 5-part proforma. Parts III (Evaluation Committee) and IV (Empowered
// Committee) are appraisal stages, not wizard steps — the scientist wizard
// covers Parts I, II (Appendix-A), and V (AWP).
export const WIZARD_STEPS: WizardStep[] = [
  { label: 'Part I: Basic Information',   keys: ['summary'] },
  { label: 'Appendix-A: Research I (1-3)', keys: ['section_i1', 'section_i2', 'section_i3'] },
  { label: 'Appendix-A: Research I (4-5)', keys: ['section_i4', 'section_i5'] },
  { label: 'Appendix-A: Research II',      keys: ['section_ii'] },
  { label: 'Appendix-A: Research III',     keys: ['section_iii'] },
  { label: 'Appendix-A: Research IV',      keys: ['section_iv'] },
  { label: 'Appendix-A: Contributions',    keys: ['section_v_curriculum', 'section_v_extension', 'section_v_other'] },
  { label: 'Appendix-A: Shortfall Tracking', keys: ['section_v_shortfall'] },
  { label: 'Appendix-A: Recognition',      keys: ['section_vi_national', 'section_vi_international'] },
  { label: 'Part V: Annual Work Plan',     keys: [], awp: true },
  { label: 'Review & Submit',              keys: [] },
];

// Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist.
// No AWP and no self-score: the appraisal outcome is a categorical pen picture.
export const ANNEXURE_I_WIZARD_STEPS: WizardStep[] = [
  { label: 'Appendix-A: Identification',        keys: ['sr_identification'] },
  { label: 'Appendix-A: Educational Attainments', keys: ['sr_education'] },
  { label: 'Appendix-A: Employment Details',    keys: ['sr_employment'] },
  { label: 'Appendix-A: Leave Record',          keys: ['sr_leave'] },
  { label: 'Questionnaire',                     keys: ['sr_questionnaire'] },
  { label: 'Appendix-B I: R&D and Facilities',  keys: ['sr_b_i1', 'sr_b_i2', 'sr_b_i3'] },
  { label: 'Appendix-B I: Notable Contributions', keys: ['sr_b_i4'] },
  { label: 'Appendix-B II: Publications',       keys: ['sr_b_ii_journals', 'sr_b_ii_conferences', 'sr_b_ii_books', 'sr_b_ii_institutional'] },
  { label: 'Appendix-B II: Patents',            keys: ['sr_b_ii_patents'] },
  { label: 'Appendix-B II: Financial Contribution', keys: ['sr_b_ii_ecf', 'sr_b_ii_tech_transfer', 'sr_b_ii_services'] },
  { label: 'Appendix-B II: Technology Development', keys: ['sr_b_ii_tech_dev'] },
  { label: 'Appendix-B III: Field & Outreach',  keys: ['sr_b_iii'] },
  { label: 'Appendix-B IV: Policy & Leadership', keys: ['sr_b_iv'] },
  { label: 'Appendix-B V: AcSIR / HRD',         keys: ['sr_b_v_lectures', 'sr_b_v_teaching'] },
  { label: 'Appendix-B VI: Recognition',        keys: ['sr_b_vi'] },
  { label: 'Review & Submit',                   keys: [] },
];

// Annexure-II — Director of a CSIR Laboratory/Institute.
export const ANNEXURE_II_WIZARD_STEPS: WizardStep[] = [
  { label: 'Appendix-A: Identification',        keys: ['dir_identification'] },
  { label: 'Appendix-A: Educational Attainments', keys: ['dir_education'] },
  { label: 'Appendix-A: Employment Details',    keys: ['dir_employment'] },
  { label: 'Appendix-A: Leave Record',          keys: ['dir_leave'] },
  { label: 'A. Strategic Positioning',          keys: ['dir_qa'] },
  { label: 'B. Benchmarking',                   keys: ['dir_qb'] },
  { label: 'C. Output / Outcome Matrix',        keys: ['dir_qc_matrix'] },
  { label: 'D. Societal Interventions',         keys: ['dir_qd'] },
  { label: 'E. Administrative & Financial',     keys: ['dir_qe'] },
  { label: 'F. Challenges / Ease of Doing Business', keys: ['dir_qf'] },
  { label: 'Appendix-B I: R&D Involvement',     keys: ['dir_b_i1', 'dir_b_i2', 'dir_b_i3'] },
  { label: 'Appendix-B II: Publications',       keys: ['dir_b_ii_journals', 'dir_b_ii_conferences', 'dir_b_ii_books', 'dir_b_ii_institutional'] },
  { label: 'Appendix-B II: Patents',            keys: ['dir_b_ii_patents'] },
  { label: 'Appendix-B II: Financial Contribution', keys: ['dir_b_ii_ecf', 'dir_b_ii_tech_transfer', 'dir_b_ii_services'] },
  { label: 'Appendix-B II: Technology Development', keys: ['dir_b_ii_tech_dev'] },
  { label: 'Appendix-B III: Institutional Contribution', keys: ['dir_b_iii'] },
  { label: 'Appendix-B IV: Policy & Leadership', keys: ['dir_b_iv'] },
  { label: 'Appendix-B V: Recognition & Guidance', keys: ['dir_b_v'] },
  { label: 'Review & Submit',                   keys: [] },
];

export function wizardStepsFor(track: PmsTrack): WizardStep[] {
  if (track === 'ANNEXURE_I')  return ANNEXURE_I_WIZARD_STEPS;
  if (track === 'ANNEXURE_II') return ANNEXURE_II_WIZARD_STEPS;
  return WIZARD_STEPS;
}

export const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string; label: string }> = {
  DRAFT:                              { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'Draft' },
  SUBMITTED:                          { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Submitted' },
  UNDER_EVALUATION_COMMITTEE_REVIEW:  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Evaluation Committee Review' },
  EMPOWERED_COMMITTEE_REVIEW:         { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Empowered Committee Review' },
  FINALIZED:                          { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Finalized' },
  NOT_ASSESSED:                       { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Not Assessed' },
  UNDER_GRIEVANCE_REVIEW:             { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Grievance Review' },
};

// 2026 guidelines: absolute integer scale
export const SCORE_RANGE = { min: 0, max: 100 };

// 2026 grading scale
export const GRADE_BANDS = [
  { label: 'Outstanding',      min: 90, max: 100 },
  { label: 'Excellent',        min: 85, max: 89 },
  { label: 'Very Good',        min: 75, max: 84 },
  { label: 'Good',             min: 60, max: 74 },
  { label: 'Satisfactory',     min: 50, max: 59 },
  { label: 'Need Improvement', min: 0,  max: 49 },
];

export const OUTSTANDING_THRESHOLD = 90;      // >= requires reasons_for_outstanding
export const BELOW_THRESHOLD = 75;            // <= requires reasons + suggestions
export const MIN_DUTY_DAYS = 90;
export const REPRESENTATION_WINDOW_DAYS = 15;

// Committee tier → Scientist grades it evaluates. Tiers I–III are the 2026
// guidelines (Scientists B–F). Tier IV handles the Annexure-I senior track.
export const COMMITTEE_TIERS: Record<CommitteeTier, string[]> = {
  I:   ['B', 'C', 'D'],
  II:  ['E'],
  III: ['F'],
  IV:  ['G'],
};

export const ELIGIBLE_SCIENTIST_GRADES = ['B', 'C', 'D', 'E', 'F'];

// CSIR guidelines are written in grade letters (Scientist B–G), but CSIR-AMPRI
// staff records carry the equivalent descriptive titles instead — as of
// 2026-07-26 the staff table holds no "Scientist <letter>" row at all. Both
// vocabularies are matched so either spelling resolves.

/** Annexure-I designations — the Scientist G tier. */
export const SENIOR_DESIGNATIONS = [
  'Chief Scientist',
  'Outstanding Scientist',
  'Distinguished Scientist',
];

/** Standard-track titles, i.e. everything below Chief Scientist. */
export const STANDARD_DESIGNATIONS = [
  'Scientist',
  'Senior Scientist',
  'Principal Scientist',
];

// Workflow milestones on financial-year cycles (month is 1-based).
// Reporting year ends Mar 31 of year Y — all milestones fall in Y.
export const PMS_DEADLINES = {
  SELF_APPRAISAL:       { month: 5,  day: 15 }, // Self-appraisal + AWP submission
  EC_COMPLETION:        { month: 6,  day: 30 }, // Evaluation Committee completion
  EMPOWERED_COMPLETION: { month: 7,  day: 31 }, // Empowered Committee completion
  SYSTEM_LOCK:          { month: 11, day: 30 }, // Absolute system-wide lock
} as const;

export const EVALUATION_DIMENSIONS: { key: string; label: string; description: string }[] = [
  { key: 'research_quality',     label: 'Research Quality',          description: 'Originality and impact of research contributions' },
  { key: 'research_quantity',    label: 'Research Output',           description: 'Volume and significance of publications' },
  { key: 'sponsored_projects',   label: 'Sponsored Projects',        description: 'Externally funded research projects secured' },
  { key: 'technology_transfer',  label: 'Technology Transfer',       description: 'Consultancy, licensing, and commercialization' },
  { key: 'ipr_filings',          label: 'IP & Patents',              description: 'Patent filings, grants, and IP management' },
  { key: 'hr_development',       label: 'HR Development',            description: 'Students and researchers mentored/guided' },
  { key: 'institutional_dev',    label: 'Institutional Development', description: 'Lab setup, equipment, institutional initiatives' },
  { key: 'training_curriculum',  label: 'Training & Curriculum',     description: 'Courses taught, training programs organized' },
  { key: 'extension_outreach',   label: 'Extension & Outreach',      description: 'Social, extension, and community activities' },
  { key: 'national_awards',      label: 'National Recognition',      description: 'Fellowships, awards, honors at national level' },
  { key: 'international_awards', label: 'International Recognition', description: 'Fellowships, awards, honors at international level' },
  { key: 'leadership',           label: 'Leadership & Admin',        description: 'Administrative roles, committee service' },
];
