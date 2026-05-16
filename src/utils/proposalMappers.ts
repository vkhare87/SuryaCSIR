import type {
  Proposal,
  ProposalCoPI,
  ProposalDocument,
  ProposalStatusEntry,
  ProposalStatus,
  ProposalDocType,
} from '../types/proposal';

export function mapProposalRow(row: any): Proposal {
  return {
    id: row.id,
    proposalCode: row.proposal_code,
    title: row.title,
    acronym: row.acronym,
    domainTheme: row.domain_theme,
    fundType: row.fund_type,
    sponsorType: row.sponsor_type,
    sponsorName: row.sponsor_name,
    projectCategory: row.project_category,
    proposedStartDate: row.proposed_start_date,
    proposedDurationMonths: row.proposed_duration_months,
    requestedBudget: Number(row.requested_budget),
    piUserId: row.pi_user_id,
    piName: row.pi_name,
    divisionCode: row.division_code,
    abstract: row.abstract,
    problemStatement: row.problem_statement,
    objectives: row.objectives,
    expectedOutcomes: row.expected_outcomes,
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
