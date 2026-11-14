import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import {
  NOTICE_KIND_LABEL, issueNotice, loadNotices, markNoticeRead, noticeReadCounts, orderNotices,
} from '../../lib/home/notices';
import type { Notice, NoticeKind, ReadCounts } from '../../lib/home/notices';
import { localIso } from '../../lib/home/today';
import type { Role } from '../../types';

const INPUT = 'w-full h-9 px-3 rounded-lg border border-border bg-surface-raised text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60';
const ISSUERS: Role[] = ['Director', 'HOD', 'DivisionHead', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const MAX_ROWS = 5;

function IssueForm({ onDone }: { onDone: () => void }) {
  const { user, divisionCode } = useAuth();
  const wide = Boolean(user?.roles.some(r => r === 'Director' || r === 'HRAdmin' || r === 'SystemAdmin' || r === 'MasterAdmin'));
  const [kind, setKind] = useState<NoticeKind>('NOTICE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [toAll, setToAll] = useState(wide);
  const [mustAck, setMustAck] = useState(false);
  const [ackBy, setAckBy] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Give the notice a title.'); return; }
    if (!toAll && !divisionCode) { setError('Your role has no division. Only the Director or an admin desk issues to all.'); return; }
    setBusy(true);
    try {
      await issueNotice({ kind, title, body, divisions: toAll ? null : [divisionCode as string], mustAck, ackBy: mustAck && ackBy ? ackBy : null });
      onDone();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" onChange={() => setError('')}>
      <label className="block text-xs text-text-muted">Kind
        <select value={kind} onChange={e => setKind(e.target.value as NoticeKind)} className={clsx(INPUT, 'mt-1')}>
          {(Object.keys(NOTICE_KIND_LABEL) as NoticeKind[]).map(k => <option key={k} value={k}>{NOTICE_KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="block text-xs text-text-muted">Title
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Revised rates for tour claims" className={clsx(INPUT, 'mt-1')} />
      </label>
      <label className="block text-xs text-text-muted">Text
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface-raised text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60" />
      </label>
      <fieldset className="text-xs text-text-muted space-y-1">
        <legend className="mb-1">Who reads it</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={toAll} onChange={() => setToAll(true)} />The whole institute</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!toAll} onChange={() => setToAll(false)} />My division{divisionCode ? ` (${divisionCode})` : ''}</label>
      </fieldset>
      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input type="checkbox" checked={mustAck} onChange={e => setMustAck(e.target.checked)} />Each reader must press "I have read it"
      </label>
      {mustAck && (
        <label className="block text-xs text-text-muted">By
          <input type="date" min={localIso(new Date())} value={ackBy} onChange={e => setAckBy(e.target.value)} className={clsx(INPUT, 'mt-1')} />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="secondary" isLoading={busy}>Issue</Button>
      </div>
    </form>
  );
}

function Counts({ id }: { id: string }) {
  const [c, setC] = useState<ReadCounts | null>(null);
  useEffect(() => {
    let cancelled = false;
    noticeReadCounts(id).then((x) => { if (!cancelled) setC(x); }, () => {});
    return () => { cancelled = true; };
  }, [id]);
  if (!c) return null;
  return (
    <p className="text-xs text-text-muted mt-1">
      Read by <span className="font-mono">{c.read}</span> of <span className="font-mono">{c.readers}</span>
      {c.notAcked.length > 0 && <> · not yet acknowledged: {c.notAcked.slice(0, 8).join(', ')}{c.notAcked.length > 8 ? ` and ${c.notAcked.length - 8} more` : ''}</>}
    </p>
  );
}

/** The Notices block of the common desk: orders that need "I have read it" first, then unread, then the rest. */
export function NoticesBlock() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');
  const today = localIso(new Date());
  const reload = useCallback(() => { loadNotices(today).then(setNotices); }, [today]);
  useEffect(() => { reload(); }, [reload]);

  const ordered = useMemo(() => (notices && user ? orderNotices(notices, user.id) : []), [notices, user]);
  const canIssue = Boolean(user?.roles.some(r => ISSUERS.includes(r)));

  const read = async (n: Notice, ack: boolean) => {
    setError('');
    try { await markNoticeRead(n.id, ack); reload(); } catch (err) { setError((err as Error).message); }
  };
  const toggle = (n: Notice) => {
    const next = open === n.id ? null : n.id;
    setOpen(next);
    if (next && !n.readAt && n.issuedBy !== user?.id) void read(n, false);
  };

  return (
    <div>
      {canIssue && (
        <div className="flex justify-end -mt-1 mb-1">
          <button type="button" onClick={() => setIssuing(true)} className="text-xs text-text-muted inline-block py-1.5 -my-1.5 hover:underline">Issue a notice</button>
        </div>
      )}
      {notices !== null && ordered.length === 0 && <p className="text-sm text-text-muted">No notice is in force.</p>}
      {ordered.slice(0, MAX_ROWS).map((n) => {
        const mine = n.issuedBy === user?.id;
        const needsAck = n.mustAck && !n.ackedAt && !mine;
        return (
          <div key={n.id} className="py-2 border-t border-border first:border-t-0">
            <button type="button" onClick={() => toggle(n)} aria-expanded={open === n.id} className="w-full text-left group">
              <p className={clsx('text-sm truncate group-hover:underline', !n.readAt && !mine ? 'text-text font-medium' : 'text-text')} title={n.title}>
                {!n.readAt && !mine && <span className="sr-only">Unread: </span>}{n.title}
              </p>
              <p className="text-xs text-text-muted truncate">
                <span className="font-mono">{n.noticeNo}</span> · {NOTICE_KIND_LABEL[n.kind]}{mine ? ' · issued by you' : ''}
              </p>
            </button>
            {needsAck && <Badge variant="warning" className="normal-case mt-1">read and acknowledge{n.ackBy ? ` by ${n.ackBy}` : ''}</Badge>}
            {open === n.id && (
              <div className="mt-2">
                {n.body && <p className="text-sm text-text whitespace-pre-line">{n.body}</p>}
                {needsAck && <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => read(n, true)}>I have read it</Button>}
                {mine && <Counts id={n.id} />}
              </div>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
      <Modal isOpen={issuing} onClose={() => setIssuing(false)} title="Issue a notice">
        {issuing && <IssueForm onDone={() => { setIssuing(false); reload(); }} />}
      </Modal>
    </div>
  );
}
