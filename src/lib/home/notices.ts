import { supabase } from '../../utils/supabaseClient';
import { fetchAll } from '../data/fetchAll';

export type NoticeKind = 'OFFICE_ORDER' | 'CIRCULAR' | 'NOTICE' | 'EVENT';

export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = {
  OFFICE_ORDER: 'Office order', CIRCULAR: 'Circular', NOTICE: 'Notice', EVENT: 'Event',
};

export interface Notice {
  id: string;
  noticeNo: string;
  kind: NoticeKind;
  title: string;
  body: string;
  issuedBy: string;
  issuedOn: string;
  divisions: string[] | null;
  mustAck: boolean;
  ackBy: string | null;
  /** When I read it, and when I acknowledged it; null when not yet. */
  readAt: string | null;
  ackedAt: string | null;
}

const RECENT_NOTICES = 30;

/** Notices in force for me (not replaced, not expired), orders needing
 * "I have read it" first, then newest first, with my own read state. */
export async function loadNotices(today: string): Promise<Notice[]> {
  const db = supabase;
  if (!db) return [];
  const inForce = () => db.from('notices').select('*').is('superseded_by', null)
    .or(`valid_to.is.null,valid_to.gte.${today}`);
  const [n, r] = await Promise.all([
    inForce()
      .order('must_ack', { ascending: false })
      .order('issued_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(RECENT_NOTICES),
    fetchAll<{ notice_id: string; read_at: string | null; acked_at: string | null }>(
      db.from('notice_reads').select('notice_id, read_at, acked_at').order('notice_id').order('user_id'),
    ),
  ]);
  if (n.error) { console.error('[home] notices load failed', n.error); return []; }
  if (r.error) console.error('[home] notice reads load failed', r.error);
  const reads = new Map(r.data.map(x => [x.notice_id, x]));
  const rows = new Map((n.data ?? []).map(x => [x.id as string, x]));
  // When RECENT_NOTICES is saturated, ensure older must_ack orders are never cut off.
  if ((n.data ?? []).length >= RECENT_NOTICES) {
    const ack = await fetchAll<Record<string, unknown>>(
      inForce().eq('must_ack', true).order('issued_on', { ascending: false }).order('id'),
    );
    if (ack.error) console.error('[home] notices to acknowledge load failed', ack.error);
    for (const x of ack.data) rows.set(x.id as string, x);
  }
  return [...rows.values()].map((x) => {
    const read = reads.get(x.id as string);
    return {
      id: x.id as string, noticeNo: x.notice_no as string, kind: x.kind as NoticeKind, title: x.title as string,
      body: (x.body as string) ?? '', issuedBy: x.issued_by as string, issuedOn: x.issued_on as string,
      divisions: (x.audience_divisions as string[] | null) ?? null, mustAck: Boolean(x.must_ack), ackBy: (x.ack_by as string | null) ?? null,
      readAt: (read?.read_at as string | undefined) ?? null, ackedAt: (read?.acked_at as string | undefined) ?? null,
    };
  });
}

/** Unacknowledged orders first (soonest ack-by first), then unread, then the rest by date. */
export function orderNotices(list: Notice[], myUserId: string): Notice[] {
  const rank = (n: Notice) => (n.issuedBy === myUserId ? 3 : n.mustAck && !n.ackedAt ? 0 : !n.readAt ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b)
    || (a.ackBy ?? '9999').localeCompare(b.ackBy ?? '9999')
    || b.issuedOn.localeCompare(a.issuedOn));
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Not connected');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const markNoticeRead = (id: string, ack = false) => rpc<void>('notice_mark_read', { p_id: id, p_ack: ack });

export interface NoticeDraft { kind: NoticeKind; title: string; body: string; divisions: string[] | null; mustAck: boolean; ackBy: string | null }
export const issueNotice = (d: NoticeDraft) => rpc<string>('notice_issue', {
  p_kind: d.kind, p_title: d.title, p_body: d.body, p_divisions: d.divisions, p_must_ack: d.mustAck, p_ack_by: d.ackBy,
});

export interface ReadCounts { readers: number; read: number; acked: number; notAcked: string[] }
export async function noticeReadCounts(id: string): Promise<ReadCounts> {
  const rows = await rpc<{ readers: number; read: number; acked: number; not_acked: string[] }[]>('notice_read_counts', { p_id: id });
  const r = rows[0];
  return { readers: r.readers, read: r.read, acked: r.acked, notAcked: r.not_acked ?? [] };
}
