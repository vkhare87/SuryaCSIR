export type CycleStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';

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

export type CommitteeTier = 'I' | 'II' | 'III';

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

export interface PMSEvaluation {
  id: string;
  reportId: string;
  evaluatorId: string;
  status: EvaluationStatus;
  scores: Record<string, number>;
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

export type SectionKey =
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
