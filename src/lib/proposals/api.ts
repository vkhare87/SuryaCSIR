import { supabase } from '../../utils/supabaseClient';
import { friendlyError } from '../errors';

export type RpcResult = { ok: true } | { ok: false, error: string };

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

export function submitProposal(id: string) {
  return callRpc('proposal_submit', { p_id: id });
}

export type StepDecision = 'APPROVE' | 'RETURN' | 'REJECT';

/** Complete, return or reject the current review step (proposal_record_step). */
export function recordStep(stepId: string, decision: StepDecision, notes: string, documentId: string | null) {
  return callRpc('proposal_record_step', {
    p_step_id: stepId, p_decision: decision, p_notes: notes, p_document_id: documentId,
  });
}

/** PME classifies a proposal submitted before tracks existed, and opens its steps. */
export function setTrack(id: string, track: string) {
  return callRpc('proposal_set_track', { p_id: id, p_track: track });
}

export interface SanctionInput {
  projectNo: string;
  sanctionRef: string;
  sanctionDate: string;
  amount: number;
  documentId: string;
}

/** Record the sanction; the database creates the project. Returns its ProjectID. */
export async function sanctionProposal(id: string, s: SanctionInput): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { data, error } = await supabase.rpc('proposal_sanction', {
    p_id: id, p_project_no: s.projectNo, p_sanction_ref: s.sanctionRef,
    p_sanction_date: s.sanctionDate, p_amount: s.amount, p_document_id: s.documentId,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, projectId: String(data) };
}
