import type {
  Proposal,
  ProposalCoPI,
  ProposalDocument,
  ProposalStatusEntry,
  ProposalStatus,
  ProposalDocType,
  ProposalNote,
  ProposalVersion,
  NoteTarget,
  ProposalBudgetLine,
  ReviewStep,
  ReviewComment,
} from '../types/proposal';

export function mapProposalRow(row: any): Proposal {
  return {
    id: row.id,
    proposalCode: row.proposal_code,
    title: row.title,
    acronym: row.acronym,
    // Optional until submit (20261110000003): a title-only draft has NULLs here.
    domainTheme: row.domain_theme ?? '',
    fundType: row.fund_type ?? '',
    sponsorType: row.sponsor_type ?? '',
    sponsorName: row.sponsor_name ?? '',
    projectCategory: row.project_category ?? '',
    proposedStartDate: row.proposed_start_date ?? '',
    proposedDurationMonths: row.proposed_duration_months ?? 0,
    requestedBudget: Number(row.requested_budget ?? 0),
    piUserId: row.pi_user_id,
    piName: row.pi_name,
    divisionCode: row.division_code ?? '',
    abstract: row.abstract ?? '',
    problemStatement: row.problem_statement ?? '',
    objectives: row.objectives ?? '',
    expectedOutcomes: row.expected_outcomes ?? '',
    currentTrl: row.current_trl,
    targetTrl: row.target_trl,
    status: row.status as ProposalStatus,
    reviewBody: row.review_body,
    reviewSentDate: row.review_sent_date,
    revisionNotes: row.revision_notes,
    rejectionReason: row.rejection_reason,
    sanctionedAmount: row.sanctioned_amount === null ? null : Number(row.sanctioned_amount),
    sanctionDate: row.sanction_date,
    omNumber: row.om_number,
    omDate: row.om_date,
    linkedProjectNo: row.linked_project_no,
    archived: !!row.archived,
    track: row.track ?? null,
    categoryCode: row.category_code ?? null,
    projectId: row.project_id ?? null,
    submittedVersionId: row.submitted_version_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    createdBy: row.created_by,
    lastStatusChangeBy: row.last_status_change_by,
    lastStatusChangeAt: row.last_status_change_at,
  };
}

export function mapCoPIRow(row: any): ProposalCoPI {
  return { staffId: row.staff_id, staffName: row.staff_name };
}

export function mapDocumentRow(row: any): ProposalDocument {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    docType: row.doc_type as ProposalDocType,
    storagePath: row.storage_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
  };
}

export function mapHistoryRow(row: any): ProposalStatusEntry {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    payload: row.payload,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  };
}

const PATCH_COLUMNS: Partial<Record<keyof Proposal, string>> = {
  title: 'title', acronym: 'acronym', track: 'track', categoryCode: 'category_code', domainTheme: 'domain_theme', fundType: 'fund_type',
  sponsorType: 'sponsor_type', sponsorName: 'sponsor_name', projectCategory: 'project_category',
  proposedStartDate: 'proposed_start_date', proposedDurationMonths: 'proposed_duration_months',
  requestedBudget: 'requested_budget', piName: 'pi_name', divisionCode: 'division_code',
  abstract: 'abstract', problemStatement: 'problem_statement', objectives: 'objectives',
  expectedOutcomes: 'expected_outcomes', currentTrl: 'current_trl', targetTrl: 'target_trl',
};

// Columns that are NULL, not '', when empty: a date or number column rejects ''.
const NULL_WHEN_EMPTY = new Set(['proposed_start_date', 'proposed_duration_months', 'track', 'acronym', 'category_code', 'project_category']);

/** The draft's editable fields as a database row patch. Anything else in the input is ignored. */
export function toProposalRowPatch(patch: Partial<Proposal>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    const column = PATCH_COLUMNS[field as keyof Proposal];
    if (!column) continue;
    row[column] = NULL_WHEN_EMPTY.has(column) && (value === '' || value === 0) ? null : value;
  }
  return row;
}

const NOTE_TARGET_COLUMN: Record<NoteTarget, string> = {
  abstract: 'abstract', problemStatement: 'problem_statement',
  objectives: 'objectives', expectedOutcomes: 'expected_outcomes',
};
const NOTE_TARGET_FIELD = Object.fromEntries(
  Object.entries(NOTE_TARGET_COLUMN).map(([field, column]) => [column, field]),
) as Record<string, NoteTarget>;

export const noteTargetColumn = (target: NoteTarget) => NOTE_TARGET_COLUMN[target];

export function mapNoteRow(row: any): ProposalNote {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    body: row.body,
    usedIn: row.used_in ? NOTE_TARGET_FIELD[row.used_in] ?? null : null,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export function mapVersionRow(row: any): ProposalVersion {
  const proposal = mapProposalRow(row.snapshot?.proposal ?? {});
  proposal.coPIs = (row.snapshot?.copis ?? []).map(mapCoPIRow);
  return {
    id: row.id,
    proposalId: row.proposal_id,
    versionNo: row.version_no,
    label: row.label,
    kind: row.kind,
    createdAt: row.created_at,
    proposal,
  };
}

export function mapBudgetLineRow(row: any): ProposalBudgetLine {
  return { id: row.id, fiscalYear: row.fiscal_year, head: row.head, item: row.item ?? '', amount: Number(row.amount) };
}

export function mapReviewStepRow(row: any): ReviewStep {
  return {
    id: row.id, round: row.round, seq: row.seq, kind: row.kind, status: row.status,
    decidedBy: row.decided_by, decidedAt: row.decided_at, notes: row.notes, documentId: row.document_id,
  };
}

export function mapReviewCommentRow(row: any): ReviewComment {
  return {
    id: row.id, section: row.section, body: row.body, authorId: row.author_id,
    createdAt: row.created_at, resolvedAt: row.resolved_at,
  };
}
