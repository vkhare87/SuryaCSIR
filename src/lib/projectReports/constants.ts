import type { ProjectReportStatus } from '../../types/projectReport';

export const PR_STATUS_LABELS: Record<ProjectReportStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  REVISION_REQUESTED: 'Revision Requested',
  REVIEWED: 'Reviewed',
};

export const PR_STATUS_VARIANT: Record<ProjectReportStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  REVISION_REQUESTED: 'warning',
  REVIEWED: 'success',
};

export const PR_EDITABLE: ProjectReportStatus[] = ['DRAFT', 'REVISION_REQUESTED'];

export const PERIOD_LABELS: Record<'Q' | 'H' | 'Y', string> = {
  Q: 'Quarterly',
  H: 'Half-yearly',
  Y: 'Yearly',
};
