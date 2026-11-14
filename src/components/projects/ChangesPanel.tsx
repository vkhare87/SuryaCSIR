import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import {
  CHANGE_KINDS, CHANGE_STATUS, STEP_LABELS, changeKindInfo, changeProblems, changeRoute, changeSummary, headCells,
  rceIncreasePct, type HeadCell,
} from '../../lib/projects/changes';
import { BUDGET_HEADS, headLabel, rupees } from '../../lib/projects/heads';
import { projectStage } from '../../lib/projects/stage';
import {
  recordChangeStep, saveChange, submitChange, uploadProjectDocument, withdrawChange, type ChangeDecision,
} from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import { useRules } from '../../contexts/RulesContext';
import { RULE, ruleNumber } from '../../lib/rules/csirRules';
import type { ProjectInfo } from '../../types';
import type {
  ChangeKind, ChangeLine, ChangePayload, ChangeRequest, ChangeStepKind, ProjectFile, ReappropriationMove, RephaseMove,
} from '../../types/projectFile';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';
const RUNNING = ['SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING'];
const OPEN = ['SUBMITTED', 'UNDER_REVIEW'];

interface ChangesPanelProps {
  project: ProjectInfo;
  file: ProjectFile;
  /** The PI (not a co-PI): raises requests. */
  isPi: boolean;
  isOffice: boolean;
  userId: string | null;
  roles: string[];
  onChanged: () => Promise<void>;
}

export function ChangesPanel({ project, file, isPi, isOffice, userId, roles, onChanged }: ChangesPanelProps) {
  const [editing, setEditing] = useState<ChangeRequest | 'new' | null>(null);
  const cells = useMemo(() => headCells(file.budgetLines, file.expenditure), [file]);
  const running = RUNNING.includes(projectStage(project) ?? '');
  const open = file.changes.find(c => OPEN.includes(c.status));
  const canRaise = running && (isPi || isOffice);

  // A display hint only; project_change_caller_may_act() decides.
  const mayAct = (k: ChangeStepKind) => !isPi && (roles.includes('MasterAdmin') || (
    k === 'FINANCE' ? roles.includes('FinanceAdmin')
      : k === 'DIRECTOR_APPROVAL' || k === 'DIRECTOR_FORWARD' ? roles.includes('Director') || roles.includes('PME')
        : roles.includes('PME')));

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-[500] font-serif text-text">Changes to the sanction</h2>
            <p className="text-xs text-text-muted max-w-2xl">
              More time, a revised cost, moving money between years, heads or laboratories, or closing early.
              Each goes through its approval route; on approval the change is applied to the project and the funds table.
            </p>
          </div>
          {canRaise && !editing && (
            <Button size="sm" onClick={() => setEditing('new')} disabled={!!open}
              title={open ? 'One change request at a time: another is in review' : undefined}>
              <Plus size={14} aria-hidden="true" /> Request a change
            </Button>
          )}
        </div>
        {canRaise && open && !editing && (
          <p className="text-xs text-text-muted">A request is in review; the next can be raised once it is decided.</p>
        )}
      </Card>

      {editing && (
        <ChangeEditor project={project} cells={cells} existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onChanged={onChanged} />
      )}

      {file.changes.length === 0 && !editing && (
        <p className="text-sm text-text-muted">No change has been requested on this project.</p>
      )}
      {file.changes.map(c => (
        <ChangeCard key={c.id} change={c} project={project} mine={c.createdBy === userId} mayAct={mayAct}
          onEdit={() => setEditing(c)} onChanged={onChanged} />
      ))}
    </div>
  );
}

// --- 1. Raising and editing a request ---

