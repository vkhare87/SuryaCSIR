import type { AnnexureISectionKey, AnnexureIISectionKey, SeniorSectionKey } from '../../types/pms';

export interface FieldSpec {
  key: string;
  label: string;
  maxWords?: number;
  rows?: number;
  type?: 'text' | 'date';
}

export interface ColumnSpec {
  key: string;
  label: string;
}

export type SectionSpec =
  | { kind: 'fields';  title: string; hint?: string; fields: FieldSpec[] }
  | { kind: 'prompts'; title: string; hint?: string; prompts: FieldSpec[] }
  | { kind: 'table';   title: string; hint?: string; columns: ColumnSpec[] }
  | { kind: 'text';    title: string; hint?: string; maxWords: number };

// --- 1. Shared Appendix-A / Appendix-B table shapes ---

const EDUCATION_COLUMNS: ColumnSpec[] = [
  { key: 'qualification',   label: 'Qualification' },
  { key: 'specialization',  label: 'Specialization / Subject(s)' },
  { key: 'year',            label: 'Year' },
  { key: 'university',      label: 'University / Institute' },
  { key: 'additionalInfo',  label: 'Additional Information' },
];

const EMPLOYMENT_COLUMNS: ColumnSpec[] = [
  { key: 'gradePost',     label: 'Grade / Post' },
  { key: 'establishment', label: 'Estt. / Lab / Instt.' },
  { key: 'from',          label: 'Duration From' },
  { key: 'to',            label: 'Duration To' },
  { key: 'remarks',       label: 'Remarks' },
];

const LEAVE_COLUMNS: ColumnSpec[] = [
  { key: 'leaveType', label: 'Type of leave' },
  { key: 'days',      label: 'No. of days' },
];

const JOURNAL_COLUMNS: ColumnSpec[] = [
  { key: 'authors',       label: 'Authors' },
  { key: 'title',         label: 'Title of the Article' },
  { key: 'year',          label: 'Year of Publication' },
  { key: 'journal',       label: 'Name of Journal' },
  { key: 'country',       label: 'Country' },
  { key: 'volIssuePages', label: 'Vol No., Issue, Pages' },
  { key: 'doi',           label: 'DOI' },
];

const CONFERENCE_COLUMNS: ColumnSpec[] = [
  { key: 'authors',    label: 'Authors' },
  { key: 'title',      label: 'Title of the Article' },
  { key: 'date',       label: 'Date' },
  { key: 'conference', label: 'Name of Conference' },
  { key: 'venue',      label: 'Venue' },
  { key: 'volPages',   label: 'Vol No., Pages' },
  { key: 'publisher',  label: 'Publisher' },
];

const BOOK_COLUMNS: ColumnSpec[] = [
  { key: 'authors',      label: 'Authors' },
  { key: 'chapterTitle', label: 'Title of the chapter' },
  { key: 'year',         label: 'Year of Publication' },
  { key: 'bookTitle',    label: 'Title of Book' },
  { key: 'country',      label: 'Country' },
  { key: 'edition',      label: 'Edition No.' },
  { key: 'publisher',    label: 'Publisher' },
];

const PATENT_COLUMNS: ColumnSpec[] = [
  { key: 'title',          label: 'Title' },
  { key: 'country',        label: 'Country' },
  { key: 'filedOn',        label: 'Filed on (Date)' },
  { key: 'grantedOn',      label: 'Granted on (Date)' },
  { key: 'otherInventors', label: 'Names of other inventors' },
];

const ECF_COLUMNS: ColumnSpec[] = [
  { key: 'projectTitle',   label: 'Title of the project' },
  { key: 'projectType',    label: 'Project Type / Category' },
  { key: 'amountReceived', label: 'Amount received with your initiative' },
  { key: 'source',         label: 'Govt. / Industry' },
  { key: 'labReserve',     label: 'Lab Reserve generation' },
];

