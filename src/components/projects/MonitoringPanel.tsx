import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { useData } from '../../contexts/DataContext';
import { fundSummary } from '../../lib/projects/fundSummary';
import { DECISION_LABELS, decisionsFor, slotState, type SlotState } from '../../lib/projects/monitoring';
import { rupees } from '../../lib/projects/heads';
import {
  addSlotMinutes, callReview, recordSlot, scheduleSlot, uploadProjectDocument,
} from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import type { ProjectInfo } from '../../types';
import type { ProjectFile, ReviewDecision, ReviewSlot } from '../../types/projectFile';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';
const STATE_BADGE: Record<SlotState, { label: string; variant: 'danger' | 'warning' | 'neutral' | 'success' | 'info' }> = {
  overdue: { label: 'Overdue', variant: 'danger' },
  'minutes-overdue': { label: 'Minutes overdue', variant: 'danger' },
  'due-soon': { label: 'Due soon', variant: 'warning' },
  upcoming: { label: 'Upcoming', variant: 'neutral' },
  done: { label: 'Done', variant: 'success' },
};

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

interface MonitoringPanelProps {
  project: ProjectInfo;
  file: ProjectFile;
  isOffice: boolean;
  isParty: boolean;
  /** Director or PME, not a party: may call a review. */
  canCall: boolean;
  onChanged: () => Promise<void>;
}

