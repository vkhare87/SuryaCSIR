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
/** expectedDate: the date the asker saw. The server refuses if it has changed since. */
export const answerPushBack = (id: string, accept: boolean, expectedDate: string) =>
  rpc('priority_answer', { p_id: id, p_accept: accept, p_expected_date: expectedDate });
export const markDone = (id: string) => rpc('priority_done', { p_id: id });
export const withdraw = (id: string) => rpc('priority_withdraw', { p_id: id });

export interface PinCandidate { userId: string; name: string; note: string }

/** Project staff with a login and an engagement in force today on a project I lead as PI.
 * They hold no staff row, so the staff list misses them; priority_may_pin allows them. */
export async function loadProjectStaffCandidates(myStaffId: string, today: string): Promise<PinCandidate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_engagements')
    .select('project_staff_persons!inner(user_id, name), projects!inner("ProjectNo", pi_staff_id)')
    .eq('projects.pi_staff_id', myStaffId).lte('from_on', today).gte('to_on', today)
    .not('project_staff_persons.user_id', 'is', null);
  if (error) { console.error('[home] project staff candidates load failed', error); return []; }
  const out = new Map<string, PinCandidate>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | undefined;
    const person = one<{ user_id: string | null; name: string }>(r.project_staff_persons);
    const project = one<{ ProjectNo: string }>(r.projects);
    if (person?.user_id && !out.has(person.user_id)) {
      out.set(person.user_id, { userId: person.user_id, name: person.name, note: `project staff, ${project?.ProjectNo ?? ''}`.trim() });
    }
  }
  return [...out.values()];
}

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