function ChangeEditor({ project, cells, existing, onClose, onChanged }: {
  project: ProjectInfo; cells: HeadCell[]; existing: ChangeRequest | null; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ChangeKind | null>(existing?.kind ?? null);
  const [payload, setPayload] = useState<ChangePayload>(existing?.payload ?? {});
  const [why, setWhy] = useState(existing?.justification ?? '');
  const [id, setId] = useState<string | null>(existing?.id ?? null);
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const endDate = project.CompletioDate || null;
  const problems = useMemo(
    () => (kind ? changeProblems(kind, payload, { track: project.track, endDate, cells }) : []),
    [kind, payload, project.track, endDate, cells],
  );
  const pct = kind === 'RCE' ? rceIncreasePct(payload.lines ?? [], cells) : null;
  const { rules } = useRules();
  const rceLimit = useMemo(() => ruleNumber(rules, RULE.costOverrunDgLimitPct), [rules]);
  const route = kind ? changeRoute(project.track, kind, pct, rceLimit) : [];

  function choose(k: ChangeKind) {
    setKind(k);
    if (k === 'RCE') setPayload({ lines: cells.map(c => ({ fiscal_year: c.fiscalYear, head: c.head, amount: c.sanctioned })) });
    else if (k === 'REALLOCATION') setPayload({ direction: 'OUT', lines: [] });
    else setPayload({});
  }

  async function save(): Promise<string> {
    const saved = await saveChange(id, project.ProjectID, kind as ChangeKind, why, payload);
    setId(saved);
    return saved;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setSaved('');
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (!kind) {
    return (
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-[500] text-text">What needs to change?</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CHANGE_KINDS.filter(k => !k.hqOnly || project.track === 'HQ').map(k => (
            <button key={k.kind} type="button" onClick={() => choose(k.kind)}
              className="text-left p-3 rounded-lg border border-border bg-surface hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand-blue">
              <span className="block text-sm font-[500] text-text">{k.label}</span>
              <span className="block text-xs text-text-muted mt-0.5">{k.when}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </Card>
    );
  }

  const info = changeKindInfo(kind);
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-[500] text-text">{info.label}</h3>
          <p className="text-xs text-text-muted">{info.when}</p>
        </div>
        {!existing && <Button size="sm" variant="ghost" onClick={() => setKind(null)}>Choose another</Button>}
      </div>
      <ul className="text-xs text-text-muted list-disc pl-5 space-y-0.5">
        {info.rules.map(r => <li key={r}>{r}</li>)}
      </ul>

      <KindFields kind={kind} payload={payload} setPayload={setPayload} cells={cells} />

      <label className="block text-xs text-text-muted">
        Justification
        <textarea aria-label="Justification" rows={3} className={clsx(inputCls, 'mt-1')} value={why}
          onChange={(e) => setWhy(e.target.value)} placeholder="Why the change is needed, and what happens without it" />
      </label>

      {problems.length > 0 && (
        <ul aria-label="Before this can be submitted" className="text-xs text-danger space-y-0.5">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="text-xs text-text-muted">
        Route: {route.map(r => STEP_LABELS[r]).join(' → ')}
        {pct !== null && kind === 'RCE' && ` · a ${pct}% rise`}
      </p>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <Button size="sm" variant="secondary" isLoading={busy} onClick={() => void run(async () => { await save(); await onChanged(); setSaved('Draft saved — only you can see it.'); })}>
          Save draft
        </Button>
        <label className="text-xs text-text-muted">
          Signed request (PDF)
          <input type="file" accept="application/pdf" aria-label="Signed request" onChange={(e) => setScan(e.target.files?.[0] ?? null)}
            className="block text-sm text-text mt-1" />
        </label>
        <Button size="sm" isLoading={busy} disabled={!scan || problems.length > 0 || !why.trim()}
          onClick={() => void run(async () => {
            const cid = await save();
            const d = await uploadProjectDocument(project.ProjectID, 'change_request', scan as File);
            await submitChange(cid, d.id);
            onClose();
            await onChanged();
          })}>
          Submit
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {saved && <p className="text-xs text-text-muted">{saved}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

function KindFields({ kind, payload: p, setPayload, cells }: {
  kind: ChangeKind; payload: ChangePayload; setPayload: (p: ChangePayload) => void; cells: HeadCell[];
}) {
  const years = useMemo(() => {
    const ys = [...new Set(cells.map(c => c.fiscalYear))].sort();
    const last = ys[ys.length - 1];
    if (last) {
      const y = Number(last.slice(0, 4)) + 1;
      ys.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
    }
    return ys;
  }, [cells]);
  const unspent = (fy: string, head: string) => cells.find(c => c.fiscalYear === fy && c.head === head)?.unspent ?? 0;
  const set = (patch: Partial<ChangePayload>) => setPayload({ ...p, ...patch });

  if (kind === 'TIME_OVERRUN' || kind === 'FORECLOSURE') {
    const field = kind === 'TIME_OVERRUN' ? 'new_end_date' : 'effective_date';
    return (
      <div className="space-y-2">
        <label className="block text-xs text-text-muted max-w-xs">
          {kind === 'TIME_OVERRUN' ? 'New end date' : 'Close the project on'}
          <input type="date" aria-label={kind === 'TIME_OVERRUN' ? 'New end date' : 'Close on'} className={clsx(inputCls, 'mt-1')}
            value={p[field] ?? ''} onChange={(e) => set({ [field]: e.target.value })} />
        </label>
        {kind === 'FORECLOSURE' && (
          <label className="block text-xs text-text-muted">
            Cost-benefit: continuing against stopping
            <textarea aria-label="Cost-benefit" rows={3} className={clsx(inputCls, 'mt-1')} value={p.cost_benefit ?? ''}
              onChange={(e) => set({ cost_benefit: e.target.value })} />
          </label>
        )}
      </div>
    );
  }

  const amountInput = ({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) => (
    <input type="number" min={0} aria-label={label} className={inputCls} value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
  );
  const yearSelect = ({ value, onChange, label, after }: { value: string; onChange: (s: string) => void; label: string; after?: string }) => (
    <select aria-label={label} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Year…</option>
      {years.filter(y => !after || y > after).map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );
  const headSelect = ({ value, onChange, label, exclude = [] }: { value: string; onChange: (s: string) => void; label: string; exclude?: string[] }) => (
    <select aria-label={label} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Head…</option>
      {BUDGET_HEADS.filter(h => !exclude.includes(h.head)).map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
    </select>
  );
  const remove = (i: number, key: 'moves' | 'lines') => set({ [key]: (p[key] ?? []).filter((_, j) => j !== i) });
  const removeButton = (i: number, k: 'moves' | 'lines') => (
    <Button size="sm" variant="ghost" onClick={() => remove(i, k)} aria-label="Remove row"><Trash2 size={14} aria-hidden="true" /></Button>
  );

  if (kind === 'REPHASING') {
    const moves = (p.moves ?? []) as RephaseMove[];
    const upd = (i: number, patch: Partial<RephaseMove>) => set({ moves: moves.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
    return (
      <div className="space-y-2">
        {moves.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
            {headSelect({ label: 'Head', value: m.head, exclude: ['TA_INDIA', 'TA_ABROAD', 'MANPOWER'], onChange: (head) => upd(i, { head }) })}
            {yearSelect({ label: 'From year', value: m.from_year, onChange: (from_year) => upd(i, { from_year }) })}
            {yearSelect({ label: 'To year', value: m.to_year, after: m.from_year, onChange: (to_year) => upd(i, { to_year }) })}
            {amountInput({ label: 'Amount', value: m.amount, onChange: (amount) => upd(i, { amount }) })}
            {removeButton(i, 'moves')}
            {m.head && m.from_year && <p className="col-span-5 text-[11px] text-text-muted -mt-1">Unspent: {rupees(unspent(m.from_year, m.head))}</p>}
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => set({ moves: [...moves, { head: '', from_year: '', to_year: '', amount: 0 }] })}>
          Add an amount to carry forward
        </Button>
      </div>
    );
  }

  if (kind === 'REAPPROPRIATION') {
    const moves = (p.moves ?? []) as ReappropriationMove[];
    const upd = (i: number, patch: Partial<ReappropriationMove>) => set({ moves: moves.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
    return (
      <div className="space-y-2">
        {moves.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
            {yearSelect({ label: 'Year', value: m.fiscal_year, onChange: (fiscal_year) => upd(i, { fiscal_year }) })}
            {headSelect({ label: 'From head', value: m.from_head, onChange: (from_head) => upd(i, { from_head }) })}
            {headSelect({ label: 'To head', value: m.to_head, exclude: ['TA_INDIA', 'TA_ABROAD'], onChange: (to_head) => upd(i, { to_head }) })}
            {amountInput({ label: 'Amount', value: m.amount, onChange: (amount) => upd(i, { amount }) })}
            {removeButton(i, 'moves')}
            {m.from_head && m.fiscal_year && <p className="col-span-5 text-[11px] text-text-muted -mt-1">Unspent: {rupees(unspent(m.fiscal_year, m.from_head))}</p>}
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => set({ moves: [...moves, { fiscal_year: '', from_head: '', to_head: '', amount: 0 }] })}>
          Add an amount to move
        </Button>
      </div>
    );
  }

  const lines = p.lines ?? [];
  const updLine = (i: number, patch: Partial<ChangeLine>) => set({ lines: lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const lineRows = () => (
    <>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          {yearSelect({ label: 'Year', value: l.fiscal_year, onChange: (fiscal_year) => updLine(i, { fiscal_year }) })}
          {headSelect({ label: 'Head', value: l.head, onChange: (head) => updLine(i, { head }) })}
          {amountInput({ label: 'Amount', value: l.amount, onChange: (amount) => updLine(i, { amount }) })}
          {removeButton(i, 'lines')}
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => set({ lines: [...lines, { fiscal_year: '', head: '', amount: 0 }] })}>Add a line</Button>
    </>
  );

  if (kind === 'REALLOCATION') {
    return (
      <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <input aria-label="Other laboratory" placeholder="Other laboratory, e.g. CSIR-NML" className={inputCls}
            value={p.lab ?? ''} onChange={(e) => set({ lab: e.target.value })} />
          <select aria-label="Direction" className={inputCls} value={p.direction ?? 'OUT'} onChange={(e) => set({ direction: e.target.value as 'OUT' | 'IN' })}>
            <option value="OUT">Money goes to that laboratory</option>
            <option value="IN">Money comes from that laboratory</option>
          </select>
        </div>
        {lineRows()}
      </div>
    );
  }

  // RCE: the whole revised budget, starting from the current sanction.
  const now = cells.reduce((a, c) => a + c.sanctioned, 0);
  const next = lines.reduce((a, l) => a + (l.amount || 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        The revised budget, year by year and head by head. Current sanction {rupees(now)}; revised {rupees(next)}.
      </p>
      {lineRows()}
      <label className="block text-xs text-text-muted max-w-xs">
        New end date, if more time is also needed
        <input type="date" aria-label="New end date" className={clsx(inputCls, 'mt-1')} value={p.new_end_date ?? ''}
          onChange={(e) => set({ new_end_date: e.target.value || undefined })} />
      </label>
      <p className="text-[11px] text-text-muted">{headLabel('EQUIPMENT')} and {headLabel('WORKS')} are Capital; the rest are Revenue.</p>
    </div>
  );
}

// --- 2. A request on file ---

function ChangeCard({ change: c, project, mine, mayAct, onEdit, onChanged }: {
  change: ChangeRequest; project: ProjectInfo; mine: boolean; mayAct: (k: ChangeStepKind) => boolean;
  onEdit: () => void; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const info = changeKindInfo(c.kind);
  const status = CHANGE_STATUS[c.status];
  const current = OPEN.includes(c.status) ? c.steps.find(s => s.status === 'PENDING') : undefined;
  const isLast = !!current && current.seq === Math.max(...c.steps.map(s => s.seq));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await onChanged(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 space-y-3" aria-label={`${info.label} request`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-[500] text-text">{info.label}</h3>
          <p className="text-sm text-text">{changeSummary(c.kind, c.payload)}</p>
          {c.justification && <p className="text-xs text-text-muted mt-1">{c.justification}</p>}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {c.steps.length > 0 && (
        <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Approval route">
          {c.steps.map(s => (
            <li key={s.id} className={clsx('px-2 py-0.5 rounded-full border',
              s.status === 'DONE' ? 'border-success text-success'
                : s.status === 'RETURNED' || s.status === 'REJECTED' ? 'border-danger text-danger'
                  : s.id === current?.id ? 'border-brand-blue text-brand-blue' : 'border-border text-text-muted')}>
              {STEP_LABELS[s.kind]}{s.status === 'DONE' ? ' ✓' : ''}
            </li>
          ))}
        </ol>
      )}
      {c.decisionNote && <p className="text-xs text-text-muted">Note: {c.decisionNote}</p>}
      {c.status === 'APPROVED' && c.orderNo && <p className="text-xs text-text-muted">Order {c.orderNo}{c.orderDate ? ` of ${c.orderDate}` : ''}{c.ifdFileNo ? ` · IFD ${c.ifdFileNo}` : ''}</p>}

      {mine && (c.status === 'DRAFT' || c.status === 'RETURNED' || c.status === 'SUBMITTED') && (
        <div className="flex gap-2">
          {c.status !== 'SUBMITTED' && <Button size="sm" variant="secondary" onClick={onEdit}>{c.status === 'RETURNED' ? 'Revise and resubmit' : 'Continue the draft'}</Button>}
          <Button size="sm" variant="ghost" isLoading={busy} onClick={() => void run(() => withdrawChange(c.id))}>Withdraw</Button>
        </div>
      )}
      {current && mayAct(current.kind) && (
        <StepForm stepKind={current.kind} needsOrder={isLast && project.track === 'HQ' && c.kind !== 'FORECLOSURE'}
          busy={busy} onRecord={(decision, notes, scan, order) => void run(async () => {
            const d = scan ? (await uploadProjectDocument(project.ProjectID, 'change_order', scan)).id : null;
            await recordChangeStep(current.id, decision, notes, d, order);
          })} />
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

function StepForm({ stepKind, needsOrder, busy, onRecord }: {
  stepKind: ChangeStepKind; needsOrder: boolean; busy: boolean;
  onRecord: (d: ChangeDecision, notes: string, scan: File | null, order?: { orderNo: string; orderDate: string | null; ifdFileNo: string; ifdDate: string | null }) => void;
}) {
  const [decision, setDecision] = useState<ChangeDecision>('APPROVE');
  const [notes, setNotes] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [orderNo, setOrderNo] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [ifdNo, setIfdNo] = useState('');
  const [ifdDate, setIfdDate] = useState('');
  const ready = decision === 'APPROVE'
    ? !!scan && (!needsOrder || (!!orderNo.trim() && !!orderDate && !!ifdNo.trim() && !!ifdDate))
    : !!notes.trim();

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
      <p className="text-xs font-[500] text-text">Record: {STEP_LABELS[stepKind]}</p>
      <div className="grid sm:grid-cols-[12rem_1fr] gap-2">
        <select aria-label="Step decision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value as ChangeDecision)}>
          <option value="APPROVE">{stepKind.startsWith('DIRECTOR_FORWARD') ? 'Forward' : 'Approve / recommend'}</option>
          <option value="RETURN">Return to the PI</option>
          <option value="REJECT">Reject</option>
        </select>
        <input aria-label="Step note" placeholder={decision === 'APPROVE' ? 'Note (optional)' : 'What needs to change, or why'} className={inputCls}
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {needsOrder && decision === 'APPROVE' && (
        <div className="grid sm:grid-cols-4 gap-2">
          <input aria-label="Order number" placeholder="Order / OM number" className={inputCls} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          <input type="date" aria-label="Order date" className={inputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          <input aria-label="IFD file number" placeholder="IFD concurrence file no." className={inputCls} value={ifdNo} onChange={(e) => setIfdNo(e.target.value)} />
          <input type="date" aria-label="IFD date" className={inputCls} value={ifdDate} onChange={(e) => setIfdDate(e.target.value)} />
          <p className="sm:col-span-4 text-[11px] text-text-muted">An HQ order without the IFD concurrence file number and date is invalid.</p>
        </div>
      )}
      <label className="block text-xs text-text-muted">
        Signed scan (PDF){decision === 'APPROVE' ? '' : ' — optional'}
        <input type="file" accept="application/pdf" aria-label="Step scan" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="block text-sm text-text mt-1" />
      </label>
      <Button size="sm" isLoading={busy} disabled={!ready}
        onClick={() => onRecord(decision, notes, scan, needsOrder ? { orderNo, orderDate, ifdFileNo: ifdNo, ifdDate } : undefined)}>
        Record
      </Button>
    </div>
  );
}
