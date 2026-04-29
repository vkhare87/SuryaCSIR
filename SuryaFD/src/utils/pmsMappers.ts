import type {
  AppraisalCycle,
  PMSReport,
  PMSReportSection,
  PMSAnnexure,
  PMSCollegium,
  PMSCollegiumMember,
  PMSEvaluation,
  PMSChairmanReview,
  PMSCommitteeDecision,
  PMSNotification,
} from '../types/pms';

export function mapCycleRow(row: Record<string, unknown>): AppraisalCycle {
  return {
    id:        row.id as string,
    name:      row.name as string,
    startDate: row.start_date as string,
    endDate:   row.end_date as string,
    status:    row.status as AppraisalCycle['status'],
    createdAt: row.created_at as string,
  };
}

export function mapReportRow(row: Record<string, unknown>): PMSReport {
  return {
    id:           row.id as string,
    cycleId:      row.cycle_id as string,
    scientistId:  row.scientist_id as string,
    status:       row.status as PMSReport['status'],
    periodFrom:   (row.period_from as string) ?? null,
    periodTo:     (row.period_to as string) ?? null,
    selfScore:    row.self_score != null ? Number(row.self_score) : null,
    submittedAt:  (row.submitted_at as string) ?? null,
    signatureUrl: (row.signature_url as string) ?? null,
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
  };
}

export function mapSectionRow(row: Record<string, unknown>): PMSReportSection {
  return {
    id:         row.id as string,
    reportId:   row.report_id as string,
    sectionKey: row.section_key as string,
    data:       (row.data as Record<string, unknown>) ?? {},
    updatedAt:  row.updated_at as string,
  };
}

export function mapAnnexureRow(row: Record<string, unknown>): PMSAnnexure {
  return {
    id:         row.id as string,
    reportId:   row.report_id as string,
    fileName:   row.file_name as string,
    filePath:   row.file_path as string,
    fileSize:   Number(row.file_size),
    mimeType:   row.mime_type as string,
    uploadedAt: row.uploaded_at as string,
  };
}

export function mapCollegiumRow(row: Record<string, unknown>): PMSCollegium {
  return {
    id:          row.id as string,
    name:        row.name as string,
    description: (row.description as string) ?? null,
    cycleId:     row.cycle_id as string,
    createdAt:   row.created_at as string,
  };
}

export function mapCollegiumMemberRow(row: Record<string, unknown>): PMSCollegiumMember {
  return {
    id:          row.id as string,
    collegiumId: row.collegium_id as string,
    userId:      row.user_id as string,
    role:        row.role as PMSCollegiumMember['role'],
    userName:    (row.user_name as string) ?? undefined,
    userEmail:   (row.user_email as string) ?? undefined,
  };
}

export function mapEvaluationRow(row: Record<string, unknown>): PMSEvaluation {
  return {
    id:          row.id as string,
    reportId:    row.report_id as string,
    evaluatorId: row.evaluator_id as string,
    status:      row.status as PMSEvaluation['status'],
    scores:      (row.scores as Record<string, number>) ?? {},
    comments:    (row.comments as string) ?? null,
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  };
}

export function mapChairmanReviewRow(row: Record<string, unknown>): PMSChairmanReview {
  return {
    id:             row.id as string,
    reportId:       row.report_id as string,
    chairmanId:     row.chairman_id as string,
    recommendedMin: row.recommended_min != null ? Number(row.recommended_min) : null,
    recommendedMax: row.recommended_max != null ? Number(row.recommended_max) : null,
    comments:       (row.comments as string) ?? null,
    createdAt:      row.created_at as string,
  };
}

export function mapCommitteeDecisionRow(row: Record<string, unknown>): PMSCommitteeDecision {
  return {
    id:            row.id as string,
    reportId:      row.report_id as string,
    decidedBy:     row.decided_by as string,
    finalScore:    row.final_score != null ? Number(row.final_score) : null,
    justification: row.justification as string,
    createdAt:     row.created_at as string,
  };
}

export function mapNotificationRow(row: Record<string, unknown>): PMSNotification {
  return {
    id:        row.id as string,
    userId:    row.user_id as string,
    type:      row.type as PMSNotification['type'],
    title:     row.title as string,
    body:      row.body as string,
    reportId:  (row.report_id as string) ?? null,
    read:      Boolean(row.read),
    createdAt: row.created_at as string,
  };
}
