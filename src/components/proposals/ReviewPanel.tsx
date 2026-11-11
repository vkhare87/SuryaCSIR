import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleDashed, CornerUpLeft, X } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { SectionComments } from './SectionComments';
import { recordStep, sanctionProposal, setTrack, type StepDecision } from '../../lib/proposals/api';
import { uploadProposalDoc } from '../../lib/proposals/storage';
import { addComment, deleteComment, getSchemeLeader } from '../../lib/proposals/workspaceApi';
import { STEP_INFO } from '../../lib/proposals/reviewSteps';
import { SECTIONS } from '../../lib/proposals/readiness';
import { rupees } from '../../lib/projects/heads';
import { friendlyError } from '../../lib/errors';
import type { UserAccount } from '../../types';
import type { Proposal, ProposalSection, ReviewComment, ReviewStep, ReviewStepKind } from '../../types/proposal';

const IN_REVIEW = ['SUBMITTED', 'UNDER_REVIEW', 'RECOMMENDED'];
const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';

/**
 * Whether to offer this user the form for a step. A display hint only —
 * proposal_caller_may_act() in the database decides, including the co-PI case
 * this side cannot see.
 */
export function mayActOn(user: UserAccount, p: Proposal, kind: ReviewStepKind | 'SANCTION', schemeLeaderId: string | null): boolean {
  if (p.piUserId === user.id || p.createdBy === user.id) return false;
  const has = (r: string) => user.roles.includes(r as UserAccount['roles'][number]);
  if (has('MasterAdmin')) return true;
  switch (kind) {
    case 'PME_VETTING': return has('PME');
    case 'FINANCE': return has('FinanceAdmin');
    case 'REVIEW_COMMITTEE': return has('PME') || schemeLeaderId === user.id;
    case 'DIRECTOR_APPROVAL':
    case 'DIRECTOR_FORWARD': return has('Director') || has('PME');
    default: return has('PME');
  }
}

interface ReviewPanelProps {
  proposal: Proposal;
  user: UserAccount;
  onChanged: () => Promise<void>;
}

export function ReviewPanel({ proposal: p, user, onChanged }: ReviewPanelProps) {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  useEffect(() => {
    if (!p.track) return;
    let cancelled = false;
    getSchemeLeader(p.track).then((id) => { if (!cancelled) setLeaderId(id); }, () => {});
    return () => { cancelled = true; };
  }, [p.track]);

  const steps = useMemo(() => {
    const all = p.steps ?? [];
    const round = Math.max(0, ...all.map(s => s.round));
    return all.filter(s => s.round === round);
  }, [p.steps]);
  const current = steps.find(s => s.status === 'PENDING') ?? null;
  const inReview = IN_REVIEW.includes(p.status);
  const canReview = inReview && !!current && mayActOn(user, p, current.kind, leaderId);
  const canSanction = ['APPROVED', 'OM_ISSUED'].includes(p.status) && mayActOn(user, p, 'SANCTION', leaderId);
  const needsTrack = inReview && !p.track;

  if (p.status === 'DRAFT') return null;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-[500] font-serif text-text">Review</h2>
        <p className="text-xs text-text-muted">
          {p.track === 'HQ' ? 'CSIR HQ scheme' : p.track === 'ULIP' ? 'In-house (ULIP)' : 'Track not yet set'}
          {' · '}each step is completed against a signed scan.
        </p>
      </div>

      {needsTrack && <TrackPicker proposal={p} user={user} onChanged={onChanged} />}

      {steps.length > 0 && (
        <ol className="space-y-1.5">
          {steps.map(s => <StepRow key={s.id} step={s} isCurrent={s.id === current?.id} />)}
        </ol>
      )}

      {/* Keyed by step: each step starts with an empty note and no file attached. */}
      {canReview && current && <StepForm key={current.id} proposal={p} step={current} onChanged={onChanged} user={user} />}
      {inReview && current && !canReview && (
        <p className="text-xs text-text-muted">Waiting on: {STEP_INFO[current.kind].who}.</p>
      )}

      {canSanction && <SanctionForm proposal={p} onChanged={onChanged} />}

      {p.status === 'LINKED' && p.projectId && (
        <p className="text-sm text-text">
          Sanctioned and running as project{' '}
          <Link to={`/projects/${encodeURIComponent(p.projectId)}`} className="font-mono text-brand-blue underline">{p.linkedProjectNo ?? p.projectId}</Link>.
        </p>
      )}
      {p.status === 'REJECTED' && p.rejectionReason && (
        <p className="text-sm text-text"><span className="text-text-muted">Not approved: </span>{p.rejectionReason}</p>
      )}
    </Card>
  );
}

