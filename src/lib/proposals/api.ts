import { supabase } from '../../utils/supabaseClient';

export type RpcResult = { ok: true } | { ok: false, error: string };

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function submitProposal(id: string) {
  return callRpc('proposal_submit', { p_id: id });
}

export function setUnderReview(id: string, reviewBody: string, sentDate: string) {
  return callRpc('proposal_set_under_review', {
    p_id: id, p_body: reviewBody, p_sent_date: sentDate,
  });
}

export function requestRevision(id: string, notes: string) {
  return callRpc('proposal_request_revision', { p_id: id, p_notes: notes });
}

export function rejectProposal(id: string, reason: string) {
  return callRpc('proposal_reject', { p_id: id, p_reason: reason });
}

export function recommendProposal(id: string) {
  return callRpc('proposal_recommend', { p_id: id });
}

export function approveProposal(id: string, amount: number, sanctionDate: string) {
  return callRpc('proposal_approve', {
    p_id: id, p_amount: amount, p_date: sanctionDate,
  });
}

export function issueOM(
  id: string, omNumber: string, omDate: string, docId: string,
) {
  return callRpc('proposal_issue_om', {
    p_id: id, p_om_no: omNumber, p_om_date: omDate, p_doc_id: docId,
  });
}

export function archiveProposal(id: string) {
  return callRpc('proposal_archive', { p_id: id });
}

export function linkProject(id: string, projectNo: string) {
  return callRpc('proposal_link_project', { p_id: id, p_project_no: projectNo });
}
