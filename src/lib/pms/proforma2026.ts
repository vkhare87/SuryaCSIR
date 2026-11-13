import { CONFERENCE_COLUMNS, EDUCATION_COLUMNS, EMPLOYMENT_COLUMNS, JOURNAL_COLUMNS, LEAVE_COLUMNS, PATENT_COLUMNS } from './annexureSpecs';
import type { SectionSpec } from './annexureSpecs';
import type { P2026SectionKey } from '../../types/pms';
import type { WizardStep } from './constants';

// CSIR PMS Guidelines 2026, Annexure-A (effective reporting year 2026-27,
// scientists up to Scientist-F). Wording and word limits as printed; the
// guideline sets no word limit on the questionnaire, so those boxes allow
// 500 words. Appendix-A: "ONLY those sections/sub-sections that are closely
// relevant to the concerned scientist need to be responded to".

const FREE = 500;

export const P2026_SPECS: Record<P2026SectionKey, SectionSpec> = {
  p26_part1: {
    kind: 'fields',
    title: 'Part I — Basic information',
    hint: 'Establishment fills your identification details (shown above). Complete the rest and report any discrepancy.',
    fields: [
      { key: 'periodFrom', label: 'Assessment year from', type: 'date' },
      { key: 'periodTo', label: 'Assessment year to', type: 'date' },
      { key: 'mobile', label: 'Mobile No.' },
      { key: 'reviewingOfficer', label: 'Reviewing Officer' },
      { key: 'coreSubjectArea', label: 'CSIR Core Subject Area' },
      { key: 'specialization', label: 'Further sub-subject specialization of the area of activity during the assessment period' },
      { key: 'status', label: 'Status (Project Leader / Member / Any other)' },
      { key: 'partOrFullYear', label: 'Part year or full year evaluation' },
      { key: 'propertyReturnFiled', label: 'Filed the annual return on immovable property during this period? (Yes / No)' },
      { key: 'propertyReturnDate', label: 'If yes, date of submission', type: 'date' },
    ],
  },
  p26_education: { kind: 'table', title: 'Educational attainment(s)', columns: EDUCATION_COLUMNS },
  p26_employment: { kind: 'table', title: 'Employment details', columns: EMPLOYMENT_COLUMNS },
  p26_leave: {
    kind: 'table', title: 'Leave record',
    hint: 'List all leave for the year being evaluated. It is verified by Sr. CoA / CoA / AO / SO.',
    columns: LEAVE_COLUMNS,
  },
  p26_qa: {
    kind: 'prompts',
    title: 'Questionnaire A — common to all scientists',
    hint: 'Give detailed or additional information as annexures, marked as per Appendix-A, wherever necessary.',
    prompts: [
      { key: 'q1', label: '1. What do you consider to be your most important achievements sector-wise for the past year? List sector-wise contribution in one or more areas (Public goods / Private goods / Strategic goods / Societal goods).', maxWords: FREE, rows: 8 },
      { key: 'q2', label: '2. Define your major knowledge portfolio — state whether you are involved in Knowledge Generation, Knowledge Development or Knowledge Management. Please elaborate by filling in the appropriate sections of Appendix-A.', maxWords: FREE, rows: 6 },
    ],
  },
  p26_qb: {
    kind: 'prompts',
    title: 'Questionnaire B — Pay Level 13 and above (Scientist-E and F)',
    prompts: [
      { key: 'q3', label: '3. How has your contribution enhanced the prestige of the laboratory?', maxWords: FREE, rows: 6 },
      { key: 'q4', label: '4. In light of your current capabilities, your performance against past objectives, and your future personal growth and/or job aspirations, what activities and tasks would you like to focus on during the next 2–3 years? Also think of development and experiences outside of job skills — related to personal aims, fulfilment, passions, etc.', maxWords: FREE, rows: 6 },
      { key: 'q5', label: '5. What sort of training / experience would benefit you in the next year? Not just job skills — also your natural strengths and personal passions you would like to develop; you, your work and team can benefit from these.', maxWords: FREE, rows: 6 },
    ],
  },
  p26_i1: {
    kind: 'table', title: 'I.1 Participation in the "R&D / R&D managerial activities" of the Laboratory / Institute',
    hint: 'Kindly ensure that there is no repetition while providing information.',
    columns: [
      { key: 'title', label: 'Title of Project' }, { key: 'category', label: 'Project Type / Category' },
      { key: 'agencies', label: 'Participating Agencies (Govt / Industry)' }, { key: 'role', label: 'Your Role as defined' },
    ],
  },
  p26_i2: {
    kind: 'table', title: 'I.2 Participation in "major programmes" and/or "facility creation" identified at the national level',
    columns: [
      { key: 'title', label: 'Title of the Project' }, { key: 'agency', label: 'Coordinating Agency' },
      { key: 'contribution', label: 'Contribution being made by you as representative of your organization' },
    ],
  },
  p26_i3: {
    kind: 'table', title: 'I.3 Acquisition, operation and maintenance of "major facilities" of the Laboratory / Institute',
    columns: [{ key: 'facility', label: 'Title of the Facility' }, { key: 'role', label: 'Your role in brief' }, { key: 'beneficiaries', label: 'Beneficiaries' }],
  },
  p26_i4: {
    kind: 'text', title: 'I.4 Enlist notable contributions',
    hint: 'Up to ten, indicating status like individual achievement, output of a team work / collaborative work, etc.', maxWords: 150,
  },
  p26_i5: { kind: 'text', title: 'I.5 Highlight the significance / impact of your work on industry / society / environment / nation as a whole', maxWords: 100 },
  p26_ii_journals: {
    kind: 'table', title: 'II.1.1 Papers published in journals (during the year)',
    hint: '(i) Peer reviewed / SCI journals — indicate the total impact factor and citations; (ii) non-peer reviewed journals; (iii) review papers (non-SCI). You are responsible for the accuracy of the references.',
    columns: JOURNAL_COLUMNS,
  },
  p26_ii_conferences: { kind: 'table', title: 'II.1.2 Papers published in conference proceedings', columns: CONFERENCE_COLUMNS },
  p26_ii_books: {
    kind: 'table', title: 'II.1.3 Contribution to books', hint: 'Indicate the total number of chapters and pages.',
    columns: [
      { key: 'editors', label: 'Editors' }, { key: 'chapterTitle', label: 'Title of the Chapter' }, { key: 'year', label: 'Year of Pub.' },
      { key: 'bookTitle', label: 'Title of Book' }, { key: 'country', label: 'Country' }, { key: 'edition', label: 'Edition No.' }, { key: 'publisher', label: 'Publisher' },
    ],
  },
  p26_ii_institutional: {
    kind: 'table', title: 'II.1.4 Institutional publications brought out',
    hint: 'Technical brochures, feasibility reports, training manuals, publicity brochures, organizational plans, annual reports, performance reports, protocols, IPR documents, etc.',
    columns: [{ key: 'nature', label: 'Nature' }, { key: 'title', label: 'Title' }],
  },
  p26_ii_patents: {
    kind: 'table', title: 'II.2 Patents filed and granted during the assessment period',
    hint: 'Indicate separately the total number of national and international patents filed and granted.', columns: PATENT_COLUMNS,
  },
  p26_ii_ecf: {
    kind: 'table', title: 'II.3.1 ECF during the assessment period',
    columns: [
      { key: 'title', label: 'Title of the project' }, { key: 'category', label: 'Project Type / Category' },
      { key: 'amount', label: 'Amount received with your initiative' }, { key: 'source', label: 'Govt. / Industry' }, { key: 'labReserve', label: 'Lab Reserve generation' },
    ],
  },
  p26_ii_tech_transfer: {
    kind: 'table', title: 'II.3.2 Technology / Process / Know-how transferred',
    columns: [
      { key: 'title', label: 'Title' }, { key: 'period', label: 'Period during which developed' }, { key: 'date', label: 'Date of transfer' },
      { key: 'organization', label: 'Organization / Industry' }, { key: 'fees', label: 'Total fees / premia / royalty realized' }, { key: 'role', label: 'Your Role' },
    ],
  },
  p26_ii_services: {
    kind: 'fields', title: 'II.3.3 – II.3.6 Services',
    fields: [
      { key: 'testing', label: 'II.3.3 Testing, evaluation and calibration jobs undertaken and amount charged' },
      { key: 'eia', label: 'II.3.4 No. of EIA jobs undertaken and amount charged' },
      { key: 'software', label: 'II.3.5 Software developed & delivered and amount charged' },
      { key: 'others', label: 'II.3.6 Others (specify, if any)' },
    ],
  },
  p26_ii_tech_dev: {
    kind: 'table', title: 'II.4 Technology / Process / Product development',
    hint: 'If your work (such as spin-offs) cannot be shown in these terms, quantify your contribution in your own way, referring to sections already filled.',
    columns: [{ key: 'title', label: 'Title' }, { key: 'year', label: 'Year of Development' }, { key: 'contribution', label: 'Your contribution in the development' }],
  },
  p26_iii: {
    kind: 'prompts', title: 'Section III', hint: 'Details on the following, whatever applicable — total information within 300 words.', totalMaxWords: 300,
    prompts: [
      { key: 'iii1', label: 'III.1 Field work undertaken — (a) field data collection (including oceanic data), with days per year; (b) field implementation / technology diffusion; (c) technical guidance / counselling', maxWords: 300, rows: 3 },
      { key: 'iii2', label: 'III.2 ECF catalyzed and budget handled (CSIR & other agencies)', maxWords: 300, rows: 2 },
      { key: 'iii3', label: 'III.3 Participation and contributions made for strategic sector', maxWords: 300, rows: 2 },
      { key: 'iii4', label: 'III.4 Have you been able to create / add new clients to the organization', maxWords: 300, rows: 2 },
      { key: 'iii5', label: 'III.5 Contribution to indigenous technology / component / project / device / engineering systems design & development', maxWords: 300, rows: 2 },
      { key: 'iii6', label: 'III.6 Activities leading to foreign exchange saving', maxWords: 300, rows: 2 },
      { key: 'iii7', label: 'III.7 S&T cooperation established with other countries, including regional collaboration', maxWords: 300, rows: 2 },
      { key: 'iii8', label: 'III.8 Assistance provided for national / international institution building', maxWords: 300, rows: 2 },
      { key: 'iii9', label: 'III.9 National / international training programs organized', maxWords: 300, rows: 2 },
      { key: 'iii10', label: 'III.10 Your contribution toward the advancement of science and technology in the country', maxWords: 300, rows: 2 },
      { key: 'iii11', label: 'III.11 Any other point, not covered so far, to complete the spectrum of your achievements', maxWords: 300, rows: 2 },
    ],
  },
  p26_iv: {
    kind: 'prompts', title: 'Section IV', hint: 'Information on the following lines, whatever applicable — within 300 words.', totalMaxWords: 300,
    prompts: [
      { key: 'iv1', label: 'IV.1 Participation in policy formulation and/or decision making', maxWords: 300, rows: 2 },
      { key: 'iv2', label: 'IV.2 Formulating or amending existing rules and procedures to enhance the effective functioning of the organization', maxWords: 300, rows: 2 },
      { key: 'iv3', label: 'IV.3 Interacting within CSIR, with other R&D organizations, Govt. departments, industry and/or international agencies for project formulation or meeting the objectives of identified programmes', maxWords: 300, rows: 2 },
      { key: 'iv4', label: 'IV.4 Obtaining and processing financial approvals and managing associated activities for the implementation of mega projects', maxWords: 300, rows: 2 },
      { key: 'iv5', label: 'IV.5 Providing major services to the organization to support its efficient functioning and enhance its public image', maxWords: 300, rows: 2 },
      { key: 'iv6', label: 'IV.6 Membership in organization / national / international committees', maxWords: 300, rows: 2 },
      { key: 'iv7', label: 'IV.7 Important administrative responsibilities taken and success achieved', maxWords: 300, rows: 2 },
      { key: 'iv8', label: 'IV.8 Major events organized as leader / coordinator', maxWords: 300, rows: 2 },
      { key: 'iv9', label: "IV.9 Major initiatives undertaken to strengthen the organization's overall positioning", maxWords: 300, rows: 2 },
      { key: 'iv10', label: 'IV.10 Any other aspect of your contribution that demonstrates your leadership qualities', maxWords: 300, rows: 2 },
    ],
  },
  p26_v: {
    kind: 'table', title: 'Section V — Shortfall against the Annual Work Plan',
    hint: 'Was there a shortfall in performance from that committed in the annual work plan? If yes, give details; if not, leave this empty.',
    columns: [
      { key: 'indicator', label: 'Performance Indicator' }, { key: 'committed', label: 'Committed performance as per Annual Work Plan' },
      { key: 'achieved', label: 'Outcome achieved' }, { key: 'reasons', label: 'Reasons for shortfall' },
    ],
  },
};