function StepRow({ step, isCurrent }: { step: ReviewStep; isCurrent: boolean }) {
  const info = STEP_INFO[step.kind];
  const icon = step.status === 'DONE' ? <Check size={14} className="text-archive-green" />
    : step.status === 'RETURNED' ? <CornerUpLeft size={14} className="text-turmeric" />
    : step.status === 'REJECTED' ? <X size={14} className="text-danger" />
    : <CircleDashed size={14} className={isCurrent ? 'text-terracotta' : 'text-text-muted'} />;
  return (
    <li className={clsx('flex items-start gap-2 text-sm', step.status === 'SKIPPED' && 'opacity-60')}>
      <span className="mt-0.5">{icon}</span>
      <span className="flex-1">
        <span className={clsx(isCurrent ? 'font-medium text-text' : 'text-text')}>{info.label}</span>
        {step.status === 'SKIPPED' && <span className="text-text-muted"> — skipped</span>}
        {step.decidedAt && (
          <span className="block text-xs text-text-muted">
            <span className="font-mono">{new Date(step.decidedAt).toLocaleDateString('en-IN')}</span>
            {step.notes && ` · ${step.notes}`}
          </span>
        )}
      </span>
    </li>
  );
}

function StepForm({ proposal: p, step, user, onChanged }: { proposal: Proposal; step: ReviewStep; user: UserAccount; onChanged: () => Promise<void> }) {
  const info = STEP_INFO[step.kind];
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>(p.comments ?? []);
  const [busy, setBusy] = useState<StepDecision | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setComments(p.comments ?? []); }, [p.comments]);

  async function decide(decision: StepDecision) {
    setBusy(decision); setError('');
    try {
      let documentId: string | null = null;
      if (decision === 'APPROVE') {
        if (!scan) { setError(`Attach the signed scan: ${info.scanHint.toLowerCase()}.`); return; }
        const up = await uploadProposalDoc(p.id, 'step_scan', scan);
        if (!up.ok) { setError(up.error); return; }
        documentId = up.document.id;
      }
      const res = await recordStep(step.id, decision, notes, documentId);
      if (!res.ok) { setError(res.error); return; }
      await onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function onAddComment(section: ProposalSection, body: string) {
    setError('');
    try { const c = await addComment(p.id, section, body); setComments(cs => [...cs, c]); }
    catch (e) { setError(friendlyError(e)); }
  }
  async function onDeleteComment(c: ReviewComment) {
    try { await deleteComment(c.id); setComments(cs => cs.filter(x => x.id !== c.id)); }
    catch (e) { setError(friendlyError(e)); }
  }

  const open = comments.filter(c => !c.resolvedAt).length;

  return (
    <div className="border-t border-border pt-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text">{info.label}</h3>
        <p className="text-xs text-text-muted">Recorded by: {info.who}</p>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm text-text">
          Comments for the PI, by section {open > 0 && <span className="text-text-muted">({open} open)</span>}
        </summary>
        <div className="mt-3 space-y-2">
          {SECTIONS.map(s => (
            <div key={s.key}>
              <p className="text-xs font-medium text-text-muted mb-1">{s.label}</p>
              <SectionComments section={s.key} comments={comments} mode="reviewer" currentUserId={user.id}
                onAdd={onAddComment} onDelete={onDeleteComment} />
            </div>
          ))}
        </div>
      </details>

      <label className="block">
        <span className="block text-xs font-medium text-text-muted mb-1">Note (shown in the history; required to return or reject)</span>
        <textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-text-muted mb-1">Signed scan — {info.scanHint} (PDF)</span>
        <input type="file" accept="application/pdf" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="text-sm text-text" />
      </label>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void decide('APPROVE')} isLoading={busy === 'APPROVE'} disabled={!!busy}>{info.approveLabel}</Button>
        <Button variant="secondary" onClick={() => void decide('RETURN')} isLoading={busy === 'RETURN'} disabled={!!busy}>
          Return for revision
        </Button>
        <Button variant="ghost" onClick={() => void decide('REJECT')} isLoading={busy === 'REJECT'} disabled={!!busy}>Reject</Button>
      </div>
    </div>
  );
}