export function MonitoringPanel({ project, file, isOffice, isParty, canCall, onChanged }: MonitoringPanelProps) {
  const today = istToday();
  const funds = useMemo(() => fundSummary(file.budgetLines, file.receipts, file.expenditure), [file]);
  const live = file.milestones.filter(m => m.status !== 'DROPPED');
  const achieved = live.filter(m => m.status === 'ACHIEVED').length;
  const elapsed = useMemo(() => {
    const s = Date.parse(`${project.StartDate}T00:00:00`);
    const e = Date.parse(`${project.CompletioDate}T00:00:00`);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
    return Math.min(100, Math.max(0, Math.round((100 * (Date.parse(`${today}T00:00:00`) - s)) / (e - s))));
  }, [project, today]);
  const sanction = funds.total.sanctioned || null;
  const spentPct = sanction ? Math.round((100 * funds.total.spent) / sanction) : null;

  const sorted = useMemo(() => {
    const rank: Record<SlotState, number> = { overdue: 0, 'minutes-overdue': 1, 'due-soon': 2, upcoming: 3, done: 4 };
    return [...file.slots]
      .filter(s => s.status !== 'CANCELLED')
      .map(s => ({ s, state: slotState(s, today) }))
      .sort((a, b) => rank[a.state] - rank[b.state] || a.s.dueDate.localeCompare(b.s.dueDate));
  }, [file.slots, today]);
  const lastReport = useMemo(
    () => file.slots.filter(s => s.kind === 'PROGRESS_REPORT' && s.status === 'DONE').map(s => s.periodLabel).pop() ?? null,
    [file.slots],
  );
  const overdue = sorted.filter(x => x.state === 'overdue' || x.state === 'minutes-overdue').length;

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-[500] font-serif text-text">Review brief</h2>
            <p className="text-xs text-text-muted">Where the project stands, from its own record.</p>
          </div>
          {canCall && <CallReview project={project} onChanged={onChanged} />}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Time elapsed" value={elapsed === null ? '—' : `${elapsed}%`} />
          <Stat label="Money spent" value={spentPct === null ? rupees(funds.total.spent) : `${spentPct}%`}
            sub={sanction ? `${rupees(funds.total.spent)} of ${rupees(sanction)}` : 'No sanction on record'} />
          <Stat label="Milestones achieved" value={`${achieved} of ${live.length}`} />
          <Stat label="Overdue" value={String(overdue)} sub={lastReport ? `Last report: ${lastReport}` : 'No report filed yet'} danger={overdue > 0} />
        </dl>
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="text-base font-[500] font-serif text-text">Reviews and reports due</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-text-muted">
            No schedule. It is generated once the project has a stage, a start and an end date.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map(({ s, state }) => (
              <SlotRow key={s.id} slot={s} state={state} project={project} isOffice={isOffice} isParty={isParty} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={clsx('text-2xl font-[500] font-serif tabular-nums', danger ? 'text-danger' : 'text-text')}>{value}</dd>
      {sub && <dd className="text-xs text-text-muted">{sub}</dd>}
    </div>
  );
}

function SlotRow({ slot: s, state, project, isOffice, isParty, onChanged }: {
  slot: ReviewSlot; state: SlotState; project: ProjectInfo; isOffice: boolean; isParty: boolean; onChanged: () => Promise<void>;
}) {
  const { meetings, committees } = useData();
  const [mode, setMode] = useState<'schedule' | 'record' | 'minutes' | null>(null);
  const [meetingId, setMeetingId] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [decision, setDecision] = useState<ReviewDecision | ''>('');
  const [outcome, setOutcome] = useState('');
  const [minutes, setMinutes] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meeting = meetings.find(m => m.id === s.meetingId);
  const upcomingMeetings = useMemo(
    () => meetings.filter(m => m.meeting_date >= istToday()).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date)),
    [meetings],
  );
  const committeeName = (id: string) => committees.find(c => c.id === id)?.name ?? '';
  const isReport = s.kind === 'PROGRESS_REPORT';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); setMode(null); await onChanged(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }
  const uploadMinutes = async () => (minutes ? (await uploadProjectDocument(project.ProjectID, 'minutes', minutes)).id : null);

  return (
    <li className="py-2.5 space-y-2">
      <div className="flex items-start gap-3 text-sm">
        <span className="font-mono text-xs text-text-muted w-24 shrink-0 pt-0.5">{s.dueDate}</span>
        <span className="flex-1 text-text">
          {s.body} <span className="text-text-muted">· {s.periodLabel}</span>
          {s.notes && <span className="block text-xs text-text-muted">{s.notes}</span>}
          {meeting && s.status === 'PENDING' && <span className="block text-xs text-text-muted">On the agenda: {meeting.title} ({meeting.meeting_date})</span>}
          {s.status === 'DONE' && !isReport && (
            <span className="block text-xs text-text-muted">
              Held {s.heldOn}: {s.decision ? DECISION_LABELS[s.decision] : ''}{s.outcome ? ` — ${s.outcome}` : ''}
              {!s.minutesDocumentId && s.minutesDue && ` · minutes due ${s.minutesDue}`}
            </span>
          )}
          {isReport && s.reportId && <Link to={`/reports/${s.reportId}`} className="block text-xs text-brand-blue underline">Open the report</Link>}
        </span>
        <Badge variant={STATE_BADGE[state].variant}>{STATE_BADGE[state].label}</Badge>
      </div>

      <div className="flex flex-wrap gap-2 pl-28">
        {isReport && isParty && s.status === 'PENDING' && !s.reportId && (
          <Link to="/reports/new" className="text-xs text-brand-blue underline">Write the progress report</Link>
        )}
        {!isReport && isOffice && s.status === 'PENDING' && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode('schedule')}>Put on a meeting agenda</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('record')}>Record the outcome</Button>
          </>
        )}
        {!isReport && isOffice && s.status === 'DONE' && !s.minutesDocumentId && (
          <Button size="sm" variant="ghost" onClick={() => setMode('minutes')}>File the minutes</Button>
        )}
      </div>

      {mode === 'schedule' && (
        <div className="pl-28 flex gap-2">
          <select aria-label="Meeting" className={inputCls} value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
            <option value="">Choose an upcoming meeting…</option>
            {upcomingMeetings.map(m => <option key={m.id} value={m.id}>{m.meeting_date} — {m.title} ({committeeName(m.committee_id)})</option>)}
          </select>
          <Button size="sm" onClick={() => void run(() => scheduleSlot(s.id, meetingId))} isLoading={busy} disabled={!meetingId}>Add to agenda</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
      {mode === 'record' && (
        <div className="pl-28 grid sm:grid-cols-[10rem_14rem_1fr] gap-2">
          <input type="date" aria-label="Held on" className={inputCls} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          <select aria-label="Decision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
            <option value="">Decision…</option>
            {decisionsFor(s.kind).map(d => <option key={d} value={d}>{DECISION_LABELS[d]}</option>)}
          </select>
          <input aria-label="What was decided" placeholder="What was decided, in a line" className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          <label className="sm:col-span-3 text-xs text-text-muted">
            Signed minutes (PDF){s.kind === 'TASK_FORCE' ? ' — due within a week of the meeting' : ''}
            <input type="file" accept="application/pdf" onChange={(e) => setMinutes(e.target.files?.[0] ?? null)} className="block text-sm text-text mt-1" />
          </label>
          {(decision === 'FORECLOSURE_RECOMMENDED' || decision === 'KILL') && (
            <p className="sm:col-span-3 text-xs text-turmeric">Recorded here; the project is foreclosed only through a foreclosure request.</p>
          )}
          <div className="sm:col-span-3 flex gap-2">
            <Button size="sm" isLoading={busy} disabled={!heldOn || !decision}
              onClick={() => void run(async () => recordSlot(s.id, heldOn, decision as ReviewDecision, outcome, await uploadMinutes()))}>
              Record
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {mode === 'minutes' && (
        <div className="pl-28 flex gap-2 items-center">
          <input type="file" accept="application/pdf" aria-label="Minutes" onChange={(e) => setMinutes(e.target.files?.[0] ?? null)} className="text-sm text-text" />
          <Button size="sm" isLoading={busy} disabled={!minutes}
            onClick={() => void run(async () => addSlotMinutes(s.id, (await uploadMinutes()) as string))}>File</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="pl-28 text-xs text-danger">{error}</p>}
    </li>
  );
}

function CallReview({ project, onChanged }: { project: ProjectInfo; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Call for review</Button>;
  return (
    <div className="w-full max-w-md space-y-2 border border-border rounded-lg p-3 bg-background">
      <p className="text-xs text-text-muted">The PI is notified and the review is added to the schedule.</p>
      <input type="date" aria-label="Review by" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} />
      <input aria-label="What the review should look at" placeholder="What should the review look at?" className={inputCls}
        value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" isLoading={busy} disabled={!due || !reason.trim()} onClick={async () => {
          setBusy(true); setError('');
          try { await callReview(project.ProjectID, due, reason); setOpen(false); await onChanged(); }
          catch (e) { setError(friendlyError(e)); }
          finally { setBusy(false); }
        }}>Call the review</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
