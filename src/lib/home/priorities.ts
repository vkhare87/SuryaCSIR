import { supabase } from '../../utils/supabaseClient';

export interface WorkPriority {
  id: string;
  assigneeUserId: string;
  askedBy: string;
  title: string;
  reason: string;
  wantedBy: string;
  link: string | null;
  status: 'OPEN' | 'DONE' | 'WITHDRAWN';
  seenAt: string | null;
  pushbackReason: string | null;
  pushbackDate: string | null;
  pushbackAt: string | null;
  pushbackAnswer: 'ACCEPTED' | 'KEPT' | null;
  doneAt: string | null;
  createdAt: string;
}

const mapRow = (r: Record<string, unknown>): WorkPriority => ({
  id: r.id as string,
  assigneeUserId: r.assignee_user_id as string,
  askedBy: r.asked_by as string,
  title: r.title as string,
  reason: r.reason as string,
  wantedBy: r.wanted_by as string,
  link: (r.link as string | null) ?? null,
  status: r.status as WorkPriority['status'],
  seenAt: (r.seen_at as string | null) ?? null,
  pushbackReason: (r.pushback_reason as string | null) ?? null,
  pushbackDate: (r.pushback_date as string | null) ?? null,
  pushbackAt: (r.pushback_at as string | null) ?? null,
  pushbackAnswer: (r.pushback_answer as WorkPriority['pushbackAnswer']) ?? null,
  doneAt: (r.done_at as string | null) ?? null,
  createdAt: r.created_at as string,
});

/** Priorities on me and priorities I asked; RLS returns only those two kinds of row. */
export async function loadPriorities(): Promise<WorkPriority[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('work_priorities').select('*').order('wanted_by');
  if (error) { console.error('[home] priorities load failed', error); return []; }
  return (data ?? []).map(r => mapRow(r as Record<string, unknown>));
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Not connected');
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

export const pinPriority = (assignee: string, title: string, reason: string, wantedBy: string) =>
  rpc('priority_pin', { p_assignee: assignee, p_title: title, p_reason: reason, p_wanted_by: wantedBy });
export const markSeen = (id: string) => rpc('priority_seen', { p_id: id });
export const pushBack = (id: string, reason: string, newDate: string) =>
  rpc('priority_push_back', { p_id: id, p_reason: reason, p_new_date: newDate });
export const answerPushBack = (id: string, accept: boolean) => rpc('priority_answer', { p_id: id, p_accept: accept });
export const markDone = (id: string) => rpc('priority_done', { p_id: id });
export const withdraw = (id: string) => rpc('priority_withdraw', { p_id: id });

/** The asker's view of one priority, in a few words. */
export function askerState(p: WorkPriority): string {
  if (p.status === 'DONE') return 'done';
  if (p.status === 'WITHDRAWN') return 'withdrawn';
  if (p.pushbackAt && !p.pushbackAnswer) return `asks for ${p.pushbackDate}`;
  if (p.seenAt) return 'seen';
  return 'not seen yet';
}

/** Open priorities on this person first by date; closed ones I asked stay 14 days for the record. */
export function splitPriorities(all: WorkPriority[], userId: string, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - 14 * 86400000).toISOString();
  return {
    forMe: all.filter(p => p.assigneeUserId === userId && p.status === 'OPEN'),
    askedByMe: all.filter(p => p.askedBy === userId
      && (p.status === 'OPEN' || (p.doneAt ?? p.createdAt) >= cutoff)),
  };
}