const TECH_TRANSFER_COLUMNS: ColumnSpec[] = [
  { key: 'title',                   label: 'Title' },
  { key: 'developmentPeriod',       label: 'Period during which developed' },
  { key: 'transferDate',            label: 'Date of transfer' },
  { key: 'organization',            label: 'Organization / Industry' },
  { key: 'feesRealized',            label: 'Total fees realized' },
  { key: 'yourRole',                label: 'Your Role' },
  { key: 'commercializationStatus', label: 'Commercialisation Status' },
];

const TECH_DEV_COLUMNS: ColumnSpec[] = [
  { key: 'title',            label: 'Title' },
  { key: 'yearDeveloped',    label: 'Year of Development' },
  { key: 'yourContribution', label: 'Your contribution in the development (≤10 words)' },
];

// II.3.3 – II.3.6, identical in both annexures.
const SERVICE_PROMPTS: FieldSpec[] = [
  { key: 'testing',  label: 'II.3.3 Testing, evaluation and calibration jobs undertaken and amount charged', maxWords: 150 },
  { key: 'eia',      label: 'II.3.4 No. of EIA jobs undertaken and amount charged',                          maxWords: 150 },
  { key: 'software', label: 'II.3.5 Software developed & delivered and amount charged',                      maxWords: 150 },
  { key: 'others',   label: 'II.3.6 Others (specify, if any)',                                               maxWords: 150 },
];

// Section IV is worded identically in both proformas apart from two verbs.
function sectionIVPrompts(directorVoice: boolean): FieldSpec[] {
  return [
    { key: 'policy',       label: directorVoice ? 'Policy formulation and / or decision making' : 'Participation in policy formulation and / or decision making', maxWords: 300 },
    { key: 'rules',        label: directorVoice ? 'Direction / enablement for formulation or amendment of existing rules / procedures for better effective functioning of the organization' : 'Formulating / amending existing rules / procedures for better effective functioning of the organization', maxWords: 300 },
    { key: 'interaction',  label: 'Interacting within CSIR, with other R&D organizations, Govt. departments, industry and / or international agencies for project formulation or meeting the objectives of identified programmes', maxWords: 300 },
    { key: 'megaProjects', label: 'Obtaining / processing financial approval and associated management for implementing mega projects', maxWords: 300 },
    { key: 'service',      label: 'Providing major service to your organization in its efficient functioning & image building', maxWords: 300 },
    { key: 'committees',   label: 'Membership in organizational / national / international committees', maxWords: 300 },
    { key: 'admin',        label: 'Important administrative responsibilities taken and success achieved', maxWords: 300 },
    { key: 'events',       label: directorVoice ? 'Major events organized as leader' : 'Major events organized as leader / coordinator', maxWords: 300 },
    { key: 'positioning',  label: 'Major initiative taken towards better positioning of the Laboratory / CSIR', maxWords: 300 },
    { key: 'anyOther',     label: 'Any other dimension of your contribution essentially depicting your leadership quality', maxWords: 300 },
  ];
}

// --- 2. Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist ---

