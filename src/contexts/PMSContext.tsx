/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type {
  AppraisalCycle, PMSReport, PMSReportSection, PMSAnnexure,
  PMSEvaluationCommittee, PMSEvaluationCommitteeMember,
  PMSEmpoweredCommitteeMember, PMSGrievanceMember,
  PMSEvaluation, PMSCommitteeDecision, PMSAWPActivity, PMSRepresentation, PMSNotification,
} from '../types/pms';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { registerDocument, unregisterDocument } from '../lib/documents/registry';
import { fileFinalizedReport } from '../lib/pms/fileFinalized';
import { SCORE_RANGE } from '../lib/pms/constants';
import { isValidScore, requiresBelowThresholdReasons, requiresOutstandingReasons } from '../lib/pms/scoring';
import {
  mapCycleRow, mapReportRow, mapSectionRow,
  mapAnnexureRow, mapCommitteeRow, mapCommitteeMemberRow,
  mapEmpoweredMemberRow, mapGrievanceMemberRow,
  mapEvaluationRow, mapCommitteeDecisionRow, mapAWPActivityRow,
  mapRepresentationRow, mapNotificationRow,
} from '../utils/pmsMappers';

function ensureUser<T>(user: T | null | undefined): asserts user is T {
  if (!user) throw new Error('Not authenticated');
}

function assertScoreInRange(score: number, label: string): void {
  if (!isValidScore(score)) {
    throw new Error(`${label} must be a whole number between ${SCORE_RANGE.min} and ${SCORE_RANGE.max}`);
  }
}

function assertScoreReasons(
  score: number,
  reasons: { reasonsForOutstanding?: string; reasonsBelowThreshold?: string; suggestionsForImprovement?: string }
): void {
  if (requiresOutstandingReasons(score) && !reasons.reasonsForOutstanding?.trim()) {
    throw new Error('Scores of 90 or above require reasons for the Outstanding grade');
  }
  if (requiresBelowThresholdReasons(score)
      && (!reasons.reasonsBelowThreshold?.trim() || !reasons.suggestionsForImprovement?.trim())) {
    throw new Error('Scores of 75 or below require reasons and suggestions for improvement');
  }
}

export interface EvaluationPayload {
  scores: Record<string, number>;
  totalScore: number;
  comments: string;
  reasonsForOutstanding?: string;
  reasonsBelowThreshold?: string;
  suggestionsForImprovement?: string;
}

export interface FinalDecisionPayload {
  finalScore: number;
  justification: string;
  reasonsForOutstanding?: string;
  reasonsBelowThreshold?: string;
  suggestionsForImprovement?: string;
}

interface PMSContextType {
  // State
  cycles: AppraisalCycle[];
  reports: PMSReport[];
  committees: PMSEvaluationCommittee[];
  empoweredMembers: PMSEmpoweredCommitteeMember[];
  grievanceMembers: PMSGrievanceMember[];
  evaluations: PMSEvaluation[];
  representations: PMSRepresentation[];
  notifications: PMSNotification[];
  isLoading: boolean;
  error: string | null;

  // Cycles
  createCycle: (data: Omit<AppraisalCycle, 'id' | 'createdAt'>) => Promise<AppraisalCycle>;
  updateCycle: (id: string, data: Partial<Omit<AppraisalCycle, 'id' | 'createdAt'>>) => Promise<void>;

  // Evaluation Committees (tiers I/II/III)
  createCommittee: (data: Omit<PMSEvaluationCommittee, 'id' | 'createdAt' | 'members'>) => Promise<PMSEvaluationCommittee>;
  addCommitteeMember: (committeeId: string, userId: string, role: PMSEvaluationCommitteeMember['role']) => Promise<void>;
  removeCommitteeMember: (memberId: string) => Promise<void>;

  // Empowered Committee configuration (3/5/7 + Chairman)
  addEmpoweredMember: (cycleId: string, userId: string, isChairman: boolean) => Promise<void>;
  removeEmpoweredMember: (memberId: string) => Promise<void>;

  // Grievance Redressal Committee (5 members)
  addGrievanceMember: (cycleId: string, userId: string) => Promise<void>;
  removeGrievanceMember: (memberId: string) => Promise<void>;

