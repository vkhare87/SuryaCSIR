import type { ProposalStatus } from '../../types/proposal';

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW',
  'REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED',
  'APPROVED', 'OM_ISSUED', 'ARCHIVED', 'LINKED',
];

export const TERMINAL_STATUSES: ProposalStatus[] = ['REJECTED', 'ARCHIVED', 'LINKED'];

export const EDITABLE_STATUSES: ProposalStatus[] = ['DRAFT', 'REVISION_REQUESTED'];

// Allowed next statuses for admin transitions (from current status).
// DRAFT and REVISION_REQUESTED transitions are scientist-driven via proposal_submit.
export const NEXT_ADMIN_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: [],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED'],
  REVISION_REQUESTED: [],
  REJECTED: [],
  RECOMMENDED: ['APPROVED'],
  APPROVED: ['OM_ISSUED'],
  OM_ISSUED: ['ARCHIVED', 'LINKED'],
  ARCHIVED: [],
  LINKED: [],
};

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  REVISION_REQUESTED: 'Revision Requested',
  REJECTED: 'Rejected',
  RECOMMENDED: 'Recommended',
  APPROVED: 'Approved',
  OM_ISSUED: 'OM Issued',
  ARCHIVED: 'Archived',
  LINKED: 'Linked to Project',
};

// Tailwind semantic token classes for Badge color
export const STATUS_BADGE_VARIANT: Record<ProposalStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'blue',
  REVISION_REQUESTED: 'amber',
  REJECTED: 'red',
  RECOMMENDED: 'blue',
  APPROVED: 'green',
  OM_ISSUED: 'green',
  ARCHIVED: 'gray',
  LINKED: 'green',
};

export const FUND_TYPES = ['Internal', 'External'] as const;

export const SPONSOR_TYPES = [
  'Government',
  'Industry',
  'International',
  'CSIR-Internal',
  'Other',
] as const;

// Starter list — admin can request additions; promote to DB-backed lookup later.
export const PROJECT_CATEGORIES = [
  'Basic Research',
  'Applied Research',
  'Product Development',
  'Process Development',
  'Consultancy',
  'Sponsored Project',
  'Mission Mode',
  'Other',
] as const;

export const DOMAIN_THEMES = [
  'Advanced Materials',
  'Functional Materials',
  'Structural Materials',
  'Nano Materials',
  'Biomaterials',
  'Energy Materials',
  'Environment & Sustainability',
  'Process Engineering',
  'Other',
] as const;

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = ['application/pdf'] as const;
