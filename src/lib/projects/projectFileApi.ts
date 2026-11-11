import { supabase } from '../../utils/supabaseClient';
import { createSignedUrl } from '../documents/registry';
import { friendlyError } from '../errors';
import type {
  ChangeKind, ChangePayload, ChangeRequest, ChangeStep, MyChangeStep, DueSlot, ExpenditurePeriod, PortfolioRow, ProjectDocType, ProjectDocument, ProjectFile, ProjectMilestone,
  ReviewDecision, ReviewSlot,
} from '../../types/projectFile';

const BUCKET = 'project-documents';
const MAX_BYTES = 25 * 1024 * 1024;

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

const num = (v: any) => Number(v ?? 0);

const mapSlot = (x: any): ReviewSlot => ({
  id: x.id, kind: x.kind, body: x.body, periodLabel: x.period_label, dueDate: x.due_date, generated: !!x.generated,
  status: x.status, meetingId: x.meeting_id, heldOn: x.held_on, decision: x.decision, outcome: x.outcome,
  minutesDue: x.minutes_due, minutesDocumentId: x.minutes_document_id, reportId: x.report_id, notes: x.notes,
});

/** The ledger, plan and history of one project. Tables from 20261111000001/2; empty until applied. */
export async function loadProjectFile(projectId: string): Promise<ProjectFile> {
  const c = client();
  const [b, r, e, m, d, ev, sl, cr] = await Promise.all([
    c.from('project_budget_lines').select('*').eq('project_id', projectId).order('fiscal_year'),
    c.from('project_fund_receipts').select('*').eq('project_id', projectId).order('received_on').order('recorded_at'),
    c.from('project_expenditure').select('*').eq('project_id', projectId).order('fiscal_year').order('recorded_at'),
    c.from('project_milestones').select('*').eq('project_id', projectId).order('target_date'),
    c.from('project_documents').select('*').eq('project_id', projectId).order('uploaded_at', { ascending: false }),
    c.from('project_events').select('*').eq('project_id', projectId).order('at', { ascending: false }).limit(200),
    c.from('project_review_slots').select('*').eq('project_id', projectId).order('due_date'),
    c.from('project_change_requests').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);
  const changeIds = (cr.data ?? []).map((x: any) => x.id as string);
  const cs = changeIds.length
    ? await c.from('project_change_steps').select('*').in('change_id', changeIds).order('seq')
    : { data: [] };
  const steps = (cs.data ?? []).map((x: any): ChangeStep & { changeId: string } => ({
    id: x.id, changeId: x.change_id, round: x.round, seq: x.seq, kind: x.kind, status: x.status,
    decidedAt: x.decided_at, notes: x.notes, documentId: x.document_id,
  }));
  return {
    budgetLines: (b.data ?? []).map((x: any) => ({ fiscalYear: x.fiscal_year, head: x.head, item: x.item ?? '', amount: num(x.amount) })),
    receipts: (r.data ?? []).map((x: any) => ({
      id: x.id, receivedOn: x.received_on, fiscalYear: x.fiscal_year, amount: num(x.amount), head: x.head,
      source: x.source ?? '', orderNo: x.order_no ?? '', orderDate: x.order_date, ifdFileNo: x.ifd_file_no,
      ifdDate: x.ifd_date, documentId: x.document_id, notes: x.notes, reversesId: x.reverses_id, recordedAt: x.recorded_at,
    })),
    expenditure: (e.data ?? []).map((x: any) => ({
      id: x.id, fiscalYear: x.fiscal_year, period: x.period, head: x.head, amount: num(x.amount),
      documentId: x.document_id, notes: x.notes, reversesId: x.reverses_id, recordedAt: x.recorded_at,
    })),
    milestones: (m.data ?? []).map((x: any): ProjectMilestone => ({
      id: x.id, title: x.title, targetDate: x.target_date, status: x.status, achievedOn: x.achieved_on,
      reportNote: x.report_note, documentId: x.document_id, decisionNote: x.decision_note,
    })),
    documents: (d.data ?? []).map((x: any): ProjectDocument => ({
      id: x.id, docType: x.doc_type, storagePath: x.storage_path, fileName: x.file_name, uploadedAt: x.uploaded_at,
    })),
    events: (ev.data ?? []).map((x: any) => ({ id: x.id, at: x.at, kind: x.kind, summary: x.summary })),
    slots: (sl.data ?? []).map(mapSlot),
    changes: (cr.data ?? []).map((x: any): ChangeRequest => ({
      id: x.id, kind: x.kind, status: x.status, round: x.round, justification: x.justification ?? '',
      payload: x.payload ?? {}, increasePct: x.increase_pct === null ? null : num(x.increase_pct),
      orderNo: x.order_no, orderDate: x.order_date, ifdFileNo: x.ifd_file_no, decisionNote: x.decision_note,
      createdBy: x.created_by, createdAt: x.created_at, submittedAt: x.submitted_at, decidedAt: x.decided_at,
      steps: steps.filter(st => st.changeId === x.id && st.round === x.round),
    })),
  };
}

/** Store a scan in the project's folder and register it. PDF only, 25 MB. */
export async function uploadProjectDocument(projectId: string, docType: ProjectDocType, file: File): Promise<ProjectDocument> {
  if (file.type !== 'application/pdf') throw new Error('Only PDF files are allowed');
  if (file.size > MAX_BYTES) throw new Error('File exceeds 25 MB');
  const c = client();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const path = `${projectId}/${docType}/${Date.now()}_${safe}`;
  const { error: upErr } = await c.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(friendlyError(upErr));
  const { data, error } = await c.from('project_documents')
    .insert({ project_id: projectId, doc_type: docType, storage_path: path, file_name: file.name, file_size: file.size })
    .select().single();
  if (error || !data) {
    await c.storage.from(BUCKET).remove([path]);
    throw error ?? new Error('Upload failed');
  }
  return { id: data.id, docType: data.doc_type, storagePath: data.storage_path, fileName: data.file_name, uploadedAt: data.uploaded_at };
}

export function projectDocumentUrl(storagePath: string): Promise<string | null> {
  return createSignedUrl(BUCKET, storagePath);
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export interface ReceiptInput {
  receivedOn: string;
  amount: number;
  head: string | null;
  source: string;
  orderNo: string;
  orderDate: string | null;
  ifdFileNo: string | null;
  ifdDate: string | null;
  notes: string;
}

export function recordReceipt(projectId: string, r: ReceiptInput, documentId: string) {
  return rpc('project_record_receipt', {
    p_project_id: projectId, p_received_on: r.receivedOn, p_amount: r.amount, p_head: r.head, p_source: r.source,
    p_order_no: r.orderNo, p_order_date: r.orderDate, p_ifd_file_no: r.ifdFileNo, p_ifd_date: r.ifdDate,
    p_document_id: documentId, p_notes: r.notes,
  });
}

export function recordExpenditure(
  projectId: string, e: { fiscalYear: string; period: ExpenditurePeriod; head: string; amount: number; notes: string }, documentId: string,
) {
  return rpc('project_record_expenditure', {
    p_project_id: projectId, p_fiscal_year: e.fiscalYear, p_period: e.period, p_head: e.head,
    p_amount: e.amount, p_document_id: documentId, p_notes: e.notes,
  });
}

export function reverseEntry(kind: 'receipt' | 'expenditure', entryId: string, reason: string) {
  return rpc('project_reverse_entry', { p_kind: kind, p_entry_id: entryId, p_reason: reason });
}

export function addMilestone(projectId: string, title: string, targetDate: string) {
  return rpc('project_milestone_add', { p_project_id: projectId, p_title: title, p_target_date: targetDate });
}

export function reportMilestone(id: string, achievedOn: string, note: string, documentId: string) {
  return rpc('project_milestone_report', { p_id: id, p_achieved_on: achievedOn, p_note: note, p_document_id: documentId });
}

export type MilestoneDecision = 'ACCEPT' | 'CONFIRM' | 'RETURN' | 'DROP';

export function decideMilestone(id: string, decision: MilestoneDecision, note: string) {
  return rpc('project_milestone_decide', { p_id: id, p_decision: decision, p_note: note });
}

export type OutputKind = 'publication' | 'patent' | 'equipment';

/** Link an output to a project, or unlink it with null. */
export function linkOutput(kind: OutputKind, outputId: string, projectId: string | null) {
  return rpc('project_link_output', { p_kind: kind, p_output_id: outputId, p_project_id: projectId });
}

/** Milestones waiting on PME across all projects, for the PME desk. */
export async function milestonesAwaitingPme(): Promise<number> {
  const { count, error } = await client()
    .from('project_milestones').select('id', { count: 'exact', head: true }).in('status', ['PROPOSED', 'REPORTED']);
  if (error) return 0;
  return count ?? 0;
}

// --- Monitoring (20261111000003) ---

/** Put a review on a committee meeting's agenda. */
export function scheduleSlot(slotId: string, meetingId: string) {
  return rpc('project_slot_schedule', { p_slot_id: slotId, p_meeting_id: meetingId });
}

export function recordSlot(slotId: string, heldOn: string, decision: ReviewDecision, outcome: string, minutesDocumentId: string | null) {
  return rpc('project_slot_record', {
    p_slot_id: slotId, p_held_on: heldOn, p_decision: decision, p_outcome: outcome, p_minutes_document_id: minutesDocumentId,
  });
}

export function addSlotMinutes(slotId: string, documentId: string) {
  return rpc('project_slot_add_minutes', { p_slot_id: slotId, p_document_id: documentId });
}

export function callReview(projectId: string, dueDate: string, reason: string) {
  return rpc('project_call_review', { p_project_id: projectId, p_due_date: dueDate, p_reason: reason });
}

/** Every running project the caller may see, one row each (RLS-scoped view). */
export async function loadPortfolio(): Promise<PortfolioRow[]> {
  const { data, error } = await client().from('project_portfolio').select('*').order('project_no');
  if (error) throw error;
  return (data ?? []).map((x: any): PortfolioRow => ({
    projectId: x.project_id, projectNo: x.project_no, projectName: x.project_name ?? '', divisionCode: x.division_code ?? '',
    piName: x.pi_name ?? '', stage: x.stage, track: x.track, startDate: x.start_date, endDate: x.end_date,
    sanctionedCost: x.sanctioned_cost === null ? null : Number(x.sanctioned_cost),
    elapsedPct: x.elapsed_pct === null ? null : Number(x.elapsed_pct),
    received: Number(x.received ?? 0), spent: Number(x.spent ?? 0),
    milestonesTotal: Number(x.milestones_total ?? 0), milestonesAchieved: Number(x.milestones_achieved ?? 0),
    overdue: Number(x.overdue ?? 0), minutesOverdue: Number(x.minutes_overdue ?? 0),
    nextDue: x.next_due, lastReportOn: x.last_report_on, lastDecision: x.last_decision,
  }));
}

/** Reports and called reviews the caller owes on projects they lead, due within 30 days or past. */
export async function myDueSlots(): Promise<DueSlot[]> {
  const { data, error } = await client().rpc('my_due_project_slots');
  if (error) return [];
  return ((data ?? []) as any[]).map((x): DueSlot => ({
    slotId: x.slot_id, projectId: x.project_id, projectNo: x.project_no, kind: x.kind,
    body: x.body, periodLabel: x.period_label, dueDate: x.due_date,
  }));
}

/** Create (id null) or update a draft change request; returns its id. */
export function saveChange(id: string | null, projectId: string, kind: ChangeKind, justification: string, payload: ChangePayload) {
  return rpc<string>('project_change_save', {
    p_id: id, p_project_id: projectId, p_kind: kind, p_justification: justification, p_payload: payload,
  });
}

export function submitChange(id: string, documentId: string) {
  return rpc('project_change_submit', { p_id: id, p_document_id: documentId });
}

export function withdrawChange(id: string) {
  return rpc('project_change_withdraw', { p_id: id });
}

export type ChangeDecision = 'APPROVE' | 'RETURN' | 'REJECT';

export interface ChangeOrder { orderNo: string; orderDate: string | null; ifdFileNo: string; ifdDate: string | null }

export function recordChangeStep(stepId: string, decision: ChangeDecision, notes: string, documentId: string | null, order?: ChangeOrder) {
  return rpc('project_change_record_step', {
    p_step_id: stepId, p_decision: decision, p_notes: notes, p_document_id: documentId, p_meeting_id: null,
    p_order_no: order?.orderNo || null, p_order_date: order?.orderDate || null,
    p_ifd_file_no: order?.ifdFileNo || null, p_ifd_date: order?.ifdDate || null,
  });
}

/** Change-request steps waiting on the caller (20261112000001); empty until applied. */
export async function myChangeSteps(): Promise<MyChangeStep[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_change_steps');
  if (error) return [];
  return (data ?? []).map((x: any) => ({
    stepId: x.step_id, changeId: x.change_id, projectId: x.project_id, projectNo: x.project_no,
    changeKind: x.change_kind, stepKind: x.step_kind, submittedAt: x.submitted_at,
  }));
}
