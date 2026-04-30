/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type {
  AppraisalCycle, PMSReport, PMSReportSection, PMSAnnexure,
  PMSCollegium, PMSCollegiumMember,
  PMSEvaluation, PMSChairmanReview, PMSCommitteeDecision, PMSNotification,
} from '../types/pms';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import {
  mapCycleRow, mapReportRow, mapSectionRow,
  mapAnnexureRow, mapCollegiumRow, mapCollegiumMemberRow,
  mapEvaluationRow, mapChairmanReviewRow, mapCommitteeDecisionRow, mapNotificationRow,
} from '../utils/pmsMappers';

interface PMSContextType {
  // State
  cycles: AppraisalCycle[];
  reports: PMSReport[];
  collegiums: PMSCollegium[];
  evaluations: PMSEvaluation[];
  notifications: PMSNotification[];
  isLoading: boolean;
  error: string | null;

  // Existing mutations
  createCycle: (data: Omit<AppraisalCycle, 'id' | 'createdAt'>) => Promise<AppraisalCycle>;
  updateCycle: (id: string, data: Partial<Omit<AppraisalCycle, 'id' | 'createdAt'>>) => Promise<void>;
  createCollegium: (data: Omit<PMSCollegium, 'id' | 'createdAt' | 'members'>) => Promise<PMSCollegium>;
  addCollegiumMember: (collegiumId: string, userId: string, role: PMSCollegiumMember['role']) => Promise<void>;
  removeCollegiumMember: (memberId: string) => Promise<void>;
  createReport: (cycleId: string) => Promise<PMSReport>;
  getReport: (reportId: string) => Promise<PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] }>;
  saveSection: (reportId: string, sectionKey: string, data: Record<string, unknown>) => Promise<void>;
  uploadSignature: (reportId: string, file: File) => Promise<string>;
  uploadAnnexure: (reportId: string, file: File) => Promise<PMSAnnexure>;
  deleteAnnexure: (annexureId: string, filePath: string) => Promise<void>;
  submitReport: (reportId: string) => Promise<void>;
  getSignedUrl: (path: string, bucket: 'signatures' | 'annexures') => Promise<string>;
  refreshData: () => Promise<void>;

  // Phase C mutations
  assignEvaluators: (reportId: string, userIds: string[]) => Promise<void>;
  saveEvaluationScores: (evaluationId: string, scores: Record<string, number>, comments: string) => Promise<void>;
  completeEvaluation: (evaluationId: string, scores: Record<string, number>, comments: string) => Promise<void>;
  getReportEvaluations: (reportId: string) => Promise<PMSEvaluation[]>;
  getChairmanReview: (reportId: string) => Promise<PMSChairmanReview | null>;
  saveChairmanReview: (reportId: string, min: number, max: number, comments: string) => Promise<void>;
  getCommitteeDecision: (reportId: string) => Promise<PMSCommitteeDecision | null>;
  finalizeReport: (reportId: string, finalScore: number, justification: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
}

const PMSContext = createContext<PMSContextType | undefined>(undefined);

