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

export type ProjectDocType =
  | 'receipt_order' | 'expenditure_statement' | 'milestone_evidence' | 'minutes'
  | 'change_request' | 'change_order' | 'completion_report' | 'closure_order' | 'sanction_order' | 'other';

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
  slots: ReviewSlot[];
  changes: ChangeRequest[];
  completion: CompletionReport | null;
}

export type SlotKind =
  | 'PROGRESS_REPORT' | 'REVIEW_COMMITTEE' | 'RESEARCH_COUNCIL' | 'TASK_FORCE'
  | 'MONITORING_COMMITTEE' | 'STAGE_GATE' | 'CALLED_REVIEW';

export type ReviewDecision =
  | 'CONTINUE' | 'CONTINUE_WITH_CHANGES' | 'HOLD' | 'FORECLOSURE_RECOMMENDED'
  | 'GO' | 'CONDITIONAL_GO' | 'KILL' | 'RECYCLE';

/** One review or progress report a project owes (project_review_slots). */
export interface ReviewSlot {
  id: string;
  kind: SlotKind;
  body: string;
  periodLabel: string;
  dueDate: string;
  generated: boolean;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  meetingId: string | null;
  heldOn: string | null;
  decision: ReviewDecision | null;
  outcome: string | null;
  minutesDue: string | null;
  minutesDocumentId: string | null;
  reportId: string | null;
  notes: string | null;
}

/** One row of the project_portfolio view. */
export interface PortfolioRow {
  projectId: string;
  projectNo: string;
  projectName: string;
  divisionCode: string;
  piName: string;
  stage: string;
  track: string | null;
  startDate: string | null;
  endDate: string | null;
  sanctionedCost: number | null;
  elapsedPct: number | null;
  received: number;
  spent: number;
  milestonesTotal: number;
  milestonesAchieved: number;
  overdue: number;
  minutesOverdue: number;
  nextDue: string | null;
  lastReportOn: string | null;
  lastDecision: ReviewDecision | null;
}

export interface DueSlot {
  slotId: string;
  projectId: string;
  projectNo: string;
  kind: SlotKind;
  body: string;
  periodLabel: string;
  dueDate: string;
}

export type ChangeKind = 'TIME_OVERRUN' | 'RCE' | 'REPHASING' | 'REAPPROPRIATION' | 'REALLOCATION' | 'FORECLOSURE';
export type ChangeStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'RETURNED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type ChangeStepKind =
  | 'PME_VETTING' | 'FINANCE' | 'REVIEW_COMMITTEE' | 'RESEARCH_COUNCIL' | 'DIRECTOR_APPROVAL'
  | 'DIRECTOR_FORWARD' | 'MONITORING_COMMITTEE' | 'REVISED_COST_COMMITTEE' | 'COMPETENT_AUTHORITY';
export type ChangeStepStatus = 'PENDING' | 'DONE' | 'RETURNED' | 'REJECTED' | 'SKIPPED';

export interface RephaseMove { head: string; from_year: string; to_year: string; amount: number }
export interface ReappropriationMove { fiscal_year: string; from_head: string; to_head: string; amount: number }
export interface ChangeLine { fiscal_year: string; head: string; amount: number }

/** Payload by kind; mirrors the comment on project_change_requests.payload (20261112000001). */
export interface ChangePayload {
  new_end_date?: string;
  lines?: ChangeLine[];
  moves?: (RephaseMove | ReappropriationMove)[];
  lab?: string;
  direction?: 'OUT' | 'IN';
  effective_date?: string;
  cost_benefit?: string;
}

export interface ChangeStep {
  id: string;
  round: number;
  seq: number;
  kind: ChangeStepKind;
  status: ChangeStepStatus;
  decidedAt: string | null;
  notes: string | null;
  documentId: string | null;
}

export interface ChangeRequest {
  id: string;
  kind: ChangeKind;
  status: ChangeStatus;
  round: number;
  justification: string;
  payload: ChangePayload;
  increasePct: number | null;
  orderNo: string | null;
  orderDate: string | null;
  ifdFileNo: string | null;
  decisionNote: string | null;
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Steps of the current round, in order. */
  steps: ChangeStep[];
}

export interface MyChangeStep {
  stepId: string;
  changeId: string;
  projectId: string;
  projectNo: string;
  changeKind: ChangeKind;
  stepKind: ChangeStepKind;
  submittedAt: string | null;
}

export type ObjectivesStatus = 'MET' | 'PARTLY_MET' | 'NOT_MET';
export type CompletionStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'RETURNED' | 'APPROVED';

/** The lesson fields (plan §5.4); also the shape project_completion_save takes. */
export interface CompletionFields {
  summary: string;
  objectives_status: ObjectivesStatus | null;
  objectives_reason: string;
  what_worked: string;
  what_did_not: string;
  reusable_assets: string;
  trl_target: number | null;
  trl_reached: number | null;
  recommendations: string;
  follow_on_ideas: string;
}

export interface FinancialStatement {
  heads: { fiscal_year: string; head: string; sanctioned: number; spent: number }[];
  received: { fiscal_year: string; amount: number }[];
  sanctioned: number;
  received_total: number;
  spent_total: number;
}

export interface Annexure { group: string; label: string; date: string | null; document_id?: string | null; missing: boolean }

export interface CompletionStep {
  id: string;
  round: number;
  seq: number;
  kind: ChangeStepKind;
  status: 'PENDING' | 'DONE' | 'RETURNED' | 'SKIPPED';
  notes: string | null;
}

export interface CompletionReport extends CompletionFields {
  id: string;
  status: CompletionStatus;
  round: number;
  financialStatement: FinancialStatement | null;
  annexures: Annexure[];
  decisionNote: string | null;
  publishedDocumentId: string | null;
  createdBy: string;
  submittedAt: string | null;
  decidedAt: string | null;
  steps: CompletionStep[];
}

export interface Lesson extends CompletionFields {
  projectId: string;
  projectNo: string;
  projectName: string;
  divisionCode: string | null;
  piName: string | null;
  track: string | null;
  stage: string | null;
  endDate: string | null;
  approvedAt: string | null;
}

export interface ClosureItem {
  item: 'step' | 'due';
  projectId: string;
  projectNo: string;
  stepId: string | null;
  stepKind: ChangeStepKind | null;
  endDate: string | null;
}