/** The scientist's steps for a 2026 report. Questionnaire B only for Pay Level 13 and above. */
export function wizardSteps2026(questionnaireB: boolean): WizardStep[] {
  return [
    { label: 'Part I: Basic information', keys: ['p26_part1'] },
    { label: 'Part I: Education, employment, leave', keys: ['p26_education', 'p26_employment', 'p26_leave'] },
    { label: 'Part II: Questionnaire A', keys: ['p26_qa'] },
    ...(questionnaireB ? [{ label: 'Part II: Questionnaire B', keys: ['p26_qb'] as P2026SectionKey[] }] : []),
    { label: 'Appendix-A I: R&D and facilities', keys: ['p26_i1', 'p26_i2', 'p26_i3'] },
    { label: 'Appendix-A I: Contributions and impact', keys: ['p26_i4', 'p26_i5'] },
    { label: 'Appendix-A II: Publications', keys: ['p26_ii_journals', 'p26_ii_conferences', 'p26_ii_books', 'p26_ii_institutional'] },
    { label: 'Appendix-A II: Patents and finance', keys: ['p26_ii_patents', 'p26_ii_ecf', 'p26_ii_tech_transfer', 'p26_ii_services'] },
    { label: 'Appendix-A II: Technology development', keys: ['p26_ii_tech_dev'] },
    { label: 'Appendix-A III', keys: ['p26_iii'] },
    { label: 'Appendix-A IV', keys: ['p26_iv'] },
    { label: 'Appendix-A V: Shortfall', keys: ['p26_v'] },
    { label: 'Part V: Annual Work Plan (next year)', keys: [], awp: true },
    { label: 'Review & Submit', keys: [] },
  ];
}

/** Part III pen picture scale (no marks). */
export const PEN_PICTURE_SCALE_2026 = ['Excellent', 'Very Good', 'Good', 'Needs to be improved'];