  // Reports
  createReport: (cycleId: string) => Promise<PMSReport>;
  getReport: (reportId: string) => Promise<PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[]; awpActivities: PMSAWPActivity[] }>;
  saveSection: (reportId: string, sectionKey: string, data: Record<string, unknown>) => Promise<void>;
  saveBasicInfo: (reportId: string, data: { previousPmsSubmittedOnTime: boolean | null; previousPmsSubmissionDate: string | null }) => Promise<void>;
  saveAWPActivities: (reportId: string, activities: Omit<PMSAWPActivity, 'id' | 'reportId' | 'createdAt' | 'updatedAt'>[]) => Promise<void>;
  uploadSignature: (reportId: string, file: File) => Promise<string>;
  uploadAnnexure: (reportId: string, file: File) => Promise<PMSAnnexure>;
  deleteAnnexure: (annexureId: string, filePath: string) => Promise<void>;
  submitReport: (reportId: string) => Promise<void>;
  getSignedUrl: (path: string, bucket: 'signatures' | 'annexures') => Promise<string>;
  refreshData: () => Promise<void>;

  // Admin business rules
  setDutyDays: (reportId: string, dutyDays: number) => Promise<void>;
  markNotAssessed: (reportId: string, remark?: string) => Promise<void>;
  recordNonSubmission: (reportId: string, certificate: File) => Promise<void>;

  // Evaluation flow
  assignEvaluators: (reportId: string, committeeId: string) => Promise<void>;
  saveEvaluationScores: (evaluationId: string, payload: EvaluationPayload) => Promise<void>;
  completeEvaluation: (evaluationId: string, payload: EvaluationPayload) => Promise<void>;
  getReportEvaluations: (reportId: string) => Promise<PMSEvaluation[]>;
  getCommitteeDecision: (reportId: string) => Promise<PMSCommitteeDecision | null>;
  finalizeReport: (reportId: string, decision: FinalDecisionPayload) => Promise<void>;

  // Representation / grievance
  submitRepresentation: (reportId: string, grounds: string) => Promise<void>;
  resolveRepresentation: (reportId: string, resolution: string, revised?: FinalDecisionPayload) => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;
}

const PMSContext = createContext<PMSContextType | undefined>(undefined);

