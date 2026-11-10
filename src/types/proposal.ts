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
  /** project_schemes.code — 'ULIP' | 'HQ'. */
  track: string | null;
  /** The version the reviewers were given; set by proposal_submit. */
  submittedVersionId: string | null;

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

/** A PI's private note on a proposal. Never shown to anyone else. */
export interface ProposalNote {
  id: string;
  proposalId: string;
  body: string;
  /** The proposal field this note was moved into, if any. */
  usedIn: NoteTarget | null;
  usedAt: string | null;
  createdAt: string;
}

export type NoteTarget = 'abstract' | 'problemStatement' | 'objectives' | 'expectedOutcomes';

export interface ProposalVersion {
  id: string;
  proposalId: string;
  versionNo: number;
  label: string;
  kind: 'manual' | 'submitted';
  createdAt: string;
  /** The proposal as it stood, co-PIs included. */
  proposal: Proposal;
}
