import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ROW } from './parts';
import { busyDuring, callMeeting, cancelMeeting, loadMyMeetings, replyMeeting, timeLabel, toInstants } from '../../lib/home/meetings';
import type { GeneralMeeting, Reply } from '../../lib/home/meetings';
import { localIso } from '../../lib/home/today';

const INPUT = 'w-full h-9 px-3 rounded-lg border border-border bg-surface-raised text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60';

function CallForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { staff } = useData();
  const people = useMemo(() => staff.filter(s => s.user_id && s.user_id !== user?.id).sort((a, b) => a.Name.localeCompare(b.Name)), [staff, user]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localIso(new Date()));
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [place, setPlace] = useState('');
  const [link, setLink] = useState('');
  const [agenda, setAgenda] = useState('');
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const times = toInstants(date, start, end);
  const pickedKey = [...picked].sort().join('|');
  useEffect(() => {
    if (!times || picked.size === 0) { setBusy(new Set()); return; }
    let cancelled = false;
    busyDuring([...picked], times.startsAt, times.endsAt).then((b) => { if (!cancelled) setBusy(b); }, () => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined ids and the two instants
  }, [pickedKey, times?.startsAt, times?.endsAt]);

  const shown = people.filter(s => !filter || s.Name.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Give the meeting a title.'); return; }
    if (!times) { setError('The meeting must end after it starts.'); return; }
    if (picked.size === 0) { setError('Invite at least one person.'); return; }
    if (link.trim() && !link.trim().startsWith('https://')) { setError('The link must start with https://'); return; }
    setSending(true);
    try { await callMeeting({ title, ...times, place, link: link.trim(), agenda, invitees: [...picked] }); onDone(); }
    catch (err) { setError((err as Error).message); } finally { setSending(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" onChange={() => setError('')}>
      <label className="block text-xs text-text-muted">Title
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Results of batch 4" className={clsx(INPUT, 'mt-1')} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs text-text-muted">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} className={clsx(INPUT, 'mt-1')} /></label>
        <label className="block text-xs text-text-muted">From<input type="time" value={start} onChange={e => setStart(e.target.value)} className={clsx(INPUT, 'mt-1')} /></label>
        <label className="block text-xs text-text-muted">To<input type="time" value={end} onChange={e => setEnd(e.target.value)} className={clsx(INPUT, 'mt-1')} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-text-muted">Place<input value={place} onChange={e => setPlace(e.target.value)} placeholder="Room 12" className={clsx(INPUT, 'mt-1')} /></label>
        <label className="block text-xs text-text-muted">Online link<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" className={clsx(INPUT, 'mt-1')} /></label>
      </div>
      <fieldset className="text-xs text-text-muted">
        <legend className="mb-1">People · <span className="font-mono">{picked.size}</span> picked{busy.size > 0 && <span className="text-badge-warning-fg"> · <span className="font-mono">{busy.size}</span> busy then</span>}</legend>
        <input aria-label="Find a person" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a person" className={INPUT} />
        <div className="max-h-40 overflow-y-auto mt-1 rounded-lg border border-border">
          {shown.map(s => (
            <label key={s.ID} className="flex items-center gap-2 px-2 py-1.5 text-sm text-text hover:bg-surface-hover">
              <input type="checkbox" checked={picked.has(s.user_id as string)} onChange={() => toggle(s.user_id as string)} />
              <span className="flex-1 truncate">{s.Name}</span>
              {busy.has(s.user_id as string) && <span className="text-xs text-badge-warning-fg">busy then</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs text-text-muted">Agenda
        <textarea value={agenda} onChange={e => setAgenda(e.target.value)} rows={3}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-surface-raised text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60" />
      </label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="secondary" isLoading={sending}>Send the invitation</Button>
      </div>
    </form>
  );
}

/** Meetings I called or was invited to, in the next days; reply in place. Absent when there are none. */
export function MyMeetings() {
  const { user } = useAuth();
  const [list, setList] = useState<GeneralMeeting[]>([]);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const reload = useCallback(() => { if (user) loadMyMeetings(user.id).then(setList); }, [user]);
  useEffect(() => { reload(); }, [reload]);

  const act = (fn: () => Promise<void>) => async () => {
    setError('');
    try { await fn(); reload(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div>
      <div className="flex justify-end -mt-1 mb-1"><CallMeetingButtonLink onCalled={reload} /></div>
      {list.length === 0 && <p className="text-sm text-text-muted">No meeting in the next two weeks.</p>}
      {list.slice(0, 5).map(m => (
        <div key={m.id} className={clsx(ROW, 'flex-wrap')}>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text truncate" title={m.title}>{m.title}</p>
            <p className="text-xs text-text-muted truncate">
              <span className="font-mono">{timeLabel(m.startsAt, m.endsAt)}</span>{m.place ? ` · ${m.place}` : ''}
              {m.myReply === undefined ? <> · <span className="font-mono">{m.yes}</span> of <span className="font-mono">{m.invitees}</span> said yes</> : null}
            </p>
          </div>
          {m.myReply !== undefined && (
            <div className="flex gap-1" role="group" aria-label={`Reply to ${m.title}`}>
              {(['YES', 'NO', 'MAYBE'] as Reply[]).map(r => (
                <Button key={r} type="button" size="sm" variant={m.myReply === r ? 'secondary' : 'ghost'} aria-pressed={m.myReply === r}
                  onClick={act(() => replyMeeting(m.id, r))}>{r === 'YES' ? 'Yes' : r === 'NO' ? 'No' : 'Maybe'}</Button>
              ))}
            </div>
          )}
          {m.myReply === undefined && (cancelling === m.id
            ? <><span className="text-xs text-text-muted">Tell everyone it is off?</span>
              <Button type="button" size="sm" variant="secondary" onClick={act(async () => { await cancelMeeting(m.id); setCancelling(null); })}>Yes, cancel</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(null)}>Keep</Button></>
            : <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(m.id)}>Cancel</Button>)}
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

function CallMeetingButtonLink({ onCalled }: { onCalled: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-text-muted inline-block py-1.5 -my-1.5 hover:underline">Call a meeting</button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Call a meeting">
        {open && <CallForm onDone={() => { setOpen(false); onCalled(); }} />}
      </Modal>
    </>
  );
}
