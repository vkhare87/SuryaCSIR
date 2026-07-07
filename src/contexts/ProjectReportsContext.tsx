/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase, isProvisioned } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import type { ProjectReport, ProjectReportStatus } from '../types/projectReport';

function mapRow(r: Record<string, unknown>): ProjectReport {
  return {
    id: r.id as string,
    projectNo: r.project_no as string,
    projectName: r.project_name as string,
    divisionCode: (r.division_code as string) ?? null,
    periodType: r.period_type as ProjectReport['periodType'],
    periodLabel: r.period_label as string,
    dueDate: (r.due_date as string) ?? null,
    status: r.status as ProjectReportStatus,
    objectivesProgress: (r.objectives_progress as string) ?? '',
    milestones: (r.milestones as string) ?? '',
    expenditureSummary: (r.expenditure_summary as string) ?? '',
    outcomes: (r.outcomes as string) ?? '',
    remarks: (r.remarks as string) ?? '',
    reviewNotes: (r.review_notes as string) ?? null,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    submittedBy: r.submitted_by as string,
    submittedAt: (r.submitted_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export type ProjectReportDraft = Pick<ProjectReport,
  'projectNo' | 'projectName' | 'divisionCode' | 'periodType' | 'periodLabel' | 'dueDate' |
  'objectivesProgress' | 'milestones' | 'expenditureSummary' | 'outcomes' | 'remarks'>;

function toRow(input: Partial<ProjectReportDraft>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.projectNo !== undefined)          row.project_no = input.projectNo;
  if (input.projectName !== undefined)        row.project_name = input.projectName;
  if (input.divisionCode !== undefined)       row.division_code = input.divisionCode;
  if (input.periodType !== undefined)         row.period_type = input.periodType;
  if (input.periodLabel !== undefined)        row.period_label = input.periodLabel;
  if (input.dueDate !== undefined)            row.due_date = input.dueDate;
  if (input.objectivesProgress !== undefined) row.objectives_progress = input.objectivesProgress;
  if (input.milestones !== undefined)         row.milestones = input.milestones;
  if (input.expenditureSummary !== undefined) row.expenditure_summary = input.expenditureSummary;
  if (input.outcomes !== undefined)           row.outcomes = input.outcomes;
  if (input.remarks !== undefined)            row.remarks = input.remarks;
  return row;
}

interface ProjectReportsContextType {
  reports: ProjectReport[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getReport: (id: string) => Promise<ProjectReport>;
  createDraft: (input: ProjectReportDraft) => Promise<ProjectReport>;
  updateDraft: (id: string, input: Partial<ProjectReportDraft>) => Promise<void>;
  submitReport: (id: string) => Promise<void>;
  reviewReport: (id: string, decision: 'REVIEWED' | 'REVISION_REQUESTED', notes: string) => Promise<void>;
}

const ProjectReportsContext = createContext<ProjectReportsContextType | undefined>(undefined);

export function useProjectReports() {
  const ctx = useContext(ProjectReportsContext);
  if (ctx === undefined) throw new Error('useProjectReports must be used within a ProjectReportsProvider');
  return ctx;
}

export function ProjectReportsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const provisioned = isProvisioned();
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!provisioned || !supabase || !user) { setReports([]); setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('project_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setReports((data ?? []).map(mapRow));
    } catch (e) {
      console.error('[project-reports] refresh failed', e);
      setError((e as Error).message);
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  }, [provisioned, user]);

  useEffect(() => { refresh(); }, [refresh]);

  const getReport = useCallback(async (id: string): Promise<ProjectReport> => {
    if (!supabase) throw new Error('Database not provisioned');
    const { data, error: err } = await supabase.from('project_reports').select('*').eq('id', id).single();
    if (err) throw err;
    return mapRow(data);
  }, []);

  const createDraft = useCallback(async (input: ProjectReportDraft): Promise<ProjectReport> => {
    if (!supabase || !user) throw new Error('Not authenticated');
    const { data, error: err } = await supabase
      .from('project_reports')
      .insert({ ...toRow(input), status: 'DRAFT', submitted_by: user.id })
      .select()
      .single();
    if (err || !data) throw err ?? new Error('Insert failed');
    await refresh();
    return mapRow(data);
  }, [user, refresh]);

  const updateDraft = useCallback(async (id: string, input: Partial<ProjectReportDraft>): Promise<void> => {
    if (!supabase) throw new Error('Database not provisioned');
    const { error: err } = await supabase
      .from('project_reports')
      .update({ ...toRow(input), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const submitReport = useCallback(async (id: string): Promise<void> => {
    if (!supabase) throw new Error('Database not provisioned');
    const { error: err } = await supabase.rpc('project_report_submit', { p_id: id });
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const reviewReport = useCallback(
    async (id: string, decision: 'REVIEWED' | 'REVISION_REQUESTED', notes: string): Promise<void> => {
      if (!supabase) throw new Error('Database not provisioned');
      const { error: err } = await supabase.rpc('project_report_review', {
        p_id: id, p_decision: decision, p_notes: notes,
      });
      if (err) throw err;
      await refresh();
    },
    [refresh],
  );

  return (
    <ProjectReportsContext.Provider value={{
      reports, isLoading, error, refresh, getReport,
      createDraft, updateDraft, submitReport, reviewReport,
    }}>
      {children}
    </ProjectReportsContext.Provider>
  );
}
