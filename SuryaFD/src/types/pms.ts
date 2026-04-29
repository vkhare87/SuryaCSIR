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
  | 'UNDER_COLLEGIUM_REVIEW'
  | 'CHAIRMAN_REVIEW'
  | 'EMPOWERED_COMMITTEE_REVIEW'
  | 'FINALIZED';

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

export type CollegiumMemberRole = 'CHAIRMAN' | 'MEMBER';

export interface PMSCollegium {
  id: string;
  name: string;
  description: string | null;
  cycleId: string;
  createdAt: string;
  members?: PMSCollegiumMember[];
}

export interface PMSCollegiumMember {
  id: string;
  collegiumId: string;
  userId: string;
  role: CollegiumMemberRole;
  userName?: string;
  userEmail?: string;
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
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMSChairmanReview {
  id: string;
  reportId: string;
  chairmanId: string;
  recommendedMin: number | null;
  recommendedMax: number | null;
  comments: string | null;
  createdAt: string;
}

export interface PMSCommitteeDecision {
  id: string;
  reportId: string;
  decidedBy: string;
  finalScore: number | null;
  justification: string;
  createdAt: string;
}

export type NotificationType =
  | 'assigned_evaluator'
  | 'chairman_review_needed'
  | 'committee_review_needed'
  | 'report_finalized';

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
  | 'section_vi_national'
  | 'section_vi_international';