const ANNEXURE_I_SPECS: Record<AnnexureISectionKey, SectionSpec> = {
  sr_identification: {
    kind: 'fields',
    title: 'Identification Information',
    hint: 'Appendix-A. Confirm the details on record for the evaluation period.',
    fields: [
      { key: 'name',                    label: 'Name of the Employee' },
      { key: 'employeeId',              label: 'Employee ID' },
      { key: 'groupGrade',              label: 'Group / Grade' },
      { key: 'designation',             label: 'Designation' },
      { key: 'dob',                     label: 'Date of Birth', type: 'date' },
      { key: 'division',                label: 'Division / Department' },
      { key: 'placeOfPosting',          label: 'Place of posting' },
      { key: 'dojCsir',                 label: 'Date of Joining CSIR', type: 'date' },
      { key: 'dojPresentPosition',      label: 'Date of joining present position', type: 'date' },
      { key: 'tenureCompletion',        label: 'Date of completion of tenure / superannuation', type: 'date' },
      { key: 'email',                   label: 'Email ID' },
      { key: 'mobile',                  label: 'Mobile No.' },
      { key: 'periodFrom',              label: 'Evaluation period from', type: 'date' },
      { key: 'periodTo',                label: 'Evaluation period to', type: 'date' },
      { key: 'evaluationType',          label: 'Part year or full year evaluation' },
      { key: 'immovablePropertyReturn', label: 'Annual return on immovable property filed for this period (Yes / No)' },
    ],
  },
  sr_education:  { kind: 'table', title: 'Educational Attainment(s)', columns: EDUCATION_COLUMNS },
  sr_employment: { kind: 'table', title: 'Employment Details',        columns: EMPLOYMENT_COLUMNS },
  sr_leave: {
    kind: 'table',
    title: 'Leave Record',
    hint: 'List all leave for the year being evaluated. The signed hardcopy (Sr. CoA / CoA / AO) is uploaded on the final step as an annexure.',
    columns: LEAVE_COLUMNS,
  },
  sr_questionnaire: {
    kind: 'prompts',
    title: 'Questionnaire',
    hint: 'Only the items closely relevant to you need to be answered.',
    prompts: [
      { key: 'q1',  label: '1. Your most important achievements sector-wise for the past year (public / private / strategic / societal goods) — elaborate on outcomes, economic impact, and societal impact', maxWords: 300, rows: 8 },
      { key: 'q2',  label: '2. Your contribution to National Missions and CSIR Missions', maxWords: 300, rows: 6 },
      { key: 'q3',  label: '3. Your major knowledge portfolio — knowledge generation, development, or management', maxWords: 300, rows: 6 },
      { key: 'q4',  label: '4. Leadership role benefitting the Laboratory / CSIR — the interventions and their impact', maxWords: 300, rows: 6 },
      { key: 'q5',  label: '5. Scientists mentored — purpose, strategy, pathway, and outcome', maxWords: 300, rows: 6 },
      { key: 'q6',  label: '6. Contribution to the capability building of the Laboratory / CSIR and how it helps its positioning', maxWords: 300, rows: 6 },
      { key: 'q7',  label: '7. Work that led to an impact-making activity and how it benefitted the CSIR system', maxWords: 300, rows: 6 },
      { key: 'q8',  label: '8. How your contribution enhanced the prestige, positioning, and stakeholder connect of the Laboratory / CSIR', maxWords: 300, rows: 6 },
      { key: 'q9',  label: '9. Activities and tasks you would like to focus on over the next 1–2 years for the Laboratory / Institute', maxWords: 300, rows: 6 },
      { key: 'q10', label: '10. Exposure / experience you would like in the next year and how it benefits your team and CSIR', maxWords: 300, rows: 6 },
    ],
  },
  sr_b_i1: {
    kind: 'table',
    title: 'I.1 Participation in R&D / R&D management activities',
    columns: [
      { key: 'title',    label: 'Title of Project' },
      { key: 'category', label: 'Project Category' },
      { key: 'agencies', label: 'Participating Agencies' },
      { key: 'role',     label: 'Role' },
    ],
  },
  sr_b_i2: {
    kind: 'table',
    title: 'I.2 Major Programmes / Facility Creation identified at the National level',
    columns: [
      { key: 'title',        label: 'Title of the Project' },
      { key: 'agency',       label: 'Coordinating Agency' },
      { key: 'contribution', label: 'Contribution being made' },
    ],
  },
  sr_b_i3: {
    kind: 'table',
    title: 'I.3 Creation / development, operation and maintenance of Major Facilities',
    columns: [
      { key: 'facility',      label: 'Title of the Facility' },
      { key: 'role',          label: 'Your role in brief' },
      { key: 'beneficiaries', label: 'Beneficiaries' },
    ],
  },
  sr_b_i4: {
    kind: 'text',
    title: 'I.4 Notable contributions',
    hint: 'Up to ten, indicating status — individual achievement, output of team work, collaborative work, etc.',
    maxWords: 150,
  },
  sr_b_ii_journals: {
    kind: 'table',
    title: 'II.1.1 Papers published in SCI journals (reporting year only)',
    hint: 'Indicate the total impact factor and citations of your publications. You are responsible for the accuracy of these references.',
    columns: JOURNAL_COLUMNS,
  },
  sr_b_ii_conferences: { kind: 'table', title: 'II.1.2 Papers published in conference proceedings', columns: CONFERENCE_COLUMNS },
  sr_b_ii_books:       { kind: 'table', title: 'II.1.3 Contribution to books', hint: 'Indicate the total number of chapters and pages.', columns: BOOK_COLUMNS },
  sr_b_ii_institutional: {
    kind: 'text',
    title: 'II.1.4 Institutional publications brought out',
    hint: 'Technical brochures, feasibility reports, training manuals, publicity brochures, organizational plans, annual reports, performance reports, protocols, IPR documents, etc.',
    maxWords: 150,
  },
  sr_b_ii_patents: {
    kind: 'table',
    title: 'II.2 Patents filed and granted during the assessment period',
    hint: 'Indicate national and international patents filed and granted separately.',
    columns: PATENT_COLUMNS,
  },
  sr_b_ii_ecf:           { kind: 'table', title: 'II.3.1 ECF generated / enabled during the assessment period', columns: ECF_COLUMNS },
  sr_b_ii_tech_transfer: { kind: 'table', title: 'II.3.2 Technology / process / know-how transferred, commercialization status', columns: TECH_TRANSFER_COLUMNS },
  sr_b_ii_services:      { kind: 'prompts', title: 'II.3.3 – II.3.6 Services and other financial contribution', prompts: SERVICE_PROMPTS },
  sr_b_ii_tech_dev:      { kind: 'table', title: 'II.4 Technology / process / product development', columns: TECH_DEV_COLUMNS },
  sr_b_iii: {
    kind: 'prompts',
    title: 'Section III',
    hint: 'Provide details on the following, whatever applicable, within 300 words each.',
    prompts: [
      { key: 'fieldWork',           label: 'Field work undertaken / guidance', maxWords: 300 },
      { key: 'fieldImpl',           label: 'Field implementation / technology diffusion', maxWords: 300 },
      { key: 'technicalGuidance',   label: 'Technical guidance / counselling', maxWords: 300 },
      { key: 'ecfBudget',           label: 'ECF catalyzed and budget handled (CSIR & other agencies)', maxWords: 300 },
      { key: 'strategicSector',     label: 'Participation and contributions made for the strategic sector', maxWords: 300 },
      { key: 'newClients',          label: 'New clients created / added to the organization', maxWords: 300 },
      { key: 'indigenousTech',      label: 'Contribution to indigenous technology / component / product / device / engineering systems design & development', maxWords: 300 },
      { key: 'forexSaving',         label: 'Activities leading to foreign exchange saving', maxWords: 300 },
      { key: 'stCooperation',       label: 'S&T cooperation established with other countries including regional collaboration', maxWords: 300 },
      { key: 'institutionBuilding', label: 'Assistance provided for national / international institution building', maxWords: 300 },
      { key: 'trainingProgrammes',  label: 'National / international training programmes organized', maxWords: 300 },
      { key: 'upliftment',          label: 'Contribution towards upliftment of science & technology in the country', maxWords: 300 },
      { key: 'anyOther',            label: 'Any other point, not covered so far, to complete the spectrum of achievements', maxWords: 300 },
    ],
  },
  sr_b_iv: {
    kind: 'prompts',
    title: 'Section IV',
    hint: 'Provide information on the following lines, whatever applicable, within 300 words each.',
    prompts: sectionIVPrompts(false),
  },
  sr_b_v_lectures: {
    kind: 'table',
    title: 'V.1 Participation / contribution to AcSIR / HRD — lectures delivered',
    columns: [
      { key: 'subject',           label: 'Subject / Course' },
      { key: 'credits',           label: 'Credits' },
      { key: 'students',          label: 'No. of Students' },
      { key: 'lectureHours',      label: 'No. of Lecture Hours' },
      { key: 'practicalSessions', label: 'No. of Practical Sessions' },
    ],
  },
  sr_b_v_teaching: {
    kind: 'prompts',
    title: 'V.2 – V.7 Teaching and student guidance',
    prompts: [
      { key: 'curriculum',       label: 'V.2 Did you have a role in the design of the curriculum of any subject?', maxWords: 100 },
      { key: 'academy',          label: 'V.3 What other contributions have you made to the Academy this year?', maxWords: 150 },
      { key: 'lectureNotes',     label: 'V.4 Did you prepare any lecture notes, tutorials, tests / assignments?', maxWords: 100 },
      { key: 'otherTeaching',    label: 'V.5 Any other responsibility assigned / undertaken, including teaching PG / PhD students', maxWords: 150 },
      { key: 'researchStudents', label: 'V.6 No. of MS (Research) and PhD students guided — state whether in progress or completed / awarded', maxWords: 150 },
      { key: 'pgProjects',       label: 'V.7 Students guided for their project / M.E. / M.Tech. / MBA / MCA etc.', maxWords: 150 },
    ],
  },
  sr_b_vi: {
    kind: 'prompts',
    title: 'Section VI — Recognition',
    hint: 'Provide salient details including the name of the organization and the year of award.',
    prompts: [
      { key: 'fellowships', label: 'Fellowships of professional societies (all-India level selections only, besides international selections)', maxWords: 300 },
      { key: 'awards',      label: 'Prestigious award / recognition received (national & international only; indicate monetary terms where applicable)', maxWords: 300 },
      { key: 'editorship',  label: 'Editorship in reputed journals', maxWords: 300 },
    ],
  },
};

