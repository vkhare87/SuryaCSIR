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

export type SectionKey = StandardSectionKey | SeniorSectionKey;