function TrackPicker({ proposal: p, user, onChanged }: { proposal: Proposal; user: UserAccount; onChanged: () => Promise<void> }) {
  const [error, setError] = useState('');
  if (!mayActOn(user, p, 'PME_VETTING', null)) {
    return <p className="text-sm text-text-muted">This proposal predates review tracks. PME will classify it before review continues.</p>;
  }
  async function choose(track: 'ULIP' | 'HQ') {
    setError('');
    const res = await setTrack(p.id, track);
    if (!res.ok) setError(res.error); else await onChanged();
  }
  return (
    <div className="border border-border rounded-lg bg-background p-3 space-y-2">
      <p className="text-sm text-text">This proposal was submitted before review tracks existed. Which one is it?</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void choose('ULIP')}>In-house (ULIP)</Button>
        <Button size="sm" variant="secondary" onClick={() => void choose('HQ')}>CSIR HQ scheme</Button>
      </div>
      <p className="text-xs text-text-muted">Steps it has already passed are marked skipped.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function SanctionForm({ proposal: p, onChanged }: { proposal: Proposal; onChanged: () => Promise<void> }) {
  const [projectNo, setProjectNo] = useState(p.track === 'HQ' && p.categoryCode ? p.categoryCode : '');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState(p.requestedBudget ? String(p.requestedBudget) : '');
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sanction() {
    setBusy(true); setError('');
    try {
      if (!scan) { setError('Attach the scanned sanction order.'); return; }
      const up = await uploadProposalDoc(p.id, 'sanction_order', scan);
      if (!up.ok) { setError(up.error); return; }
      const res = await sanctionProposal(p.id, {
        projectNo, sanctionRef: ref, sanctionDate: date, amount: Number(amount) || 0, documentId: up.document.id,
      });
      if (!res.ok) { setError(res.error); return; }
      await onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-text">Record the sanction</h3>
        <p className="text-xs text-text-muted">
          This creates the project from the proposal, with its budget lines, dates and PI. Requested: {rupees(p.requestedBudget)}.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-text-muted mb-1">
            Project number{p.track === 'HQ' && p.categoryCode ? ` (${p.categoryCode} + six digits)` : ''}
          </span>
          <input className={`${inputCls} font-mono`} value={projectNo} onChange={(e) => setProjectNo(e.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-text-muted mb-1">Sanctioned amount (₹)</span>
          <input inputMode="numeric" className={`${inputCls} font-mono`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-text-muted mb-1">
            {p.track === 'HQ' ? 'Sanction OM number' : 'Sanction order number'}
          </span>
          <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-text-muted mb-1">Date of sanction</span>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-text-muted mb-1">Scanned sanction order (PDF)</span>
        <input type="file" accept="application/pdf" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="text-sm text-text" />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void sanction()} isLoading={busy}>Sanction and create the project</Button>
    </div>
  );
}
