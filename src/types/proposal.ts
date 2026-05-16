export type ProposalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'REJECTED'
  | 'RECOMMENDED'
  | 'APPROVED'
  | 'OM_ISSUED'
  | 'ARCHIVED'
  | 'LINKED';

export type ProposalDocType = 'signed_proposal' | 'om_document';

export interface ProposalCoPI {
  staffId: string;
  staffName: string;
}

export interface ProposalDocument {
  id: string;
  proposalId: string;
  docType: ProposalDocType;
  storagePath: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ProposalStatusEntry {
  id: number;
  proposalId: string;
  fromStatus: ProposalStatus | null;
  toStatus: ProposalStatus;
  payload: Record<string, unknown> | null;
  changedBy: string;
  changedAt: string;
}

export interface Proposal {
  id: string;
  proposalCode: string;

  title: string;
  acronym: string | null;
  domainTheme: string;
  fundType: string;
  sponsorType: string;
  sponsorName: string;
  projectCategory: string;
  proposedStartDate: string;
  proposedDurationMonths: number;
  requestedBudget: number;
  piUserId: string;
  piName: string;
  divisionCode: string;
  abstract: string;
  problemStatement: string;
  objectives: string;
  expectedOutcomes: string;
  currentTrl: number | null;
  targetTrl: number | null;

  status: ProposalStatus;

  reviewBody: string | null;
  reviewSentDate: string | null;
  revisionNotes: string | null;
  rejectionReason: string | null;
  sanctionedAmount: number | null;
  sanctionDate: string | null;
  omNumber: string | null;
  omDate: string | null;

  linkedProjectNo: string | null;
  archived: boolean;

  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  createdBy: string;
  lastStatusChangeBy: string | null;
  lastStatusChangeAt: string | null;

  // Eager-loaded children (populated by mappers when present)
  coPIs?: ProposalCoPI[];
  documents?: ProposalDocument[];
  history?: ProposalStatusEntry[];
}
