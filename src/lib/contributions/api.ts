import { supabase } from '../../utils/supabaseClient';
import { mapContributionEventRow } from '../../utils/dataMapper';
import type { WriteResult } from '../data/entityWrite';
import type { FileType } from '../../utils/fileTypes';
import type { ContributionAction, ContributionEvent, DataSteward } from '../../types';

export interface CreateContributionInput {
  domain: FileType;
  recordRef: string | null;
  divisionCode: string | null;
  title: string;
  reason: string;
  link: string | null;
  dueDate: string | null;
  prefill: Record<string, unknown>;
  assigneeId: string | null;
}

export async function createContributionRequest(
  input: CreateContributionInput,
): Promise<WriteResult & { id?: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { data, error } = await supabase.rpc('contribution_request_create', {
    p_domain: input.domain, p_record_ref: input.recordRef, p_division: input.divisionCode,
    p_title: input.title, p_reason: input.reason, p_link: input.link,
    p_due: input.dueDate, p_prefill: input.prefill, p_assignee: input.assigneeId,
  });
  return error ? { ok: false, error: error.message } : { ok: true, id: String(data) };
}

export async function actOnContributionRequest(
  id: string,
  action: ContributionAction,
  opts: { note?: string; target?: string; response?: Record<string, unknown> } = {},
): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc('contribution_request_act', {
    p_id: id, p_action: action, p_note: opts.note ?? null,
    p_target: opts.target ?? null, p_response: opts.response ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setDataSteward(
  domain: FileType, divisionCode: string | null, userId: string,
  kind: DataSteward['kind'], cadenceDays: number,
): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc('data_steward_set', {
    p_domain: domain, p_division: divisionCode, p_user: userId, p_kind: kind, p_cadence: cadenceDays,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeDataSteward(id: string): Promise<WriteResult> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const { error } = await supabase.rpc('data_steward_remove', { p_id: id });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listRequestEvents(id: string): Promise<ContributionEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('contribution_request_events')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listRequestEvents failed', error);
    return [];
  }
  return (data ?? []).map(mapContributionEventRow);
}
