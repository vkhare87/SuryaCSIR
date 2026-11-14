export type CycleStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';

export type PmsTrack = 'STANDARD' | 'ANNEXURE_I' | 'ANNEXURE_II';

export interface AppraisalCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CycleStatus;
  createdAt: string;
}

export type ReportStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_EVALUATION_COMMITTEE_REVIEW'
  | 'EMPOWERED_COMMITTEE_REVIEW'
  | 'FINALIZED'
  | 'NOT_ASSESSED'
  | 'UNDER_GRIEVANCE_REVIEW';

export interface PMSReport {
  id: string;
  cycleId: string;
  scientistId: string;
  status: ReportStatus;
  track: PmsTrack;
  periodFrom: string | null;
  periodTo: string | null;
  selfScore: number | null;
  submittedAt: string | null;
  signatureUrl: string | null;
  previousPmsSubmittedOnTime: boolean | null;
  previousPmsSubmissionDate: string | null;
  dutyDays: number | null;
  systemRemark: string | null;
  scoreCommunicatedAt: string | null;
  nonSubmissionCertificatePath: string | null;
  /** 'LEGACY' keeps the old layout and one score per member; '2026' is the 2026 proforma (20261112000018). */
  proformaVersion: 'LEGACY' | '2026';
  /** The Evaluation Committee the report was sent to. */
  committeeId: string | null;
  /** Pay Level 13 and above answers Questionnaire B. */
  questionnaireB: boolean;
  /** Set 15 days after the score is communicated when no representation was made. */
  deemedAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  cycle?: AppraisalCycle;
}