export function PMSProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();

  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [reports, setReports] = useState<PMSReport[]>([]);
  const [committees, setCommittees] = useState<PMSEvaluationCommittee[]>([]);
  const [empoweredMembers, setEmpoweredMembers] = useState<PMSEmpoweredCommitteeMember[]>([]);
  const [grievanceMembers, setGrievanceMembers] = useState<PMSGrievanceMember[]>([]);
  const [evaluations, setEvaluations] = useState<PMSEvaluation[]>([]);
  const [representations, setRepresentations] = useState<PMSRepresentation[]>([]);
  const [notifications, setNotifications] = useState<PMSNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!provisioned || !supabase || !user) {
        setCycles([]);
        setReports([]);
        setCommittees([]);
        setEmpoweredMembers([]);
        setGrievanceMembers([]);
        setEvaluations([]);
        setRepresentations([]);
        setNotifications([]);
        return;
      }
      const [cycleRes, reportRes, committeeRes, empoweredRes, grievanceRes, evalRes, reprRes, notifRes] = await Promise.all([
        supabase.from('appraisal_cycles').select('*').order('created_at', { ascending: false }),
        supabase.from('pms_reports').select('*, appraisal_cycles(*)').order('created_at', { ascending: false }),
        supabase.from('pms_evaluation_committees').select('*, pms_evaluation_committee_members(*)').order('created_at', { ascending: false }),
        supabase.from('pms_empowered_committee_members').select('*'),
        supabase.from('pms_grievance_members').select('*'),
        supabase.from('pms_evaluations').select('*').order('created_at', { ascending: false }),
        supabase.from('pms_representations').select('*').order('submitted_at', { ascending: false }),
        supabase.from('pms_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setCycles(cycleRes.data ? cycleRes.data.map(mapCycleRow) : []);
      setReports(reportRes.data ? reportRes.data.map(row => ({
        ...mapReportRow(row as Record<string, unknown>),
        cycle: row.appraisal_cycles ? mapCycleRow(row.appraisal_cycles as Record<string, unknown>) : undefined,
      })) : []);
      setCommittees(committeeRes.data ? committeeRes.data.map(row => ({
        ...mapCommitteeRow(row as Record<string, unknown>),
        members: Array.isArray(row.pms_evaluation_committee_members)
          ? row.pms_evaluation_committee_members.map((m: Record<string, unknown>) => mapCommitteeMemberRow(m))
          : [],
      })) : []);
      setEmpoweredMembers(empoweredRes.data ? empoweredRes.data.map(r => mapEmpoweredMemberRow(r as Record<string, unknown>)) : []);
      setGrievanceMembers(grievanceRes.data ? grievanceRes.data.map(r => mapGrievanceMemberRow(r as Record<string, unknown>)) : []);
      setEvaluations(evalRes.data ? evalRes.data.map(r => mapEvaluationRow(r as Record<string, unknown>)) : []);
      setRepresentations(reprRes.data ? reprRes.data.map(r => mapRepresentationRow(r as Record<string, unknown>)) : []);
      setNotifications(notifRes.data ? notifRes.data.map(r => mapNotificationRow(r as Record<string, unknown>)) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PMS data');
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { void loadData(); }, [loadData]);

  // --- Cycles ---

  async function createCycle(data: Omit<AppraisalCycle, 'id' | 'createdAt'>): Promise<AppraisalCycle> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('appraisal_cycles')
      .insert({ name: data.name, start_date: data.startDate, end_date: data.endDate, status: data.status })
      .select()
      .single();
    if (err) throw err;
    const cycle = mapCycleRow(row as Record<string, unknown>);
    setCycles(prev => [cycle, ...prev]);
    return cycle;
  }

  async function updateCycle(id: string, data: Partial<Omit<AppraisalCycle, 'id' | 'createdAt'>>): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const payload: Record<string, unknown> = {};
    if (data.name)      payload.name       = data.name;
    if (data.startDate) payload.start_date = data.startDate;
    if (data.endDate)   payload.end_date   = data.endDate;
    if (data.status)    payload.status     = data.status;
    const { error: err } = await supabase.from('appraisal_cycles').update(payload).eq('id', id);
    if (err) throw err;
    setCycles(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }

  // --- Evaluation Committees ---

  async function createCommittee(data: Omit<PMSEvaluationCommittee, 'id' | 'createdAt' | 'members'>): Promise<PMSEvaluationCommittee> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_evaluation_committees')
      .insert({ name: data.name, description: data.description, cycle_id: data.cycleId, tier: data.tier })
      .select()
      .single();
    if (err) throw err;
    const committee = { ...mapCommitteeRow(row as Record<string, unknown>), members: [] };
    setCommittees(prev => [committee, ...prev]);
    return committee;
  }

  async function addCommitteeMember(committeeId: string, userId: string, role: PMSEvaluationCommitteeMember['role']): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_evaluation_committee_members')
      .insert({ committee_id: committeeId, user_id: userId, role })
      .select()
      .single();
    if (err) throw err;
    const member = mapCommitteeMemberRow(row as Record<string, unknown>);
    setCommittees(prev => prev.map(c =>
      c.id === committeeId ? { ...c, members: [...(c.members ?? []), member] } : c
    ));
  }

  async function removeCommitteeMember(memberId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.from('pms_evaluation_committee_members').delete().eq('id', memberId);
    if (err) throw err;
    setCommittees(prev => prev.map(c => ({
      ...c,
      members: c.members?.filter(m => m.id !== memberId) ?? [],
    })));
  }

  // --- Empowered Committee configuration ---

  async function addEmpoweredMember(cycleId: string, userId: string, isChairman: boolean): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_empowered_committee_members')
      .insert({ cycle_id: cycleId, user_id: userId, is_chairman: isChairman })
      .select()
      .single();
    if (err) throw err;
    setEmpoweredMembers(prev => [...prev, mapEmpoweredMemberRow(row as Record<string, unknown>)]);
  }

  async function removeEmpoweredMember(memberId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.from('pms_empowered_committee_members').delete().eq('id', memberId);
    if (err) throw err;
    setEmpoweredMembers(prev => prev.filter(m => m.id !== memberId));
  }

  // --- Grievance Redressal Committee ---

  async function addGrievanceMember(cycleId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_grievance_members')
      .insert({ cycle_id: cycleId, user_id: userId })
      .select()
      .single();
    if (err) throw err;
    setGrievanceMembers(prev => [...prev, mapGrievanceMemberRow(row as Record<string, unknown>)]);
  }

  async function removeGrievanceMember(memberId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.from('pms_grievance_members').delete().eq('id', memberId);
    if (err) throw err;
    setGrievanceMembers(prev => prev.filter(m => m.id !== memberId));
  }

  // --- Reports ---

  async function createReport(cycleId: string): Promise<PMSReport> {
    if (!supabase) throw new Error('Supabase not provisioned');
    if (!user) throw new Error('Not authenticated');
    const { data: existing } = await supabase
      .from('pms_reports')
      .select('*')
      .eq('cycle_id', cycleId)
      .eq('scientist_id', user.id)
      .maybeSingle();
    if (existing) return mapReportRow(existing as Record<string, unknown>);

    const { data: row, error: err } = await supabase
      .from('pms_reports')
      .insert({ cycle_id: cycleId, scientist_id: user.id })
      .select()
      .single();
    if (err) throw err;
    const report = mapReportRow(row as Record<string, unknown>);
    setReports(prev => [report, ...prev]);
    return report;
  }

  async function getReport(reportId: string): Promise<PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[]; awpActivities: PMSAWPActivity[] }> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const [reportRes, sectionsRes, annexuresRes, awpRes] = await Promise.all([
      supabase.from('pms_reports').select('*, appraisal_cycles(*)').eq('id', reportId).single(),
      supabase.from('pms_report_sections').select('*').eq('report_id', reportId),
      supabase.from('pms_annexures').select('*').eq('report_id', reportId).order('uploaded_at'),
      supabase.from('pms_awp_activities').select('*').eq('report_id', reportId).order('created_at'),
    ]);
    if (reportRes.error) throw reportRes.error;
    const report = {
      ...mapReportRow(reportRes.data as Record<string, unknown>),
      cycle: reportRes.data.appraisal_cycles
        ? mapCycleRow(reportRes.data.appraisal_cycles as Record<string, unknown>)
        : undefined,
    };
    return {
      ...report,
      sections: sectionsRes.data ? sectionsRes.data.map(r => mapSectionRow(r as Record<string, unknown>)) : [],
      annexures: annexuresRes.data ? annexuresRes.data.map(r => mapAnnexureRow(r as Record<string, unknown>)) : [],
      awpActivities: awpRes.data ? awpRes.data.map(r => mapAWPActivityRow(r as Record<string, unknown>)) : [],
    };
  }

  async function saveSection(reportId: string, sectionKey: string, data: Record<string, unknown>): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_report_sections')
      .upsert({ report_id: reportId, section_key: sectionKey, data }, { onConflict: 'report_id,section_key' });
    if (err) throw err;
  }

  async function saveBasicInfo(
    reportId: string,
    data: { previousPmsSubmittedOnTime: boolean | null; previousPmsSubmissionDate: string | null }
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_reports')
      .update({
        previous_pms_submitted_on_time: data.previousPmsSubmittedOnTime,
        previous_pms_submission_date: data.previousPmsSubmissionDate,
      })
      .eq('id', reportId);
    if (err) throw err;
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, ...data } : r));
  }

  async function saveAWPActivities(
    reportId: string,
    activities: Omit<PMSAWPActivity, 'id' | 'reportId' | 'createdAt' | 'updatedAt'>[]
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    // ponytail: replace-all write — AWP lists are small, diffing not worth it
    const { error: delErr } = await supabase.from('pms_awp_activities').delete().eq('report_id', reportId);
    if (delErr) throw delErr;
    if (activities.length === 0) return;
    const { error: insErr } = await supabase.from('pms_awp_activities').insert(
      activities.map(a => ({
        report_id: reportId,
        nature_of_activity: a.natureOfActivity,
        role: a.role,
        time_committed_percentage: a.timeCommittedPercentage,
        milestones: a.milestones,
      }))
    );
    if (insErr) throw insErr;
  }

  async function uploadSignature(reportId: string, file: File): Promise<string> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const path = `${reportId}/signature_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: err } = await supabase.storage.from('signatures').upload(path, file, { upsert: true });
    if (err) throw err;
    const { error: updateErr } = await supabase
      .from('pms_reports')
      .update({ signature_url: path })
      .eq('id', reportId);
    if (updateErr) throw updateErr;
    return path;
  }

  async function uploadAnnexure(reportId: string, file: File): Promise<PMSAnnexure> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const path = `${reportId}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('annexures').upload(path, file);
    if (uploadErr) throw uploadErr;
    const { data: row, error: dbErr } = await supabase
      .from('pms_annexures')
      .insert({ report_id: reportId, file_name: file.name, file_path: path, file_size: file.size, mime_type: file.type })
      .select()
      .single();
    if (dbErr) throw dbErr;
    // Dual-write into the unified registry (T1). Non-fatal.
    void registerDocument({
      entityType: 'pms_report',
      entityId: reportId,
      docType: 'annexure',
      title: file.name,
      storageBucket: 'annexures',
      storagePath: path,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      accessTier: 'confidential',
    });
    return mapAnnexureRow(row as Record<string, unknown>);
  }

  async function deleteAnnexure(annexureId: string, filePath: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: storageErr } = await supabase.storage.from('annexures').remove([filePath]);
    if (storageErr) throw storageErr;
    const { error: dbErr } = await supabase.from('pms_annexures').delete().eq('id', annexureId);
    if (dbErr) throw dbErr;
    void unregisterDocument('annexures', filePath);
  }

  async function submitReport(reportId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase.rpc('pms_submit_report', { p_report_id: reportId });
    if (err) throw err;
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'SUBMITTED' as const } : r));
  }

  async function getSignedUrl(path: string, bucket: 'signatures' | 'annexures'): Promise<string> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data, error: err } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (err) throw err;
    return data.signedUrl;
  }

  // --- Admin business rules ---

  async function setDutyDays(reportId: string, dutyDays: number): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase.rpc('pms_set_duty_days', {
      p_report_id: reportId,
      p_duty_days: dutyDays,
    });
    if (err) throw err;
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, dutyDays } : r));
  }

  async function markNotAssessed(reportId: string, remark?: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase.rpc('pms_mark_not_assessed', {
      p_report_id: reportId,
      p_remark: remark ?? null,
    });
    if (err) throw err;
    await loadData();
  }

  async function recordNonSubmission(reportId: string, certificate: File): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const path = `${reportId}/non_submission_${Date.now()}_${certificate.name}`;
    const { error: uploadErr } = await supabase.storage.from('annexures').upload(path, certificate);
    if (uploadErr) throw uploadErr;
    const { error: err } = await supabase.rpc('pms_record_non_submission', {
      p_report_id: reportId,
      p_cert_path: path,
    });
    if (err) throw err;
    await loadData();
  }

  // --- Evaluation flow ---

  async function assignEvaluators(reportId: string, committeeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase.rpc('pms_assign_evaluators', {
      p_report_id: reportId,
      p_committee_id: committeeId,
    });
    if (err) throw err;
    setReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'UNDER_EVALUATION_COMMITTEE_REVIEW' as const } : r
    ));
  }

  function evaluationUpdatePayload(payload: EvaluationPayload) {
    assertScoreInRange(payload.totalScore, 'Total score');
    assertScoreReasons(payload.totalScore, payload);
    return {
      scores: payload.scores,
      total_score: payload.totalScore,
      comments: payload.comments,
      reasons_for_outstanding: payload.reasonsForOutstanding ?? null,
      reasons_below_threshold: payload.reasonsBelowThreshold ?? null,
      suggestions_for_improvement: payload.suggestionsForImprovement ?? null,
    };
  }

  async function saveEvaluationScores(evaluationId: string, payload: EvaluationPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase
      .from('pms_evaluations')
      .update({ ...evaluationUpdatePayload(payload), status: 'IN_PROGRESS' })
      .eq('id', evaluationId);
    if (err) throw err;
    await loadData();
  }

  async function completeEvaluation(evaluationId: string, payload: EvaluationPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase
      .from('pms_evaluations')
      .update({ ...evaluationUpdatePayload(payload), status: 'COMPLETED' })
      .eq('id', evaluationId);
    if (err) throw err;
    await loadData();
  }

  async function getReportEvaluations(reportId: string): Promise<PMSEvaluation[]> {
    if (!supabase) return [];
    const { data, error: err } = await supabase
      .from('pms_evaluations')
      .select('*')
      .eq('report_id', reportId);
    if (err) throw err;
    return data ? data.map(r => mapEvaluationRow(r as Record<string, unknown>)) : [];
  }

  async function getCommitteeDecision(reportId: string): Promise<PMSCommitteeDecision | null> {
    if (!supabase) return null;
    const { data, error: err } = await supabase
      .from('pms_committee_decisions')
      .select('*')
      .eq('report_id', reportId)
      .maybeSingle();
    if (err) throw err;
    return data ? mapCommitteeDecisionRow(data as Record<string, unknown>) : null;
  }

  async function finalizeReport(reportId: string, decision: FinalDecisionPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    assertScoreInRange(decision.finalScore, 'Final score');
    assertScoreReasons(decision.finalScore, decision);
    if (!decision.justification.trim()) throw new Error('Justification is required to finalize the report');
    const current = reports.find(r => r.id === reportId);
    if (current && current.status === 'FINALIZED') {
      throw new Error('Report is already finalized');
    }
    const { error: err } = await supabase.rpc('pms_finalize_report', {
      p_report_id: reportId,
      p_final_score: decision.finalScore,
      p_justification: decision.justification,
      p_reasons_outstanding: decision.reasonsForOutstanding ?? null,
      p_reasons_below: decision.reasonsBelowThreshold ?? null,
      p_suggestions: decision.suggestionsForImprovement ?? null,
    });
    if (err) throw err;
    setReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'FINALIZED' as const } : r
    ));

    // File the finalized report PDF into the documents registry for RAG (T2). Non-fatal.
    try {
      const full = await getReport(reportId);
      void fileFinalizedReport({
        report: full,
        sections: full.sections,
        annexures: full.annexures,
        finalScore: decision.finalScore,
        justification: decision.justification,
      });
    } catch (e) {
      console.error('[pms] finalized filing skipped', e);
    }
  }

  // --- Representation / grievance ---

  async function submitRepresentation(reportId: string, grounds: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    const { error: err } = await supabase.rpc('pms_submit_representation', {
      p_report_id: reportId,
      p_grounds: grounds,
    });
    if (err) throw err;
    await loadData();
  }

  async function resolveRepresentation(reportId: string, resolution: string, revised?: FinalDecisionPayload): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    ensureUser(user);
    if (revised) {
      assertScoreInRange(revised.finalScore, 'Revised score');
      assertScoreReasons(revised.finalScore, revised);
    }
    const { error: err } = await supabase.rpc('pms_resolve_representation', {
      p_report_id: reportId,
      p_resolution: resolution,
      p_revised_score: revised?.finalScore ?? null,
      p_reasons_outstanding: revised?.reasonsForOutstanding ?? null,
      p_reasons_below: revised?.reasonsBelowThreshold ?? null,
      p_suggestions: revised?.suggestionsForImprovement ?? null,
    });
    if (err) throw err;
    await loadData();
  }

  async function markNotificationRead(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_notifications')
      .update({ read: true })
      .eq('id', id);
    if (err) throw err;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  return (
    <PMSContext.Provider value={{
      cycles, reports, committees, empoweredMembers, grievanceMembers,
      evaluations, representations, notifications, isLoading, error,
      createCycle, updateCycle,
      createCommittee, addCommitteeMember, removeCommitteeMember,
      addEmpoweredMember, removeEmpoweredMember,
      addGrievanceMember, removeGrievanceMember,
      createReport, getReport, saveSection, saveBasicInfo, saveAWPActivities,
      uploadSignature, uploadAnnexure, deleteAnnexure,
      submitReport, getSignedUrl,
      setDutyDays, markNotAssessed, recordNonSubmission,
      assignEvaluators, saveEvaluationScores, completeEvaluation,
      getReportEvaluations,
      getCommitteeDecision, finalizeReport,
      submitRepresentation, resolveRepresentation,
      markNotificationRead,
      refreshData: loadData,
    }}>
      {children}
    </PMSContext.Provider>
  );
}

export function usePMS(): PMSContextType {
  const ctx = useContext(PMSContext);
  if (!ctx) throw new Error('usePMS must be used inside PMSProvider');
  return ctx;
}
