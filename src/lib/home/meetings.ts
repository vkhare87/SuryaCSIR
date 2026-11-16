import { supabase } from '../../utils/supabaseClient';

export type Reply = 'YES' | 'NO' | 'MAYBE';

export interface GeneralMeeting {
  id: string;
  title: string;
  organiser: string;
  startsAt: string;
  endsAt: string;
  place: string;
  link: string | null;
  agenda: string;
  /** My reply when I am invited; undefined when I organise it. */
  myReply?: Reply | null;
  invitees: number;
  yes: number;
}

/** Meetings I organise or am invited to, from now to `days` ahead, not cancelled. */
export async function loadMyMeetings(userId: string, days = 14): Promise<GeneralMeeting[]> {
  if (!supabase) return [];
  const from = new Date(Date.now() - 2 * 3600000).toISOString();
  const to = new Date(Date.now() + days * 86400000).toISOString();
  const m = await supabase.from('general_meetings').select('*').is('cancelled_at', null)
    .gte('ends_at', from).lte('starts_at', to).order('starts_at');
  if (m.error) { console.error('[home] meetings load failed', m.error); return []; }
  const ids = (m.data ?? []).map(x => x.id as string);
  const inv = ids.length ? await supabase.from('general_meeting_invitees').select('meeting_id, user_id, reply').in('meeting_id', ids) : { data: [] };
  const rows = inv.data ?? [];
  return (m.data ?? []).map((x) => {
    const mine = rows.filter(r => r.meeting_id === x.id);
    const me = mine.find(r => r.user_id === userId);
    return {
      id: x.id as string, title: x.title as string, organiser: x.organiser as string,
      startsAt: x.starts_at as string, endsAt: x.ends_at as string, place: (x.place as string) ?? '',
      link: (x.link as string | null) ?? null, agenda: (x.agenda as string) ?? '',
      myReply: x.organiser === userId ? undefined : ((me?.reply as Reply | null) ?? null),
      invitees: mine.length, yes: mine.filter(r => r.reply === 'YES').length,
    };
  });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Not connected');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface MeetingDraft { title: string; startsAt: string; endsAt: string; place: string; link: string; agenda: string; invitees: string[] }
export const callMeeting = (d: MeetingDraft) => rpc<string>('general_meeting_create', {
  p_title: d.title, p_starts: d.startsAt, p_ends: d.endsAt, p_place: d.place, p_link: d.link || null, p_agenda: d.agenda, p_invitees: d.invitees,
});
export const replyMeeting = (id: string, reply: Reply) => rpc<void>('general_meeting_reply', { p_id: id, p_reply: reply });
export const cancelMeeting = (id: string) => rpc<void>('general_meeting_cancel', { p_id: id });

/** Who among these people is in another meeting during this time. Times only, never titles. */
export async function busyDuring(users: string[], startsAt: string, endsAt: string): Promise<Set<string>> {
  if (users.length === 0) return new Set();
  const rows = await rpc<{ user_id: string }[]>('general_meeting_busy', { p_users: users, p_from: startsAt, p_to: endsAt });
  return new Set(rows.map(r => r.user_id));
}

/** A local date and two local times as ISO instants. */
export function toInstants(date: string, start: string, end: string): { startsAt: string; endsAt: string } | null {
  const s = new Date(`${date}T${start}`);
  const e = new Date(`${date}T${end}`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  return { startsAt: s.toISOString(), endsAt: e.toISOString() };
}

/** "14 Nov, 10:30–11:30" in the browser's time zone. */
export function timeLabel(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const hm = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${hm(s)}–${hm(e)}`;
}