// --- 3. Annexure-II — Director of a CSIR Laboratory / Institute ---

const ANNEXURE_II_SPECS: Record<AnnexureIISectionKey, SectionSpec> = {
  dir_identification: {
    kind: 'fields',
    title: 'Identification Information',
    hint: 'Appendix-A. This information is supplied by the Laboratory / Institute administration.',
    fields: [
      { key: 'name',                    label: 'Name of the Director' },
      { key: 'employeeId',              label: 'Employee ID' },
      { key: 'substantivePosition',     label: 'Substantive position' },
      { key: 'lab',                     label: 'Name of the Lab. / Instt.' },
      { key: 'dob',                     label: 'Date of Birth', type: 'date' },
      { key: 'permanentCouncilServant', label: 'Whether permanent Council servant (Yes / No)' },
      { key: 'dojCsir',                 label: 'Date of Joining CSIR', type: 'date' },
      { key: 'dojPresentPosition',      label: 'Date of joining present position', type: 'date' },
      { key: 'tenureCompletion',        label: 'Date of completion of tenure / superannuation', type: 'date' },
      { key: 'email',                   label: 'Email ID' },
      { key: 'mobile',                  label: 'Mobile No.' },
      { key: 'periodFrom',              label: 'Reporting period from', type: 'date' },
      { key: 'periodTo',                label: 'Reporting period to', type: 'date' },
      { key: 'evaluationType',          label: 'Part year or full year evaluation' },
      { key: 'immovablePropertyReturn', label: 'Annual return on immovable property filed for this period (Yes / No)' },
    ],
  },
  dir_education:  { kind: 'table', title: 'Educational Attainment(s)', columns: EDUCATION_COLUMNS },
  dir_employment: { kind: 'table', title: 'Employment Details',        columns: EMPLOYMENT_COLUMNS },
  dir_leave: {
    kind: 'table',
    title: 'Leave Record',
    hint: 'List all leave for the year being evaluated. The signed hardcopy (Sr. CoA / CoA / AO) is uploaded on the final step as an annexure.',
    columns: LEAVE_COLUMNS,
  },
  dir_qa: {
    kind: 'prompts',
    title: 'A. Strategic positioning of the Laboratory and benchmarking nationally and internationally',
    prompts: [
      { key: 'leadership', label: '1. Leadership role played in strategically positioning the Laboratory nationally and internationally, including efforts towards becoming the global best in certain scientific and technological domains', maxWords: 300, rows: 8 },
      { key: 'roadmap',    label: '2. Roadmap created by the Laboratory / Institute in line with CSIR Vision 2030 and PAB commitments for the next five years', maxWords: 200, rows: 6 },
      { key: 'missions',   label: '3. Major role / participation of the Laboratory / Institute in GOI national missions / programmes / projects during the reporting period', maxWords: 300, rows: 8 },
      { key: 'newDomains', label: '4. New scientific and technological domains introduced in the Laboratory / Institute', maxWords: 300, rows: 6 },
      { key: 'facilities', label: '5. S&T facilities created to leverage cutting-edge R&D activities in the Laboratory / Institute', maxWords: 300, rows: 6 },
    ],
  },
  dir_qb: {
    kind: 'prompts',
    title: 'B. Benchmarking of scientific and technological performance',
    prompts: [
      { key: 'topScientific',    label: '1. Top 10 scientific contributions of the Laboratory / Institute during the reporting period', maxWords: 300, rows: 8 },
      { key: 'topTechnological', label: '2. Top 10 technological contributions of the Laboratory / Institute during the reporting period, along with their socio-economic impact', maxWords: 300, rows: 8 },
      { key: 'topLeadership',    label: '3. Top 5 initiatives / activities / achievements that exemplify your scientific and technological leadership', maxWords: 300, rows: 8 },
    ],
  },
  dir_qc_matrix: {
    kind: 'fields',
    title: 'C. Output / Outcome matrix of the Laboratory / Institute during the reporting period',
    hint: 'Enter counts and values as recorded for the reporting period.',
    fields: [
      { key: 'wosPapers',             label: 'i. Research papers in Web of Science indexed journals' },
      { key: 'patents',               label: 'ii. Patents filed and unique patents granted' },
      { key: 'mous',                  label: 'iii. MOUs signed' },
      { key: 'phds',                  label: 'iv. Ph.D. produced' },
      { key: 'productsDeveloped',     label: 'v. Products / technologies / processes developed' },
      { key: 'productsTransferred',   label: 'vi. Products / technologies / processes transferred to industry above Rs. 10 lakh' },
      { key: 'highValueServices',     label: 'vii. High-value S&T services provided to industry above Rs. 5 lakh' },
      { key: 'industriesApproached',  label: 'viii. Industries that approached the Laboratory for consultancy, technological problem solving and S&T services' },
      { key: 'newProjects',           label: 'ix. Total new projects initiated / started during the year' },
      { key: 'budgetRealized',        label: 'x. Project money / budget realized during the year' },
      { key: 'csirProjects',          label: 'xi. CSIR projects initiated, with total project value' },
      { key: 'govtProjects',          label: 'xii. Government projects initiated, with total project value' },
      { key: 'industryProjects',      label: 'xiii. Industry projects initiated, with total project value' },
      { key: 'internationalProjects', label: 'xiv. International (bilateral / multilateral) projects initiated, with total project value' },
      { key: 'projectsForeclosed',    label: 'xv. Projects foreclosed during the reporting period' },
    ],
  },
  dir_qd: {
    kind: 'prompts',
    title: 'D. Societal interventions and their socio-economic impact',
    prompts: [
      { key: 'topSocietal',      label: '1. Top 5 new societal contributions along with the socio-economic impact during the reporting period (do not repeat information given elsewhere)', maxWords: 300, rows: 8 },
      { key: 'skillDevelopment', label: '2. Skill development initiatives and their socio-economic impact', maxWords: 300, rows: 6 },
    ],
  },
  dir_qe: {
    kind: 'prompts',
    title: 'E. Administrative and financial achievements during the reporting period',
    prompts: [
      { key: 'initiatives', label: 'i. 5 initiatives / activities / achievements that exemplify your administrative and financial leadership and acumen', maxWords: 300, rows: 8 },
      { key: 'manpower',    label: 'ii. Manpower — status of vacancy positions in Group IV, III and II at the start and end of the reporting period', maxWords: 300, rows: 6 },
      { key: 'training',    label: 'iii. Training of manpower in emerging and globally benchmarked domains', maxWords: 300, rows: 6 },
      { key: 'budget',      label: 'iv. Allocation and utilization of budget in the last financial year of the Laboratory / Institute', maxWords: 300, rows: 6 },
    ],
  },
  dir_qf: { kind: 'text', title: 'F. Challenges faced / ease of doing business', maxWords: 300 },
  dir_b_i1: {
    kind: 'table',
    title: 'I.1 Involvement in R&D activities of the Laboratory / Institute',
    columns: [
      { key: 'title',    label: 'Title of Project' },
      { key: 'category', label: 'Project Category' },
      { key: 'agencies', label: 'Participating Agencies' },
      { key: 'role',     label: 'Role as defined in the Project' },
    ],
  },
  dir_b_i2: {
    kind: 'table',
    title: 'I.2 Role in Major Programmes / Facility Creation identified at the National level',
    columns: [
      { key: 'title',        label: 'Title of the Project' },
      { key: 'agency',       label: 'Coordinating Agency' },
      { key: 'contribution', label: 'Specific Contribution' },
    ],
  },
  dir_b_i3: {
    kind: 'text',
    title: 'I.3 Notable contributions',
    hint: 'Up to ten, indicating status — individual achievement, output of team work, collaborative work, etc.',
    maxWords: 150,
  },
  dir_b_ii_journals: {
    kind: 'table',
    title: 'II.1.1 Papers published in SCI journals (reporting year only)',
    hint: 'Indicate the total impact factor and citations of your publications.',
    columns: JOURNAL_COLUMNS,
  },
  dir_b_ii_conferences: { kind: 'table', title: 'II.1.2 Papers published in conference proceedings', columns: CONFERENCE_COLUMNS },
  dir_b_ii_books:       { kind: 'table', title: 'II.1.3 Contribution to books', hint: 'Indicate the total number of chapters and pages.', columns: BOOK_COLUMNS },
  dir_b_ii_institutional: {
    kind: 'text',
    title: 'II.1.4 Institutional publications brought out',
    hint: 'Technical brochures, feasibility reports, training manuals, publicity brochures, organizational plans, annual reports, performance reports, protocols, IPR documents, etc.',
    maxWords: 150,
  },
  dir_b_ii_patents: {
    kind: 'table',
    title: 'II.2 Patents filed and granted during the assessment period',
    hint: 'Indicate national and international patents filed and granted separately.',
    columns: PATENT_COLUMNS,
  },
  dir_b_ii_ecf:           { kind: 'table', title: 'II.3.1 ECF during the reporting period', columns: ECF_COLUMNS },
  dir_b_ii_tech_transfer: { kind: 'table', title: 'II.3.2 Technology / process / know-how transferred, commercialization status', columns: TECH_TRANSFER_COLUMNS },
  dir_b_ii_services:      { kind: 'prompts', title: 'II.3.3 – II.3.6 Services and other financial contribution', prompts: SERVICE_PROMPTS },
  dir_b_ii_tech_dev:      { kind: 'table', title: 'II.4 Technology / process / product development', columns: TECH_DEV_COLUMNS },
  dir_b_iii: {
    kind: 'prompts',
    title: 'Section III',
    hint: 'Provide details on the following, whatever applicable, within 300 words each.',
    prompts: [
      { key: 'budgetEcf',           label: 'Budget handled and ECF catalyzed (CSIR & other agencies)', maxWords: 300 },
      { key: 'newClients',          label: 'New client addition to the organization', maxWords: 300 },
      { key: 'indigenousTech',      label: 'Contribution to indigenous technology / product / device / component / engineering systems design & development', maxWords: 300 },
      { key: 'stCooperation',       label: 'S&T cooperation established with other countries including regional collaboration', maxWords: 300 },
      { key: 'institutionBuilding', label: 'Contribution for national / international institution building', maxWords: 300 },
      { key: 'upliftment',          label: 'Contribution towards upliftment of science & technology in the country', maxWords: 300 },
      { key: 'anyOther',            label: 'Any other point, not covered so far, to complete the spectrum of your achievements', maxWords: 300 },
    ],
  },
  dir_b_iv: {
    kind: 'prompts',
    title: 'Section IV',
    hint: 'Provide information on the following lines, whatever applicable, within 300 words each.',
    prompts: sectionIVPrompts(true),
  },
  dir_b_v: {
    kind: 'prompts',
    title: 'Section V — Recognition and student guidance',
    hint: 'Provide salient details including the name of the organization and the year of award.',
    prompts: [
      { key: 'fellowships',    label: 'Fellowships of professional societies (all-India level selections only, besides international selections)', maxWords: 300 },
      { key: 'awards',         label: 'Prestigious award / recognition received (national & international only; indicate monetary terms where applicable)', maxWords: 300 },
      { key: 'editorship',     label: 'Editorship in reputed journals', maxWords: 300 },
      { key: 'studentsGuided', label: 'No. of Master’s & Ph.D. students guided — state whether in progress or completed / awarded', maxWords: 300 },
      { key: 'pgProjects',     label: 'Students guided for project work / assignments for PG courses such as M.Sc. / M.E. / M.Tech. / MBA / MCA', maxWords: 300 },
    ],
  },
};

