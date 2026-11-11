import { supabase } from '../../utils/supabaseClient';
import { createSignedUrl } from '../documents/registry';
import { friendlyError } from '../errors';
import type {
  ExpenditurePeriod, ProjectDocType, ProjectDocument, ProjectFile, ProjectMilestone,
} from '../../types/projectFile';

const BUCKET = 'project-documents';
const MAX_BYTES = 25 * 1024 * 1024;

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

const num = (v: any) => Number(v ?? 0);

/** The ledger, plan and history of one project. Tables from 20261111000001/2; empty until applied. */
export async function loadProjectFile(projectId: string): Promise<ProjectFile> {
  const c = client();
  const [b, r, e, m, d, ev] = await Promise.all([
    c.from('project_budget_lines').select('*').eq('project_id', projectId).order('fiscal_year'),
    c.from('project_fund_receipts').select('*').eq('project_id', projectId).order('received_on').order('recorded_at'),
    c.from('project_expenditure').select('*').eq('project_id', projectId).order('fiscal_year').order('recorded_at'),
    c.from('project_milestones').select('*').eq('project_id', projectId).order('target_date'),
    c.from('project_documents').select('*').eq('project_id', projectId).order('uploaded_at', { ascending: false }),
    c.from('project_events').select('*').eq('project_id', projectId).order('at', { ascending: false }).limit(200),
  ]);
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
