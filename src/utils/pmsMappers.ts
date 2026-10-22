import type {
  AppraisalCycle,
  PenPicture,
  PmsTrack,
  PMSReport,
  PMSReportSection,
  PMSAnnexure,
  PMSEvaluationCommittee,
  PMSEvaluationCommitteeMember,
  PMSEmpoweredCommitteeMember,
  PMSGrievanceMember,
  PMSEvaluation,
  PMSCommitteeDecision,
  PMSAWPActivity,
  PMSAWP,
  PMSAWPRevision,
  AWPContent,
  PMSRepresentation,
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
    track:        (row.track as PmsTrack) ?? 'STANDARD',
    periodFrom:   (row.period_from as string) ?? null,
    periodTo:     (row.period_to as string) ?? null,
    selfScore:    row.self_score != null ? Number(row.self_score) : null,
    submittedAt:  (row.submitted_at as string) ?? null,
    signatureUrl: (row.signature_url as string) ?? null,
    previousPmsSubmittedOnTime: (row.previous_pms_submitted_on_time as boolean) ?? null,
    previousPmsSubmissionDate:  (row.previous_pms_submission_date as string) ?? null,
    dutyDays:     row.duty_days != null ? Number(row.duty_days) : null,
    systemRemark: (row.system_remark as string) ?? null,
    scoreCommunicatedAt: (row.score_communicated_at as string) ?? null,
    nonSubmissionCertificatePath: (row.non_submission_certificate_path as string) ?? null,
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

export function mapCommitteeRow(row: Record<string, unknown>): PMSEvaluationCommittee {
  return {
    id:          row.id as string,
    name:        row.name as string,
    description: (row.description as string) ?? null,
    cycleId:     row.cycle_id as string,
    tier:        (row.tier as PMSEvaluationCommittee['tier']) ?? null,
    createdAt:   row.created_at as string,
  };
}

export function mapCommitteeMemberRow(row: Record<string, unknown>): PMSEvaluationCommitteeMember {
  return {
    id:          row.id as string,
    committeeId: row.committee_id as string,
    userId:      row.user_id as string,
    role:        row.role as PMSEvaluationCommitteeMember['role'],
    userName:    (row.user_name as string) ?? undefined,
    userEmail:   (row.user_email as string) ?? undefined,
  };
}

export function mapEmpoweredMemberRow(row: Record<string, unknown>): PMSEmpoweredCommitteeMember {
  return {
    id:         row.id as string,
    cycleId:    row.cycle_id as string,
    userId:     row.user_id as string,
    isChairman: Boolean(row.is_chairman),
  };
}

export function mapGrievanceMemberRow(row: Record<string, unknown>): PMSGrievanceMember {
  return {
    id:      row.id as string,
    cycleId: row.cycle_id as string,
    userId:  row.user_id as string,
  };
}

export function mapEvaluationRow(row: Record<string, unknown>): PMSEvaluation {
  return {
    id:          row.id as string,
    reportId:    row.report_id as string,
    evaluatorId: row.evaluator_id as string,
    status:      row.status as PMSEvaluation['status'],
    scores:      (row.scores as Record<string, number>) ?? {},
    penPicture:  row.pen_picture && Object.keys(row.pen_picture as object).length > 0
                   ? (row.pen_picture as PenPicture)
                   : null,
    totalScore:  row.total_score != null ? Number(row.total_score) : null,
    reasonsForOutstanding:     (row.reasons_for_outstanding as string) ?? null,
    reasonsBelowThreshold:     (row.reasons_below_threshold as string) ?? null,
    suggestionsForImprovement: (row.suggestions_for_improvement as string) ?? null,
    comments:    (row.comments as string) ?? null,
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  };
}

export function mapCommitteeDecisionRow(row: Record<string, unknown>): PMSCommitteeDecision {
  return {
    id:            row.id as string,
    reportId:      row.report_id as string,
    decidedBy:     row.decided_by as string,
    finalScore:    row.final_score != null ? Number(row.final_score) : null,
    justification: row.justification as string,
    reasonsForOutstanding:     (row.reasons_for_outstanding as string) ?? null,
    reasonsBelowThreshold:     (row.reasons_below_threshold as string) ?? null,
    suggestionsForImprovement: (row.suggestions_for_improvement as string) ?? null,
    createdAt:     row.created_at as string,
  };
}

export function mapAWPActivityRow(row: Record<string, unknown>): PMSAWPActivity {
  return {
    id:                      row.id as string,
    reportId:                row.report_id as string,
    natureOfActivity:        row.nature_of_activity as string,
    role:                    row.role as string,
    timeCommittedPercentage: Number(row.time_committed_percentage),
    milestones:              Array.isArray(row.milestones) ? (row.milestones as string[]) : [],
    createdAt:               row.created_at as string,
    updatedAt:               row.updated_at as string,
  };
}

export function mapRepresentationRow(row: Record<string, unknown>): PMSRepresentation {
  return {
    id:          row.id as string,
    reportId:    row.report_id as string,
    scientistId: row.scientist_id as string,
    grounds:     row.grounds as string,
    submittedAt: row.submitted_at as string,
    status:      row.status as PMSRepresentation['status'],
    resolution:  (row.resolution as string) ?? null,
    resolvedBy:  (row.resolved_by as string) ?? null,
    resolvedAt:  (row.resolved_at as string) ?? null,
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

// AWP content lives in row columns (part_a, …) but revision snapshots use the
// RPC payload keys (partA, …). Both shapes map through here.
function mapAWPContent(o: Record<string, unknown>, rowKeys: boolean): AWPContent {
  const k = (row: string, payload: string) => (rowKeys ? o[row] : o[payload]);
  return {
    partA:             (k('part_a', 'partA') ?? {}) as AWPContent['partA'],
    activitySplit:     (k('activity_split', 'activitySplit') ?? []) as AWPContent['activitySplit'],
    projects:          (k('projects', 'projects') ?? []) as AWPContent['projects'],
    objectives:        (k('objectives', 'objectives') ?? {}) as AWPContent['objectives'],
    development:       (k('development', 'development') ?? {}) as AWPContent['development'],
    institutionalWork: (k('institutional_work', 'institutionalWork') as string) ?? '',
    other:             (k('other', 'other') as string) ?? '',
  };
}

export function mapAWPRow(row: Record<string, unknown>): PMSAWP {
  return {
    ...mapAWPContent(row, true),
    id:                 row.id as string,
    staffId:            row.staff_id as string,
    scientistUserId:    (row.scientist_user_id as string) ?? null,
    reportingYear:      row.reporting_year as string,
    status:             row.status as PMSAWP['status'],
    reportingOfficerId: (row.reporting_officer_id as string) ?? null,
    reviewingOfficerId: (row.reviewing_officer_id as string) ?? null,
    roVerdict:          (row.ro_verdict as PMSAWP['roVerdict']) ?? null,
    roReasons:          (row.ro_reasons as string) ?? null,
    roAt:               (row.ro_at as string) ?? null,
    rvoRemarks:         (row.rvo_remarks as string) ?? null,
    rvoAt:              (row.rvo_at as string) ?? null,
    directorDecision:   (row.director_decision as PMSAWP['directorDecision']) ?? null,
    directorRemarks:    (row.director_remarks as string) ?? null,
    approvedAt:         (row.approved_at as string) ?? null,
    communicatedAt:     (row.communicated_at as string) ?? null,
    returnReasons:      (row.return_reasons as string) ?? null,
    source:             row.source as PMSAWP['source'],
    sourcePdfPath:      (row.source_pdf_path as string) ?? null,
    submittedAt:        (row.submitted_at as string) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
  };
}

export function mapAWPRevisionRow(row: Record<string, unknown>): PMSAWPRevision {
  return {
    id:              row.id as string,
    awpId:           row.awp_id as string,
    initiatedBy:     row.initiated_by as string,
    reasons:         row.reasons as string,
    before:          mapAWPContent((row.before ?? {}) as Record<string, unknown>, false),
    after:           mapAWPContent((row.after ?? {}) as Record<string, unknown>, false),
    status:          row.status as PMSAWPRevision['status'],
    decidedBy:       (row.decided_by as string) ?? null,
    decidedAt:       (row.decided_at as string) ?? null,
    decisionRemarks: (row.decision_remarks as string) ?? null,
    createdAt:       row.created_at as string,
  };
}
