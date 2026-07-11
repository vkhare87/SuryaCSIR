import type { CommitteeTier, ReportStatus, SectionKey } from '../../types/pms';

export const SECTION_KEYS: SectionKey[] = [
  'summary',
  'section_i1', 'section_i2', 'section_i3', 'section_i4', 'section_i5',
  'section_ii',
  'section_iii',
  'section_iv',
  'section_v_curriculum', 'section_v_extension', 'section_v_other',
  'section_v_shortfall',
  'section_vi_national', 'section_vi_international',
];

// Max word counts per section (undefined = no limit)
export const MAX_WORDS: Partial<Record<SectionKey, number>> = {
  section_i4: 150,
  section_i5: 100,
  section_iii: 300,
  section_iv: 300,
  section_v_curriculum: 100,
  section_v_other: 150,
};

// 2026 5-part proforma. Parts III (Evaluation Committee) and IV (Empowered
// Committee) are appraisal stages, not wizard steps — the scientist wizard
// covers Parts I, II (Appendix-A), and V (AWP).
export const WIZARD_STEPS: { label: string; keys: SectionKey[] }[] = [
  { label: 'Part I: Basic Information',   keys: ['summary'] },
  { label: 'Appendix-A: Research I (1-3)', keys: ['section_i1', 'section_i2', 'section_i3'] },
  { label: 'Appendix-A: Research I (4-5)', keys: ['section_i4', 'section_i5'] },
  { label: 'Appendix-A: Research II',      keys: ['section_ii'] },
  { label: 'Appendix-A: Research III',     keys: ['section_iii'] },
  { label: 'Appendix-A: Research IV',      keys: ['section_iv'] },
  { label: 'Appendix-A: Contributions',    keys: ['section_v_curriculum', 'section_v_extension', 'section_v_other'] },
  { label: 'Appendix-A: Shortfall Tracking', keys: ['section_v_shortfall'] },
  { label: 'Appendix-A: Recognition',      keys: ['section_vi_national', 'section_vi_international'] },
  { label: 'Part V: Annual Work Plan',     keys: [] },
  { label: 'Review & Submit',              keys: [] },
];

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

// Committee tier → Scientist grades it evaluates. Appraisees are eligible up
// to Scientist F only.
export const COMMITTEE_TIERS: Record<CommitteeTier, string[]> = {
  I:   ['B', 'C', 'D'],
  II:  ['E'],
  III: ['F'],
};

export const ELIGIBLE_SCIENTIST_GRADES = ['B', 'C', 'D', 'E', 'F'];

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
