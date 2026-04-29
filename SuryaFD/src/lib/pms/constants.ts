import type { ReportStatus, SectionKey } from '../../types/pms';

export const SECTION_KEYS: SectionKey[] = [
  'summary',
  'section_i1', 'section_i2', 'section_i3', 'section_i4', 'section_i5',
  'section_ii',
  'section_iii',
  'section_iv',
  'section_v_curriculum', 'section_v_extension', 'section_v_other',
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

// 9 wizard steps — each step covers one or more section keys
export const WIZARD_STEPS: { label: string; keys: SectionKey[] }[] = [
  { label: 'Summary',          keys: ['summary'] },
  { label: 'Research I (1-3)', keys: ['section_i1', 'section_i2', 'section_i3'] },
  { label: 'Research I (4-5)', keys: ['section_i4', 'section_i5'] },
  { label: 'Research II',      keys: ['section_ii'] },
  { label: 'Research III',     keys: ['section_iii'] },
  { label: 'Research IV',      keys: ['section_iv'] },
  { label: 'Contributions V',  keys: ['section_v_curriculum', 'section_v_extension', 'section_v_other'] },
  { label: 'Recognition VI',   keys: ['section_vi_national', 'section_vi_international'] },
  { label: 'Review & Submit',  keys: [] },
];

export const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string; label: string }> = {
  DRAFT:                      { bg: 'bg-gray-100',   text: 'text-gray-700',  label: 'Draft' },
  SUBMITTED:                  { bg: 'bg-blue-100',   text: 'text-blue-700',  label: 'Submitted' },
  UNDER_COLLEGIUM_REVIEW:     { bg: 'bg-yellow-100', text: 'text-yellow-700',label: 'Collegium Review' },
  CHAIRMAN_REVIEW:            { bg: 'bg-orange-100', text: 'text-orange-700',label: 'Chairman Review' },
  EMPOWERED_COMMITTEE_REVIEW: { bg: 'bg-purple-100', text: 'text-purple-700',label: 'Committee Review' },
  FINALIZED:                  { bg: 'bg-green-100',  text: 'text-green-700', label: 'Finalized' },
};

export const SCORE_RANGE = { min: 0.5, max: 1.1 };

export const SCORE_CATEGORIES = [
  { label: 'Outstanding',   min: 1.0, max: 1.1 },
  { label: 'Very Good',     min: 0.9, max: 0.99 },
  { label: 'Good',          min: 0.8, max: 0.89 },
  { label: 'Satisfactory',  min: 0.7, max: 0.79 },
  { label: 'Adequate',      min: 0.5, max: 0.69 },
];

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
