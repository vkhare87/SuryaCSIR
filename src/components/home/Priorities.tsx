import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pin } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { BLOCK_TITLE, ROW, dueText } from './parts';
import {
  answerPushBack, askerState, markDone, markSeen, pinPriority, pushBack, withdraw,
} from '../../lib/home/priorities';
import type { WorkPriority } from '../../lib/home/priorities';
import { localIso } from '../../lib/home/today';

const INPUT = 'w-full h-9 px-3 rounded-lg border border-border bg-surface-raised text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60';

function useNames() {
  const { staff } = useData();
  return useMemo(() => {
    const byUser = new Map(staff.filter(s => s.user_id).map(s => [s.user_id as string, s.Name]));
    return (userId: string, fallback: string) => byUser.get(userId) ?? fallback;
  }, [staff]);
}

function PushBackForm({ p, onDone }: { p: WorkPriority; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) { setError('Give a reason of at least 10 characters.'); return; }
    if (!date || date <= p.wantedBy) { setError(`Pick a date after ${p.wantedBy}.`); return; }
    try { await pushBack(p.id, reason, date); onDone(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <form onSubmit={submit} className="w-full mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input aria-label="Why not by then" placeholder="Why not by then" value={reason} onChange={e => { setReason(e.target.value); setError(''); }} className={INPUT} />
      <input aria-label="New date" type="date" min={p.wantedBy} value={date} onChange={e => { setDate(e.target.value); setError(''); }} className={INPUT} />
      <Button type="submit" variant="secondary" size="sm">Ask for this date</Button>
      {error && <p role="alert" className="text-xs text-danger sm:col-span-3">{error}</p>}
    </form>
  );
}

/** "Do first": priorities a senior pinned on me. Amber, once per screen; the first row holds the screen's strong button. */
export function DoFirst({ now }: { now: Date }) {
  const { prioritiesForMe, refreshPriorities } = useHome();
  const name = useNames();
  const [pushing, setPushing] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (prioritiesForMe.length === 0) return null;

  const act = (fn: () => Promise<void>) => async () => {
    setError('');
    try { await fn(); refreshPriorities(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <Card className="p-5 border-2 border-turmeric">
      <p className={BLOCK_TITLE}><span>Do first · asked by your seniors</span><span className="font-mono">{prioritiesForMe.length} of 3</span></p>
      {prioritiesForMe.map((p, i) => {
        const due = dueText(p.wantedBy, now);
        const waiting = p.pushbackAt && !p.pushbackAnswer;
        return (
          <div key={p.id} className={clsx(ROW, 'flex-wrap')}>
            <div className="flex-1 min-w-[200px]">
              <p className={clsx('text-text', i === 0 ? 'text-base font-medium' : 'text-sm')}>{p.title}</p>
              <p className="text-xs text-text-muted">
                “{p.reason}” · {name(p.askedBy, 'your senior')}
                {waiting && <> · you asked for <span className="font-mono">{p.pushbackDate}</span>, no answer yet</>}
                {p.pushbackAnswer === 'KEPT' && <> · the date was kept</>}
              </p>
            </div>
            {due && <Badge variant={due.variant} className="font-mono normal-case shrink-0">by {p.wantedBy}</Badge>}
            <div className="flex flex-wrap gap-1.5">
              {p.link && <Link to={p.link}><Button type="button" size="sm" variant={i === 0 ? 'primary' : 'secondary'}>Open</Button></Link>}
              {!p.seenAt && <Button type="button" size="sm" variant={i === 0 && !p.link ? 'primary' : 'secondary'} onClick={act(() => markSeen(p.id))}>Seen it</Button>}
              {!waiting && <Button type="button" size="sm" variant="ghost" onClick={() => setPushing(pushing === p.id ? null : p.id)}>Cannot by then</Button>}
              <Button type="button" size="sm" variant={i === 0 && !p.link && p.seenAt ? 'primary' : 'secondary'} onClick={act(() => markDone(p.id))}>Mark done</Button>
            </div>
            {pushing === p.id && <PushBackForm p={p} onDone={() => { setPushing(null); refreshPriorities(); }} />}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
    </Card>
  );
}

function PinForm({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { staff } = useData();
  const { refreshPriorities } = useHome();
  const people = useMemo(
    () => staff.filter(s => s.user_id && s.user_id !== user?.id).sort((a, b) => a.Name.localeCompare(b.Name)),
    [staff, user],
  );
  const [who, setWho] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = localIso(new Date());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!who) { setError('Pick the person.'); return; }
    if (!title.trim()) { setError('Say what should be done first.'); return; }
    if (reason.trim().length < 10) { setError('Give a reason of at least 10 characters.'); return; }
    if (!date || date < today) { setError('Give a date, today or later.'); return; }
    setBusy(true);
    try { await pinPriority(who, title, reason, date); refreshPriorities(); onClose(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" onChange={() => setError('')}>
      <label className="block text-xs text-text-muted">Person
        <select aria-label="Person" value={who} onChange={e => setWho(e.target.value)} className={clsx(INPUT, 'mt-1')}>
          <option value="">Pick a person</option>
          {people.map(s => <option key={s.ID} value={s.user_id as string}>{s.Name}{s.Designation ? ` · ${s.Designation}` : ''}</option>)}
        </select>
      </label>
      <label className="block text-xs text-text-muted">What to do first
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Send the fund statement for HCP0054" className={clsx(INPUT, 'mt-1')} />
      </label>
      <label className="block text-xs text-text-muted">Why it comes first
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="The monitoring committee meets on Monday" className={clsx(INPUT, 'mt-1')} />
      </label>
      <label className="block text-xs text-text-muted">Wanted by
        <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className={clsx(INPUT, 'mt-1')} />
      </label>
      <p className="text-xs text-text-muted">A person holds at most three priorities. You may pin only for your division, your team, your project or your student.</p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="secondary" isLoading={busy}>Pin priority</Button>
      </div>
    </form>
  );
}

/** A button that opens the pin form. */
export function PinButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}><Pin size={15} className="mr-1.5" aria-hidden="true" />Pin a priority</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Pin a priority">
        {open && <PinForm onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

/** Priorities I asked: what the person did with each, and my answer to a new date. */
export function PrioritiesAsked() {
  const { prioritiesAsked, refreshPriorities } = useHome();
  const name = useNames();
  const [error, setError] = useState('');
  if (prioritiesAsked.length === 0) return null;
  const act = (fn: () => Promise<void>) => async () => {
    setError('');
    try { await fn(); refreshPriorities(); } catch (err) { setError((err as Error).message); }
  };
  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}><span>Priorities I asked</span><span className="font-mono">{prioritiesAsked.filter(p => p.status === 'OPEN').length} open</span></p>
      {prioritiesAsked.map((p) => {
        const state = askerState(p);
        const answer = p.status === 'OPEN' && p.pushbackAt && !p.pushbackAnswer;
        return (
          <div key={p.id} className={clsx(ROW, 'flex-wrap')}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-text">{p.title}</p>
              <p className="text-xs text-text-muted">
                {name(p.assigneeUserId, 'the person')} · by <span className="font-mono">{p.wantedBy}</span>
                {answer && p.pushbackReason && <> · “{p.pushbackReason}”</>}
              </p>
            </div>
            <Badge variant={answer ? 'warning' : state === 'done' ? 'success' : 'neutral'} className="normal-case shrink-0">{state}</Badge>
            {answer && <>
              <Button type="button" size="sm" variant="secondary" onClick={act(() => answerPushBack(p.id, true))}>Accept new date</Button>
              <Button type="button" size="sm" variant="ghost" onClick={act(() => answerPushBack(p.id, false))}>Keep date</Button>
            </>}
            {p.status === 'OPEN' && <Button type="button" size="sm" variant="ghost" onClick={act(() => withdraw(p.id))}>Withdraw</Button>}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
    </Card>
  );
}
