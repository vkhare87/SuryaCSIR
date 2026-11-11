export interface ProjectReceipt {
  id: string;
  receivedOn: string;
  fiscalYear: string;
  /** Negative on a reversal entry. */
  amount: number;
  head: string | null;
  source: string;
  orderNo: string;
  orderDate: string | null;
  ifdFileNo: string | null;
  ifdDate: string | null;
  documentId: string | null;
  notes: string | null;
  reversesId: string | null;
  recordedAt: string;
}

export type ExpenditurePeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'FY';

export interface ProjectExpenditure {
  id: string;
  fiscalYear: string;
  period: ExpenditurePeriod;
  head: string;
  amount: number;
  documentId: string | null;
  notes: string | null;
  reversesId: string | null;
  recordedAt: string;
}

export type MilestoneStatus = 'PROPOSED' | 'PLANNED' | 'REPORTED' | 'ACHIEVED' | 'DROPPED';

export interface ProjectMilestone {
  id: string;
  title: string;
  targetDate: string;
  status: MilestoneStatus;
  achievedOn: string | null;
  reportNote: string | null;
  documentId: string | null;
  decisionNote: string | null;
}

export type ProjectDocType = 'receipt_order' | 'expenditure_statement' | 'milestone_evidence' | 'other';

export interface ProjectDocument {
  id: string;
  docType: ProjectDocType;
  storagePath: string;
  fileName: string;
  uploadedAt: string;
}

export interface ProjectEvent {
  id: number;
  at: string;
  kind: string;
  summary: string;
}

export interface ProjectBudgetLine {
  fiscalYear: string;
  head: string;
  item: string;
  amount: number;
}

/** Everything the project page shows beyond the project row itself. */
export interface ProjectFile {
  budgetLines: ProjectBudgetLine[];
  receipts: ProjectReceipt[];
  expenditure: ProjectExpenditure[];
  milestones: ProjectMilestone[];
  documents: ProjectDocument[];
  events: ProjectEvent[];
}
