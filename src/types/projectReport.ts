export type ProjectReportStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'REVIEWED';

export type ProjectReportPeriod = 'Q' | 'H' | 'Y';

export interface ProjectReport {
  id: string;
  projectNo: string;
  projectName: string;
  divisionCode: string | null;
  periodType: ProjectReportPeriod;
  periodLabel: string;
  dueDate: string | null;
  status: ProjectReportStatus;
  objectivesProgress: string;
  milestones: string;
  expenditureSummary: string;
  outcomes: string;
  remarks: string;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedBy: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