export function PMSProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();

  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [reports, setReports] = useState<PMSReport[]>([]);
  const [collegiums, setCollegiums] = useState<PMSCollegium[]>([]);
  const [evaluations, setEvaluations] = useState<PMSEvaluation[]>([]);
  const [notifications, setNotifications] = useState<PMSNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (provisioned && supabase && user) {
        // --- Supabase branch ---
        const [cycleRes, reportRes, collegiumRes, evalRes, notifRes] = await Promise.all([
          supabase.from('appraisal_cycles').select('*').order('created_at', { ascending: false }),
          supabase.from('pms_reports').select('*, appraisal_cycles(*)').order('created_at', { ascending: false }),
          supabase.from('pms_collegiums').select('*, pms_collegium_members(*)').order('created_at', { ascending: false }),
          supabase.from('pms_evaluations').select('*').order('created_at', { ascending: false }),
          supabase.from('pms_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        ]);

        setCycles(cycleRes.data ? cycleRes.data.map(mapCycleRow) : []);
        setReports(reportRes.data ? reportRes.data.map(row => ({
          ...mapReportRow(row as Record<string, unknown>),
          cycle: row.appraisal_cycles ? mapCycleRow(row.appraisal_cycles as Record<string, unknown>) : undefined,
        })) : []);
        setCollegiums(collegiumRes.data ? collegiumRes.data.map(row => ({
          ...mapCollegiumRow(row as Record<string, unknown>),
          members: Array.isArray(row.pms_collegium_members)
            ? row.pms_collegium_members.map((m: Record<string, unknown>) => mapCollegiumMemberRow(m))
            : [],
        })) : []);
        setEvaluations(evalRes.data ? evalRes.data.map(r => mapEvaluationRow(r as Record<string, unknown>)) : []);
        setNotifications(notifRes.data ? notifRes.data.map(r => mapNotificationRow(r as Record<string, unknown>)) : []);
      } else {
        // --- Mock fallback ---
        setCycles([{
          id: 'mock-cycle-1',
          name: 'Annual Appraisal 2025-26',
          startDate: '2025-04-01',
          endDate: '2026-03-31',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        }]);
        setReports([]);
        setCollegiums([]);
        setEvaluations([]);
        setNotifications([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PMS data');
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { void loadData(); }, [loadData]);

  // --- Existing mutations ---

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

  async function createCollegium(data: Omit<PMSCollegium, 'id' | 'createdAt' | 'members'>): Promise<PMSCollegium> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_collegiums')
      .insert({ name: data.name, description: data.description, cycle_id: data.cycleId })
      .select()
      .single();
    if (err) throw err;
    const collegium = { ...mapCollegiumRow(row as Record<string, unknown>), members: [] };
    setCollegiums(prev => [collegium, ...prev]);
    return collegium;
  }

  async function addCollegiumMember(collegiumId: string, userId: string, role: PMSCollegiumMember['role']): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data: row, error: err } = await supabase
      .from('pms_collegium_members')
      .insert({ collegium_id: collegiumId, user_id: userId, role })
      .select()
      .single();
    if (err) throw err;
    const member = mapCollegiumMemberRow(row as Record<string, unknown>);
    setCollegiums(prev => prev.map(c =>
      c.id === collegiumId ? { ...c, members: [...(c.members ?? []), member] } : c
    ));
  }

  async function removeCollegiumMember(memberId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.from('pms_collegium_members').delete().eq('id', memberId);
    if (err) throw err;
    setCollegiums(prev => prev.map(c => ({
      ...c,
      members: c.members?.filter(m => m.id !== memberId) ?? [],
    })));
  }

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

  async function getReport(reportId: string): Promise<PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] }> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const [reportRes, sectionsRes, annexuresRes] = await Promise.all([
      supabase.from('pms_reports').select('*, appraisal_cycles(*)').eq('id', reportId).single(),
      supabase.from('pms_report_sections').select('*').eq('report_id', reportId),
      supabase.from('pms_annexures').select('*').eq('report_id', reportId).order('uploaded_at'),
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
    };
  }

  async function saveSection(reportId: string, sectionKey: string, data: Record<string, unknown>): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_report_sections')
      .upsert({ report_id: reportId, section_key: sectionKey, data }, { onConflict: 'report_id,section_key' });
    if (err) throw err;
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
    return mapAnnexureRow(row as Record<string, unknown>);
  }

  async function deleteAnnexure(annexureId: string, filePath: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: storageErr } = await supabase.storage.from('annexures').remove([filePath]);
    if (storageErr) throw storageErr;
    const { error: dbErr } = await supabase.from('pms_annexures').delete().eq('id', annexureId);
    if (dbErr) throw dbErr;
  }

  async function submitReport(reportId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
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

  // --- Phase C mutations ---

  async function assignEvaluators(reportId: string, userIds: string[]): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.rpc('pms_assign_evaluators', {
      p_report_id: reportId,
      p_user_ids: userIds,
    });
    if (err) throw err;
    setReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'UNDER_COLLEGIUM_REVIEW' as const } : r
    ));
  }

  async function saveEvaluationScores(evaluationId: string, scores: Record<string, number>, comments: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_evaluations')
      .update({ scores, comments, status: 'IN_PROGRESS' })
      .eq('id', evaluationId);
    if (err) throw err;
    setEvaluations(prev => prev.map(e =>
      e.id === evaluationId ? { ...e, scores, comments, status: 'IN_PROGRESS' as const } : e
    ));
  }

  async function completeEvaluation(evaluationId: string, scores: Record<string, number>, comments: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase
      .from('pms_evaluations')
      .update({ scores, comments, status: 'COMPLETED' })
      .eq('id', evaluationId);
    if (err) throw err;
    setEvaluations(prev => prev.map(e =>
      e.id === evaluationId ? { ...e, scores, comments, status: 'COMPLETED' as const } : e
    ));
  }

  async function getReportEvaluations(reportId: string): Promise<PMSEvaluation[]> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data, error: err } = await supabase
      .from('pms_evaluations')
      .select('*')
      .eq('report_id', reportId);
    if (err) throw err;
    return data ? data.map(r => mapEvaluationRow(r as Record<string, unknown>)) : [];
  }

  async function getChairmanReview(reportId: string): Promise<PMSChairmanReview | null> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data, error: err } = await supabase
      .from('pms_chairman_reviews')
      .select('*')
      .eq('report_id', reportId)
      .maybeSingle();
    if (err) throw err;
    return data ? mapChairmanReviewRow(data as Record<string, unknown>) : null;
  }

  async function saveChairmanReview(reportId: string, min: number, max: number, comments: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.rpc('pms_save_chairman_review', {
      p_report_id: reportId,
      p_min: min,
      p_max: max,
      p_comments: comments,
    });
    if (err) throw err;
    setReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'EMPOWERED_COMMITTEE_REVIEW' as const } : r
    ));
  }

  async function getCommitteeDecision(reportId: string): Promise<PMSCommitteeDecision | null> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { data, error: err } = await supabase
      .from('pms_committee_decisions')
      .select('*')
      .eq('report_id', reportId)
      .maybeSingle();
    if (err) throw err;
    return data ? mapCommitteeDecisionRow(data as Record<string, unknown>) : null;
  }

  async function finalizeReport(reportId: string, finalScore: number, justification: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not provisioned');
    const { error: err } = await supabase.rpc('pms_finalize_report', {
      p_report_id: reportId,
      p_final_score: finalScore,
      p_justification: justification,
    });
    if (err) throw err;
    setReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: 'FINALIZED' as const } : r
    ));
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
      cycles, reports, collegiums, evaluations, notifications, isLoading, error,
      createCycle, updateCycle,
      createCollegium, addCollegiumMember, removeCollegiumMember,
      createReport, getReport, saveSection,
      uploadSignature, uploadAnnexure, deleteAnnexure,
      submitReport, getSignedUrl,
      assignEvaluators, saveEvaluationScores, completeEvaluation,
      getReportEvaluations, getChairmanReview, saveChairmanReview,
      getCommitteeDecision, finalizeReport,
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