export const ANNEXURE_SPECS: Record<SeniorSectionKey, SectionSpec> = {
  ...ANNEXURE_I_SPECS,
  ...ANNEXURE_II_SPECS,
};

// --- 4. Appendix-C — pen picture (behavioural aspects) ---

export interface PenPictureGroup {
  title: string;
  scale: string[];
  rows: FieldSpec[];
}

const FOUR_POINT = ['Excellent', 'Very Good', 'Good', 'Needs to be Improved'];
const INTEGRITY_SCALE = ['Impeccable', 'Beyond Doubt', 'To be Monitored'];
const YES_NO = ['Yes', 'No'];

export const PEN_PICTURE_SPECS: Record<'ANNEXURE_I' | 'ANNEXURE_II', PenPictureGroup[]> = {
  ANNEXURE_I: [
    { title: 'A. Personal Attributes', scale: FOUR_POINT, rows: [
      { key: 'personality',         label: 'Personality' },
      { key: 'initiativeDrive',     label: 'Initiative, drive, networking ability' },
      { key: 'leadershipQualities', label: 'Leadership qualities' },
    ] },
    { title: 'B. Professional Competence', scale: FOUR_POINT, rows: [
      { key: 'orgRolePerception', label: 'Perception of organizational role' },
      { key: 'communication',     label: 'Ability to communicate (both in speech and writing)' },
      { key: 'outOfBox',          label: 'Ability to think out of the box' },
      { key: 'comprehension',     label: 'Comprehension and appreciation of new developments related to the job' },
    ] },
    { title: 'C. Managerial Capabilities', scale: FOUR_POINT, rows: [
      { key: 'responsibility',       label: 'Willingness to accept responsibility' },
      { key: 'decisionMaking',       label: 'Decision making ability' },
      { key: 'crisisHandling',       label: 'Crisis handling' },
      { key: 'managerialLeadership', label: 'Qualities of leadership' },
    ] },
    { title: 'D. Integrity and Ethics', scale: INTEGRITY_SCALE, rows: [
      { key: 'integrity', label: 'Integrity and ethics' },
    ] },
    { title: 'E. Adverse Comment', scale: YES_NO, rows: [
      { key: 'adverseComment', label: 'Any adverse comment (if yes, give details in the evaluation report below)' },
    ] },
  ],
  ANNEXURE_II: [
    { title: 'A. Personal Attributes', scale: FOUR_POINT, rows: [
      { key: 'personality', label: 'Personality' },
      { key: 'innovation',  label: 'Innovation, creativity, initiative and drive' },
    ] },
    { title: 'B. Professional Competence', scale: FOUR_POINT, rows: [
      { key: 'vision',                label: 'Vision' },
      { key: 'organizationalConnect', label: 'Organizational connect' },
      { key: 'goalAchievement',       label: 'Ability to achieve the goal' },
    ] },
    { title: 'C. Managerial Capabilities', scale: FOUR_POINT, rows: [
      { key: 'leadershipQuality', label: 'Leadership quality' },
      { key: 'crisisHandling',    label: 'Crisis handling ability' },
    ] },
    { title: 'D. Integrity and Ethics', scale: INTEGRITY_SCALE, rows: [
      { key: 'integrity', label: 'Integrity and ethics' },
    ] },
    { title: 'E. Adverse Comment', scale: YES_NO, rows: [
      { key: 'adverseComment', label: 'Any adverse comment (if yes, give details in the evaluation report below)' },
    ] },
  ],
};
