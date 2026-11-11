import { useState } from 'react';
import clsx from 'clsx';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import {
  addMilestone, decideMilestone, reportMilestone, uploadProjectDocument, type MilestoneDecision,
} from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import { subStage } from '../../lib/projects/milestones';
import type { ProjectInfo } from '../../types';
import type { MilestoneStatus, ProjectMilestone } from '../../types/projectFile';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

const STATUS: Record<MilestoneStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  PROPOSED: { label: 'Proposed', variant: 'neutral' },
  PLANNED: { label: 'Planned', variant: 'info' },
  REPORTED: { label: 'Reported done', variant: 'warning' },
  ACHIEVED: { label: 'Achieved', variant: 'success' },
  DROPPED: { label: 'Dropped', variant: 'neutral' },
};

interface MilestonesPanelProps {
  project: ProjectInfo;
  startDate: string | null;
  milestones: ProjectMilestone[];
  isOffice: boolean;
  isParty: boolean;
  onChanged: () => Promise<void>;
}

export function MilestonesPanel({ project, startDate, milestones, isOffice, isParty, onChanged }: MilestonesPanelProps) {
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    setBusy(true); setError('');
    try { await addMilestone(project.ProjectID, title, target); setTitle(''); setTarget(''); await onChanged(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="text-base font-[500] font-serif text-text">Milestones</h2>
        {milestones.length === 0 && <p className="text-sm text-text-muted">No milestones yet.</p>}
        <ul className="divide-y divide-border">
          {milestones.map(m => (
            <MilestoneRow key={m.id} m={m} project={project} block={subStage(startDate, m.targetDate)}
              late={['PLANNED', 'PROPOSED'].includes(m.status) && m.targetDate < today}
              isOffice={isOffice} isParty={isParty} onChanged={onChanged} />
          ))}
        </ul>
      </Card>

      {(isOffice || isParty) && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-medium text-text">Add a milestone</h3>
          <div className="grid sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">What will be done</span>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">Target date</span>
              <input type="date" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <Button onClick={() => void add()} isLoading={busy} disabled={!title.trim() || !target}>Add</Button>
          </div>
          <p className="text-xs text-text-muted">
            {isOffice ? 'Milestones PME adds are planned straight away.' : 'PME confirms a milestone you propose before it counts in the plan.'}
          </p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </Card>
      )}
    </div>
  );
}

function MilestoneRow({ m, project, block, late, isOffice, isParty, onChanged }: {
  m: ProjectMilestone; project: ProjectInfo; block: number | null; late: boolean;
  isOffice: boolean; isParty: boolean; onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'report' | MilestoneDecision | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); setMode(null); setNote(''); await onChanged(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }
  const decide = (d: MilestoneDecision) => run(() => decideMilestone(m.id, d, note));
  const report = () => run(async () => {
    if (!scan) throw new Error('Attach the evidence (PDF).');
    const doc = await uploadProjectDocument(project.ProjectID, 'milestone_evidence', scan);
    await reportMilestone(m.id, date, note, doc.id);
  });

  return (
    <li className="py-2.5 space-y-2">
      <div className="flex items-start gap-3 text-sm">
        <span className="font-mono text-xs text-text-muted w-24 shrink-0 pt-0.5">{m.targetDate}</span>
        <span className="flex-1 text-text">
          {m.title}
          {block && <span className="ml-2 text-[11px] text-text-muted">sub-stage {block}</span>}
          {m.achievedOn && <span className="block text-xs text-text-muted">Done {m.achievedOn}{m.reportNote ? ` · ${m.reportNote}` : ''}</span>}
          {m.decisionNote && <span className="block text-xs text-text-muted">PME: {m.decisionNote}</span>}
        </span>
        <span className="flex items-center gap-2">
          {late && <span className={clsx('text-[11px]', 'text-danger')}>overdue</span>}
          <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-28">
        {isParty && m.status === 'PLANNED' && <Button size="sm" variant="secondary" onClick={() => setMode('report')}>Report done</Button>}
        {isOffice && m.status === 'PROPOSED' && <Button size="sm" variant="secondary" onClick={() => void decide('ACCEPT')} isLoading={busy}>Accept into plan</Button>}
        {isOffice && m.status === 'REPORTED' && <Button size="sm" variant="secondary" onClick={() => void decide('CONFIRM')} isLoading={busy}>Confirm achieved</Button>}
        {isOffice && m.status === 'REPORTED' && <Button size="sm" variant="ghost" onClick={() => setMode('RETURN')}>Send back</Button>}
        {isOffice && ['PROPOSED', 'PLANNED'].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => setMode('DROP')}>Drop</Button>}
      </div>
      {mode === 'report' && (
        <div className="pl-28 grid sm:grid-cols-[10rem_1fr] gap-2">
          <input type="date" aria-label="Date achieved" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          <input aria-label="What was done" placeholder="What was done" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          <input type="file" accept="application/pdf" aria-label="Evidence" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="text-sm text-text sm:col-span-2" />
          <div className="sm:col-span-2 flex gap-2">
            <Button size="sm" onClick={() => void report()} isLoading={busy} disabled={!date}>Report</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {(mode === 'RETURN' || mode === 'DROP') && (
        <div className="pl-28 flex gap-2">
          <input aria-label="Reason" placeholder="Why?" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" onClick={() => void decide(mode)} isLoading={busy} disabled={!note.trim()}>{mode === 'DROP' ? 'Drop' : 'Send back'}</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="pl-28 text-xs text-danger">{error}</p>}
    </li>
  );
}
