import { supabase } from '../../utils/supabaseClient';
import type { PenPictureGroup } from './annexureSpecs';
import type {
  DelayRow, PenPicture, EcAction, PmsPanelScore, PmsPart1, PmsReportItem, ReportItemSection, ReportItemState, ScoreHistoryRow, TimelineStep,
} from '../../types/pms';

// The 2026 assessment (20261112000018–22). Every write is an RPC; reads are
// RLS-scoped (a committee sees confirmed claims only, never suggestions).

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

// --- Part I ---
export async function loadPart1(reportId: string): Promise<PmsPart1 | null> {
  const { data, error } = await client().from('pms_part1')
    .select('report_id, data, prefilled_at, discrepancy, verified_at').eq('report_id', reportId).maybeSingle();
  if (error) throw error;
  return data ? { reportId: data.report_id, data: data.data ?? {}, prefilledAt: data.prefilled_at, discrepancy: data.discrepancy, verifiedAt: data.verified_at } : null;
}
export const prefillPart1 = (cycleId: string) => rpc<number>('pms_part1_prefill', { p_cycle_id: cycleId });
export const reportPart1Discrepancy = (reportId: string, text: string) => rpc('pms_part1_report_discrepancy', { p_report_id: reportId, p_text: text });
export const verifyPart1 = (reportId: string, data: Record<string, string> | null = null) => rpc('pms_part1_verify', { p_report_id: reportId, p_data: data });

// --- Self-appraisal items ---
export async function loadItems(reportId: string): Promise<PmsReportItem[]> {
  const { data, error } = await client().from('pms_report_items')
    .select('id, section, source_record_type, source_record_id, link, text, state')
    .eq('report_id', reportId).order('section').order('created_at');
  if (error) throw error;
  return (data ?? []).map((x: any) => ({
    id: x.id, section: x.section, sourceRecordType: x.source_record_type, sourceRecordId: x.source_record_id,
    link: x.link, text: x.text, state: x.state,
  }));
}
export const prefillItems = (reportId: string) => rpc<number>('pms_prefill_from_profile', { p_report_id: reportId });
export const setItem = (itemId: string, state: Exclude<ReportItemState, 'PREFILLED' | 'ADDED'>, text: string | null = null) =>
  rpc('pms_report_item_set', { p_item_id: itemId, p_state: state, p_text: text });
export const addItem = (reportId: string, section: ReportItemSection, text: string) =>
  rpc<string>('pms_report_item_add', { p_report_id: reportId, p_section: section, p_text: text });

// --- Panel score and Empowered Committee ---
export async function loadPanelScore(reportId: string): Promise<PmsPanelScore | null> {
  const { data, error } = await client().from('pms_panel_scores').select('*').eq('report_id', reportId).maybeSingle();
  if (error) throw error;
  return data ? {
    reportId: data.report_id, score: data.score, reasonsForOutstanding: data.reasons_for_outstanding,
    reasonsBelowThreshold: data.reasons_below_threshold, suggestionsForImprovement: data.suggestions_for_improvement,
    integrity: data.integrity, adverseRemarks: data.adverse_remarks, criticalAssessment: data.critical_assessment,
    quorumPresent: data.quorum_present, membersTotal: data.members_total, recordedAt: data.recorded_at,
  } : null;
}

export interface PanelScoreInput {
  score: number; reasonsForOutstanding: string; reasonsBelowThreshold: string; suggestions: string;
  penPicture: PenPicture; integrity: string; adverseRemarks: string; criticalAssessment: string; quorumPresent: number;
}
/** penPicture.narrative is Part III's "Remarks by Evaluation Committee". */
export const recordPanelScore = (reportId: string, x: PanelScoreInput) => rpc('pms_record_panel_score', {
  p_report_id: reportId, p_score: x.score, p_reasons_outstanding: x.reasonsForOutstanding, p_reasons_below: x.reasonsBelowThreshold,
  p_suggestions: x.suggestions, p_pen_picture: { ratings: x.penPicture.ratings }, p_integrity: x.integrity,
  p_adverse_remarks: x.adverseRemarks, p_critical_assessment: x.criticalAssessment, p_remarks: x.penPicture.narrative,
  p_quorum_present: x.quorumPresent, p_signed_scan_path: null,
});

/** The guideline's 15 pen-picture items, grouped for PenPictureForm (pms_pen_picture_items). */
export async function loadPenPictureGroups(scale: string[]): Promise<PenPictureGroup[]> {
  const { data, error } = await client().from('pms_pen_picture_items').select('item_key, group_code, group_name, label, sort')
    .order('group_code').order('sort');
  if (error) throw error;
  const groups: PenPictureGroup[] = [];
  for (const r of data ?? []) {
    const title = `${r.group_code}. ${r.group_name}`;
    let g = groups.find(x => x.title === title);
    if (!g) { g = { title, scale, rows: [] }; groups.push(g); }
    g.rows.push({ key: r.item_key, label: r.label });
  }
  return groups;
}

export interface FinalizeInput {
  action: EcAction; finalScore: number | null; reasons: string; suggestions: string;
  generalComments: string; criticalAssessment: string; quorumPresent: number;
}
export const finalize2026 = (reportId: string, x: FinalizeInput) => rpc('pms_finalize_report_2026', {
  p_report_id: reportId, p_action: x.action, p_final_score: x.finalScore, p_reasons: x.reasons, p_suggestions: x.suggestions,
  p_general_comments: x.generalComments, p_critical_assessment: x.criticalAssessment, p_quorum_present: x.quorumPresent,
});

// --- Timeline and history ---
export async function timelineStatus(cycleId: string): Promise<TimelineStep[]> {
  const rows = await rpc<any[]>('pms_timeline_status', { p_cycle_id: cycleId });
  return (rows ?? []).map(r => ({ step: r.step, label: r.label, due: r.due, done: r.done, pending: r.pending, overdue: r.overdue }));
}
export async function delayReport(cycleId: string): Promise<DelayRow[]> {
  const rows = await rpc<any[]>('pms_delay_report', { p_cycle_id: cycleId });
  return (rows ?? []).map(r => ({ reportId: r.report_id, scientist: r.scientist, status: r.status, step: r.step, due: r.due, daysLate: r.days_late }));
}
export async function scoreHistory(staffId: string): Promise<ScoreHistoryRow[]> {
  const rows = await rpc<any[]>('pms_score_history', { p_staff_id: staffId });
  return (rows ?? []).map(r => ({
    cycleId: r.cycle_id, cycle: r.cycle, score: r.score, grade: r.grade,
    labAverage: r.lab_average == null ? null : Number(r.lab_average), normalised: r.normalised == null ? null : Number(r.normalised),
    remarks: r.remarks,
  }));
}
