import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { fundSummary } from '../../lib/projects/fundSummary';
import { BUDGET_HEADS, fiscalYearOf, headLabel, rupees } from '../../lib/projects/heads';
import {
  recordExpenditure, recordReceipt, reverseEntry, uploadProjectDocument,
} from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import { describeOm, extractOmFields } from '../../lib/documents/omExtract';
import { HOME_LAB, ipAgreementMissing, loadLabMoney, setEntryLab, type LabMoney } from '../../lib/projects/labs';
import { LabsPanel } from './LabsPanel';
import type { ProjectInfo } from '../../types';
import type { ExpenditurePeriod, ProjectFile } from '../../types/projectFile';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';
const PERIODS: ExpenditurePeriod[] = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'];

interface FundsPanelProps {
  project: ProjectInfo;
  file: ProjectFile;
  /** PME (or MasterAdmin) and not a party to the project: may record and reverse. */
  isOffice: boolean;
  onChanged: () => Promise<void>;
}

export function FundsPanel({ project, file, isOffice, onChanged }: FundsPanelProps) {
  const summary = useMemo(() => fundSummary(file.budgetLines, file.receipts, file.expenditure), [file]);
  const [form, setForm] = useState<'receipt' | 'expenditure' | null>(null);
  const [labs, setLabs] = useState<LabMoney[]>([]);
  const [ipMissing, setIpMissing] = useState(false);
  const loadLabs = useCallback(async () => {
    try {
      const [l, m] = await Promise.all([loadLabMoney(project.ProjectID), ipAgreementMissing(project.ProjectID)]);
      setLabs(l); setIpMissing(m);
    } catch { setLabs([]); }
  }, [project.ProjectID]);
  useEffect(() => { void loadLabs(); }, [loadLabs, file]);
  const labCodes = useMemo(() => labs.map(l => l.lab_code), [labs]);
  const reversed = useMemo(
    () => new Set([...file.receipts, ...file.expenditure].map(e => e.reversesId).filter(Boolean) as string[]),
    [file],
  );
  // Years a statement can be for: the sanctioned years and any year money
  // arrived in. The form opens on the current year when it is one of them,
  // otherwise on the latest year money was received in.
  const years = useMemo(() => {
    const ys = new Set([...file.budgetLines.map(l => l.fiscalYear), ...file.receipts.map(r => r.fiscalYear)]);
    if (ys.size === 0) ys.add(fiscalYearOf(new Date()));
    return [...ys].sort();
  }, [file.budgetLines, file.receipts]);
  const defaultYear = useMemo(() => {
    const now = fiscalYearOf(new Date());
    if (years.includes(now)) return now;
    const received = file.receipts.map(r => r.fiscalYear).sort();
    return received[received.length - 1] ?? years[0] ?? now;
  }, [years, file.receipts]);

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <h2 className="text-base font-[500] font-serif text-text">Funds by year</h2>
        {file.budgetLines.length === 0 && (
          <p className="text-xs text-text-muted">
            No sanctioned budget is on record for this project — it predates sanctions in SURYA. Received and spent
            are still tracked.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="py-1.5 pr-3 font-semibold">Year</th>
                {['Sanctioned', 'Received', 'Spent', 'Balance'].map(h => <th key={h} className="py-1.5 pr-3 font-semibold text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...summary.years, summary.total].map(y => (
                <tr key={y.fiscalYear} className={clsx('border-t border-border', y.fiscalYear === 'Total' && 'font-medium')}>
                  <td className="py-1.5 pr-3 font-mono text-text">{y.fiscalYear}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-text">{rupees(y.sanctioned)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-text">{rupees(y.received)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-text">{rupees(y.spent)}</td>
                  <td className={clsx('py-1.5 pr-3 text-right font-mono tabular-nums', y.balance < 0 ? 'text-danger' : 'text-text')}>{rupees(y.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.heads.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-text">
              By head {summary.heads.some(h => h.over) && <Badge variant="warning">overspent</Badge>}
            </summary>
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="py-1 pr-3 font-semibold">Year</th><th className="py-1 pr-3 font-semibold">Head</th>
                  <th className="py-1 pr-3 font-semibold text-right">Sanctioned</th><th className="py-1 pr-3 font-semibold text-right">Spent</th><th />
                </tr>
              </thead>
              <tbody>
                {summary.heads.map(h => (
                  <tr key={`${h.fiscalYear}${h.head}`} className="border-t border-border">
                    <td className="py-1 pr-3 font-mono text-text-muted">{h.fiscalYear}</td>
                    <td className="py-1 pr-3 text-text">{headLabel(h.head)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-text">{rupees(h.sanctioned)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-text">{rupees(h.spent)}</td>
                    <td className="py-1 text-xs text-turmeric">{h.over && 'Above sanction — re-appropriation due'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Card>

      <LabsPanel projectId={project.ProjectID} labs={labs} ipMissing={ipMissing} isOffice={isOffice}
        onChanged={async () => { await loadLabs(); await onChanged(); }} />

      {isOffice && (
        <div className="flex gap-2">
          <Button variant={form === 'receipt' ? 'primary' : 'secondary'} onClick={() => setForm(form === 'receipt' ? null : 'receipt')}>
            Record money received
          </Button>
          <Button variant={form === 'expenditure' ? 'primary' : 'secondary'} onClick={() => setForm(form === 'expenditure' ? null : 'expenditure')}>
            Record expenditure
          </Button>
        </div>
      )}
      {isOffice && form === 'receipt' && (
        <ReceiptForm project={project} labs={labCodes} onDone={async () => { setForm(null); await onChanged(); }} />
      )}
      {isOffice && form === 'expenditure' && (
        <ExpenditureForm project={project} labs={labCodes} years={years} defaultYear={defaultYear} onDone={async () => { setForm(null); await onChanged(); }} />
      )}

      <Ledger
        title="Money received"
        rows={file.receipts.map(r => ({
          id: r.id, date: r.receivedOn, what: `${r.orderNo}${r.head ? ` · ${headLabel(r.head)}` : ''}${r.source ? ` · ${r.source}` : ''}`,
          amount: r.amount, notes: r.notes, reversal: !!r.reversesId,
        }))}
        reversed={reversed}
        canReverse={isOffice}
        onReverse={async (id, reason) => { await reverseEntry('receipt', id, reason); await onChanged(); }}
      />
      <Ledger
        title="Expenditure"
        rows={file.expenditure.map(e => ({
          id: e.id, date: `${e.fiscalYear} ${e.period}`, what: headLabel(e.head), amount: e.amount, notes: e.notes, reversal: !!e.reversesId,
        }))}
        reversed={reversed}
        canReverse={isOffice}
        onReverse={async (id, reason) => { await reverseEntry('expenditure', id, reason); await onChanged(); }}
      />
    </div>
  );
}

interface LedgerRow { id: string; date: string; what: string; amount: number; notes: string | null; reversal: boolean }

function Ledger({ title, rows, reversed, canReverse, onReverse }: {
  title: string; rows: LedgerRow[]; reversed: Set<string>; canReverse: boolean;
  onReverse: (id: string, reason: string) => Promise<void>;
}) {
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  if (rows.length === 0) return null;
  return (
    <Card className="p-4 space-y-2">
      <h3 className="text-sm font-medium text-text">{title}</h3>
      <ul className="divide-y divide-border">
        {rows.map(r => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-start gap-3">
              <span className="font-mono text-xs text-text-muted w-24 shrink-0 pt-0.5">{r.date}</span>
              <span className={clsx('flex-1', (r.reversal || reversed.has(r.id)) ? 'text-text-muted' : 'text-text')}>
                {r.what}
                {r.notes && <span className="block text-xs text-text-muted">{r.notes}</span>}
              </span>
              <span className={clsx('font-mono tabular-nums', r.amount < 0 ? 'text-danger' : 'text-text', reversed.has(r.id) && 'line-through')}>
                {r.amount < 0 ? '−' : ''}{rupees(Math.abs(r.amount))}
              </span>
              {canReverse && !r.reversal && !reversed.has(r.id) && (
                <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => { setReversing(r.id); setReason(''); setError(''); }}>
                  Reverse
                </button>
              )}
            </div>
            {reversing === r.id && (
              <div className="mt-2 flex gap-2 items-center pl-28">
                <input aria-label="Reason for reversal" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this entry wrong?" className={`${inputCls} py-1.5`} />
                <Button size="sm" variant="danger" disabled={!reason.trim()} onClick={async () => {
                  try { await onReverse(r.id, reason); setReversing(null); } catch (e) { setError(friendlyError(e)); }
                }}>Reverse</Button>
                <Button size="sm" variant="ghost" onClick={() => setReversing(null)}>Cancel</Button>
              </div>
            )}
            {reversing === r.id && error && <p role="alert" className="text-xs text-danger pl-28 mt-1">{error}</p>}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-muted">Entries are never edited. A wrong one is reversed by an opposite entry, which keeps both on record.</p>
    </Card>
  );
}

function ReceiptForm({ project, labs, onDone }: { project: ProjectInfo; labs: string[]; onDone: () => Promise<void> }) {
  const [lab, setLab] = useState(HOME_LAB);
  const hq = project.track === 'HQ';
  const [v, setV] = useState({ receivedOn: '', amount: '', head: '', source: hq ? 'CSIR HQ' : 'Director, CSIR-AMPRI', orderNo: '', orderDate: '', ifdFileNo: '', ifdDate: '', notes: '' });
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(s => ({ ...s, [k]: e.target.value }));
  const [readNote, setReadNote] = useState('');

  // EI7: read the order and fill the empty fields. A person checks and saves.
  async function readOrder(f: File | null) {
    setScan(f); setReadNote('');
    if (!f) return;
    setReadNote('Reading the order…');
    try {
      const { extractPdfText } = await import('../../lib/pms/awpOcr');
      const { text, usedOcr } = await extractPdfText(f);
      const om = extractOmFields(text);
      const found = describeOm(om);
      if (!found.length) { setReadNote('No text could be read from this file. Fill the form by hand.'); return; }
      const heads = Object.keys(om.byHead);
      setV(s => ({
        ...s,
        orderNo: s.orderNo || om.orderNo || '',
        orderDate: s.orderDate || om.orderDate || '',
        ifdFileNo: s.ifdFileNo || om.ifdFileNo || '',
        ifdDate: s.ifdDate || om.ifdDate || '',
        amount: s.amount || (om.total ? String(om.total) : ''),
        head: s.head || (heads.length === 1 ? heads[0] : ''),
        notes: s.notes || (heads.length > 1 ? 'By head: ' + heads.map(h => `${headLabel(h)} ${rupees(om.byHead[h as keyof typeof om.byHead] ?? 0)}`).join(', ') : ''),
      }));
      setReadNote(`Filled from the order${usedOcr ? ' (scanned, read by OCR)' : ''}: ${found.join(', ')}. Check each field before you save.`);
    } catch (e) { setReadNote(`Could not read the order: ${friendlyError(e)}`); }
  }

  async function save() {
    setBusy(true); setError('');
    try {
      if (!scan) throw new Error('Attach the scanned release order.');
      const doc = await uploadProjectDocument(project.ProjectID, 'receipt_order', scan);
      const id = await recordReceipt(project.ProjectID, {
        receivedOn: v.receivedOn, amount: Number(v.amount) || 0, head: v.head || null, source: v.source,
        orderNo: v.orderNo, orderDate: v.orderDate || null, ifdFileNo: v.ifdFileNo || null, ifdDate: v.ifdDate || null, notes: v.notes,
      }, doc.id);
      if (lab !== HOME_LAB) await setEntryLab('receipt', String(id), lab);
      await onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-text">Money received</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Date received"><input type="date" className={inputCls} value={v.receivedOn} onChange={set('receivedOn')} /></Field>
        <Field label="Amount (₹)"><input inputMode="numeric" className={`${inputCls} font-mono`} value={v.amount} onChange={set('amount')} /></Field>
        <Field label="Head (optional)">
          <select className={inputCls} value={v.head} onChange={set('head')}>
            <option value="">Not allocated</option>
            {BUDGET_HEADS.map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
          </select>
        </Field>
        <Field label="Release order number"><input className={inputCls} value={v.orderNo} onChange={set('orderNo')} /></Field>
        <Field label="Order date"><input type="date" className={inputCls} value={v.orderDate} onChange={set('orderDate')} /></Field>
        <Field label="Released by"><input className={inputCls} value={v.source} onChange={set('source')} /></Field>
        {hq && (
          <>
            <Field label="IFD concurrence file number"><input className={inputCls} value={v.ifdFileNo} onChange={set('ifdFileNo')} /></Field>
            <Field label="IFD concurrence date"><input type="date" className={inputCls} value={v.ifdDate} onChange={set('ifdDate')} /></Field>
          </>
        )}
      </div>
      <Field label="Note"><input className={inputCls} value={v.notes} onChange={set('notes')} /></Field>
      <LabPicker labs={labs} value={lab} onChange={setLab} />
      <Field label="Scanned release order (PDF)">
        <input type="file" accept="application/pdf" onChange={(e) => void readOrder(e.target.files?.[0] ?? null)} className="text-sm text-text" />
      </Field>
      {readNote && <p role="status" className="text-xs text-text-muted">{readNote}</p>}
      {hq && <p className="text-xs text-text-muted">An HQ release without the IFD file number and date is invalid (guidelines §7.2).</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void save()} isLoading={busy}>Record receipt</Button>
    </Card>
  );
}

function ExpenditureForm({ project, labs, years, defaultYear, onDone }: { project: ProjectInfo; labs: string[]; years: string[]; defaultYear: string; onDone: () => Promise<void> }) {
  const [lab, setLab] = useState(HOME_LAB);
  const [v, setV] = useState({ fiscalYear: defaultYear, period: 'FY' as ExpenditurePeriod, head: 'CONSUMABLES', amount: '', notes: '' });
  const [scan, setScan] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try {
      if (!scan) throw new Error('Attach the signed expenditure statement.');
      const doc = await uploadProjectDocument(project.ProjectID, 'expenditure_statement', scan);
      const id = await recordExpenditure(project.ProjectID, { ...v, amount: Number(v.amount) || 0 }, doc.id);
      if (lab !== HOME_LAB) await setEntryLab('expenditure', String(id), lab);
      await onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-medium text-text">Expenditure</h3>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Financial year">
          <select className={inputCls} value={v.fiscalYear} onChange={(e) => setV(s => ({ ...s, fiscalYear: e.target.value }))}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Period">
          <select className={inputCls} value={v.period} onChange={(e) => setV(s => ({ ...s, period: e.target.value as ExpenditurePeriod }))}>
            {PERIODS.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Head">
          <select className={inputCls} value={v.head} onChange={(e) => setV(s => ({ ...s, head: e.target.value }))}>
            {BUDGET_HEADS.map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input inputMode="numeric" className={`${inputCls} font-mono`} value={v.amount} onChange={(e) => setV(s => ({ ...s, amount: e.target.value }))} />
        </Field>
      </div>
      <Field label="Note"><input className={inputCls} value={v.notes} onChange={(e) => setV(s => ({ ...s, notes: e.target.value }))} /></Field>
      <LabPicker labs={labs} value={lab} onChange={setLab} />
      <Field label="Signed expenditure statement (PDF)">
        <input type="file" accept="application/pdf" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="text-sm text-text" />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button onClick={() => void save()} isLoading={busy}>Record expenditure</Button>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

// Which lab an entry is booked to — only on a multi-lab project.
function LabPicker({ labs, value, onChange }: { labs: string[]; value: string; onChange: (lab: string) => void }) {
  if (labs.length < 2) return null;
  return (
    <Field label="Lab">
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {labs.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </Field>
  );
}