export interface PMSReportSection {
  id: string;
  reportId: string;
  sectionKey: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface PMSAnnexure {
  id: string;
  reportId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export type CommitteeTier = 'I' | 'II' | 'III' | 'IV';

export type CommitteeMemberRole =
  | 'REPORTING_OFFICER'
  | 'REVIEWING_OFFICER'
  | 'EC_MEMBER';

export interface PMSEvaluationCommittee {
  id: string;
  name: string;
  description: string | null;
  cycleId: string;
  tier: CommitteeTier | null;
  createdAt: string;
  members?: PMSEvaluationCommitteeMember[];
}

export interface PMSEvaluationCommitteeMember {
  id: string;
  committeeId: string;
  userId: string;
  role: CommitteeMemberRole;
  userName?: string;
  userEmail?: string;
}

export interface PMSEmpoweredCommitteeMember {
  id: string;
  cycleId: string;
  userId: string;
  isChairman: boolean;
}

export interface PMSGrievanceMember {
  id: string;
  cycleId: string;
  userId: string;
}

export interface PMSAuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type EvaluationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

/** Appendix-C behavioural ratings for the senior tracks — no 0-100 score. */
export interface PenPicture {
  ratings: Record<string, string>;
  narrative: string;
}

export interface PMSEvaluation {
  id: string;
  reportId: string;
  evaluatorId: string;
  status: EvaluationStatus;
  scores: Record<string, number>;
  penPicture: PenPicture | null;
  totalScore: number | null;
  reasonsForOutstanding: string | null;
  reasonsBelowThreshold: string | null;
  suggestionsForImprovement: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMSCommitteeDecision {
  id: string;
  reportId: string;
  decidedBy: string;
  finalScore: number | null;
  justification: string;
  reasonsForOutstanding: string | null;
  reasonsBelowThreshold: string | null;
  suggestionsForImprovement: string | null;
  createdAt: string;
}

export interface PMSAWPActivity {
  id: string;
  reportId: string;
  natureOfActivity: string;
  role: string;
  timeCommittedPercentage: number;
  milestones: string[];
  createdAt: string;
  updatedAt: string;
}

export type RepresentationStatus = 'PENDING' | 'RESOLVED';

export interface PMSRepresentation {
  id: string;
  reportId: string;
  scientistId: string;
  grounds: string;
  submittedAt: string;
  status: RepresentationStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export type NotificationType =
  | 'assigned_evaluator'
  | 'committee_review_needed'
  | 'report_finalized'
  | 'report_not_assessed'
  | 'non_submission_flagged'
  | 'representation_submitted'
  | 'representation_resolved';

export interface PMSNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  reportId: string | null;
  read: boolean;
  createdAt: string;
}

export type StandardSectionKey =
  | 'summary'
  | 'section_i1'
  | 'section_i2'
  | 'section_i3'
  | 'section_i4'
  | 'section_i5'
  | 'section_ii'
  | 'section_iii'
  | 'section_iv'
  | 'section_v_curriculum'
  | 'section_v_extension'
  | 'section_v_other'
  | 'section_v_shortfall'
  | 'section_vi_national'
  | 'section_vi_international';

/** Annexure-I — Chief Scientist / Outstanding Scientist / Distinguished Scientist. */
export type AnnexureISectionKey =
  | 'sr_identification'
  | 'sr_education'
  | 'sr_employment'
  | 'sr_leave'
  | 'sr_questionnaire'
  | 'sr_b_i1'
  | 'sr_b_i2'
  | 'sr_b_i3'
  | 'sr_b_i4'
  | 'sr_b_ii_journals'
  | 'sr_b_ii_conferences'
  | 'sr_b_ii_books'
  | 'sr_b_ii_institutional'
  | 'sr_b_ii_patents'
  | 'sr_b_ii_ecf'
  | 'sr_b_ii_tech_transfer'
  | 'sr_b_ii_services'
  | 'sr_b_ii_tech_dev'
  | 'sr_b_iii'
  | 'sr_b_iv'
  | 'sr_b_v_lectures'
  | 'sr_b_v_teaching'
  | 'sr_b_vi';

/** Annexure-II — Director of a CSIR Laboratory/Institute. */
export type AnnexureIISectionKey =
  | 'dir_identification'
  | 'dir_education'
  | 'dir_employment'
  | 'dir_leave'
  | 'dir_qa'
  | 'dir_qb'
  | 'dir_qc_matrix'
  | 'dir_qd'
  | 'dir_qe'
  | 'dir_qf'
  | 'dir_b_i1'
  | 'dir_b_i2'
  | 'dir_b_i3'
  | 'dir_b_ii_journals'
  | 'dir_b_ii_conferences'
  | 'dir_b_ii_books'
  | 'dir_b_ii_institutional'
  | 'dir_b_ii_patents'
  | 'dir_b_ii_ecf'
  | 'dir_b_ii_tech_transfer'
  | 'dir_b_ii_services'
  | 'dir_b_ii_tech_dev'
  | 'dir_b_iii'
  | 'dir_b_iv'
  | 'dir_b_v';

export type SeniorSectionKey = AnnexureISectionKey | AnnexureIISectionKey;

/** 2026 proforma sections (src/lib/pms/proforma2026.ts). */
export type P2026SectionKey =
  | 'p26_part1' | 'p26_education' | 'p26_employment' | 'p26_leave' | 'p26_qa' | 'p26_qb'
  | 'p26_i1' | 'p26_i2' | 'p26_i3' | 'p26_i4' | 'p26_i5'
  | 'p26_ii_journals' | 'p26_ii_conferences' | 'p26_ii_books' | 'p26_ii_institutional'
  | 'p26_ii_patents' | 'p26_ii_ecf' | 'p26_ii_tech_transfer' | 'p26_ii_services' | 'p26_ii_tech_dev'
  | 'p26_iii' | 'p26_iv' | 'p26_v';

export type SectionKey = StandardSectionKey | SeniorSectionKey | P2026SectionKey;

// --- Part V — Annual Work Plan (pms_awps) ---

export type AWPStatus = 'DRAFT' | 'WITH_RO' | 'WITH_RVO' | 'WITH_DIRECTOR' | 'RETURNED' | 'APPROVED';
export type AWPProjectKind = 'CSIR' | 'EXTERNAL' | 'LAB_MANDATE' | 'OTHER';
export type AWPVerdict = 'REASONABLE' | 'NOT_REASONABLE';

export interface AWPActivityRow {
  label: string;
  role: string;
  timePct: number;
}

export interface AWPProject {
  kind: AWPProjectKind;
  details: string;
  objectives: string;
  resources: string;
  confidential: boolean;
}

export interface AWPPartA {
  name: string;
  employeeId: string;
  group: string;
  designation: string;
  division: string;
  dob: string;
  dojCsir: string;
  dojGrade: string;
  category: string;
  email: string;
  mobile: string;
  reportingOfficer: string;
  reviewingOfficer: string;
  prevPmsOnTime: boolean | null;
  prevPmsDate: string;
}

export interface AWPObjectives {
  projectDetails: string;
  hrd: string;
  processes: string;
  patents: string;
  publications: string;
  other: string;
}

export interface AWPDevelopment {
  fellowships: string;
  training: string;
  academic: string;
  other: string;
}

export interface AWPContent {
  partA: AWPPartA;
  activitySplit: AWPActivityRow[];
  projects: AWPProject[];
  objectives: AWPObjectives;
  development: AWPDevelopment;
  institutionalWork: string;
  other: string;
}

export interface PMSAWP extends AWPContent {
  id: string;
  staffId: string;
  scientistUserId: string | null;
  reportingYear: string;
  status: AWPStatus;
  reportingOfficerId: string | null;
  reviewingOfficerId: string | null;
  roVerdict: AWPVerdict | null;
  roReasons: string | null;
  roAt: string | null;
  rvoRemarks: string | null;
  rvoAt: string | null;
  directorDecision: 'ACCEPTED' | 'MODIFIED' | null;
  directorRemarks: string | null;
  approvedAt: string | null;
  communicatedAt: string | null;
  returnReasons: string | null;
  source: 'ONLINE' | 'IMPORTED' | 'BLANK_FORWARDED';
  sourcePdfPath: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMSAWPRevision {
  id: string;
  awpId: string;
  initiatedBy: string;
  reasons: string;
  before: AWPContent;
  after: AWPContent;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionRemarks: string | null;
  createdAt: string;
}

// --- Enterprise P4: the 2026 assessment ---

/** Part I pre-filled by Establishment (pms_part1). */
export interface PmsPart1 {
  reportId: string;
  data: Record<string, string>;
  prefilledAt: string | null;
  discrepancy: string | null;
  verifiedAt: string | null;
}

export type ReportItemSection = 'PROJECT' | 'OUTPUT' | 'IP' | 'TECH_TRANSFER' | 'STUDENT' | 'COMMITTEE' | 'OTHER';
export type ReportItemState = 'PREFILLED' | 'CONFIRMED' | 'EDITED' | 'ADDED' | 'REMOVED';

/** One line of the self-appraisal, from the records or added by the scientist. */
export interface PmsReportItem {
  id: string;
  section: ReportItemSection;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  link: string | null;
  text: string;
  state: ReportItemState;
}

/** The Evaluation Committee's single panel score (pms_panel_scores). */
export interface PmsPanelScore {
  reportId: string;
  score: number;
  reasonsForOutstanding: string | null;
  reasonsBelowThreshold: string | null;
  suggestionsForImprovement: string | null;
  integrity: string;
  adverseRemarks: string | null;
  criticalAssessment: string | null;
  quorumPresent: number;
  membersTotal: number;
  recordedAt: string;
}

export type EcAction = 'CONCUR' | 'UPGRADE' | 'DOWNGRADE';

/** One step of the Annexure-B timeline (pms_timeline_status). */
export interface TimelineStep { step: number; label: string; due: string | null; done: number; pending: number; overdue: number }

/** One late report (pms_delay_report). */
export interface DelayRow { reportId: string; scientist: string; status: string; step: number; due: string; daysLate: number }

/** One cycle of a scientist's PMS record (pms_score_history). */
export interface ScoreHistoryRow { cycleId: string; cycle: string; score: number; grade: string; labAverage: number | null; normalised: number | null; remarks: string }
