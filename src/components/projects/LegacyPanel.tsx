import { useMemo, useState } from 'react';
import { SCHEMES } from '../../lib/projects/schemes';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../ui/Cards';
import { Button } from '../ui/Button';
import { BUDGET_HEADS, rupees } from '../../lib/projects/heads';
import { HQ_CATEGORIES } from '../../lib/proposals/categories';
import { completeLegacy, uploadProjectDocument, type LegacyInput } from '../../lib/projects/projectFileApi';
import { friendlyError } from '../../lib/errors';
import { yearsBetween } from '../../lib/projects/legacy';
import type { ProjectInfo } from '../../types';

const inputCls = 'w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text';
const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

interface Row { fiscal_year: string; head: string; amount: number }

/**
 * PME's one-time form for a running project that predates SURYA (plan §10):
 * the sanction by year and head, and money received and spent to date as
 * opening balances. Nothing is back-invented beyond what PME enters.
 */
export function LegacyPanel({ project, onChanged }: { project: ProjectInfo; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState<string>(project.track ?? '');
  const [category, setCategory] = useState(HQ_CATEGORIES.some(c => c.code === project.ProjectCategory) ? project.ProjectCategory : '');
  const [start, setStart] = useState(isoDate(project.StartDate));
  const [end, setEnd] = useState(isoDate(project.CompletioDate));
  const [ref, setRef] = useState('');
  const [refDate, setRefDate] = useState('');
  const [asOf, setAsOf] = useState(istToday());
  const [scan, setScan] = useState<File | null>(null);
  const [lines, setLines] = useState<Row[]>([]);
  const [received, setReceived] = useState<{ fiscal_year: string; amount: number }[]>([]);
  const [spent, setSpent] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const years = useMemo(() => yearsBetween(start, end), [start, end]);
  const total = (rs: { amount: number }[]) => rs.reduce((a, r) => a + (r.amount || 0), 0);

  const ready = !!track && (track !== 'HQ' || !!category) && years.length > 0 && !!ref.trim() && !!refDate && !!asOf && !!scan
    && lines.length > 0 && lines.every(l => l.fiscal_year && l.head && l.amount >= 0)
    && received.every(r => r.fiscal_year && r.amount > 0) && spent.every(s => s.fiscal_year && s.head && s.amount > 0);

  if (!open) {
    return (
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-[500] font-serif text-text">Bring this project into SURYA</h2>
          <p className="text-xs text-text-muted max-w-2xl">
            It predates SURYA, so there is no sanction by head and no money on record. Enter them once — the sanction,
            and what has been received and spent to date — and the funds table, schedule and closure work from then on.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Start</Button>
      </Card>
    );
  }

  const yearSel = (v: string, on: (s: string) => void, label: string) => (
    <select aria-label={label} className={inputCls} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">Year…</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );
  const headSel = (v: string, on: (s: string) => void, label: string) => (
    <select aria-label={label} className={inputCls} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">Head…</option>{BUDGET_HEADS.map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
    </select>
  );
  const amount = (v: number, on: (n: number) => void, label: string) => (
    <input type="number" min={0} aria-label={label} className={inputCls} value={v || ''} onChange={(e) => on(Number(e.target.value))} />
  );
  const remove = (on: () => void) => (
    <Button size="sm" variant="ghost" aria-label="Remove row" onClick={on}><Trash2 size={14} aria-hidden="true" /></Button>
  );
  const rowsOf = (rs: Row[], set: (r: Row[]) => void, prefix: string) => rs.map((r, i) => {
    const upd = (p: Partial<Row>) => set(rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
    return (
      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
        {yearSel(r.fiscal_year, (fiscal_year) => upd({ fiscal_year }), `${prefix} year`)}
        {headSel(r.head, (head) => upd({ head }), `${prefix} head`)}
        {amount(r.amount, (a) => upd({ amount: a }), `${prefix} amount`)}
        {remove(() => set(rs.filter((_, j) => j !== i)))}
      </div>
    );
  });

  return (
    <Card className="p-4 space-y-5">
      <h2 className="text-base font-[500] font-serif text-text">Bring this project into SURYA</h2>

      <section className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs text-text-muted">Scheme
          <select aria-label="Scheme" className={clsx(inputCls, 'mt-1')} value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="">Choose…</option>{SCHEMES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </label>
        {track === 'HQ' && (
          <label className="text-xs text-text-muted">HQ category
            <select aria-label="HQ category" className={clsx(inputCls, 'mt-1')} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose…</option>{HQ_CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-text-muted">Start date
          <input type="date" aria-label="Start date" className={clsx(inputCls, 'mt-1')} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="text-xs text-text-muted">End date
          <input type="date" aria-label="End date" className={clsx(inputCls, 'mt-1')} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="text-xs text-text-muted">Sanction order no.
          <input aria-label="Sanction order number" className={clsx(inputCls, 'mt-1')} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label className="text-xs text-text-muted">Sanction order date
          <input type="date" aria-label="Sanction order date" className={clsx(inputCls, 'mt-1')} value={refDate} onChange={(e) => setRefDate(e.target.value)} /></label>
        <label className="text-xs text-text-muted sm:col-span-2">Sanction order (PDF scan)
          <input type="file" accept="application/pdf" aria-label="Sanction order scan" onChange={(e) => setScan(e.target.files?.[0] ?? null)} className="block text-sm text-text mt-1" /></label>
        <label className="text-xs text-text-muted">Figures up to
          <input type="date" aria-label="Figures up to" className={clsx(inputCls, 'mt-1')} value={asOf} max={istToday()} onChange={(e) => setAsOf(e.target.value)} /></label>
      </section>

      {years.length === 0 ? <p className="text-xs text-text-muted">Enter the start and end dates to choose years.</p> : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-[500] text-text">Sanction by year and head <span className="text-text-muted font-normal">— {rupees(total(lines))}</span></h3>
            {rowsOf(lines, setLines, 'Sanction')}
            <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { fiscal_year: '', head: '', amount: 0 }])}><Plus size={14} aria-hidden="true" /> Add a sanction line</Button>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-[500] text-text">Received to date <span className="text-text-muted font-normal">— {rupees(total(received))}</span></h3>
            {received.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                {yearSel(r.fiscal_year, (fiscal_year) => setReceived(received.map((x, j) => (j === i ? { ...x, fiscal_year } : x))), 'Received year')}
                {amount(r.amount, (a) => setReceived(received.map((x, j) => (j === i ? { ...x, amount: a } : x))), 'Received amount')}
                {remove(() => setReceived(received.filter((_, j) => j !== i)))}
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setReceived([...received, { fiscal_year: '', amount: 0 }])}><Plus size={14} aria-hidden="true" /> Add money received</Button>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-[500] text-text">Spent to date <span className="text-text-muted font-normal">— {rupees(total(spent))}</span></h3>
            {rowsOf(spent, setSpent, 'Spent')}
            <Button size="sm" variant="secondary" onClick={() => setSpent([...spent, { fiscal_year: '', head: '', amount: 0 }])}><Plus size={14} aria-hidden="true" /> Add money spent</Button>
          </section>
        </>
      )}

      <p className="text-[11px] text-text-muted">
        Money received and spent is recorded as opening balances, marked as such. Reviews and reports that fell due before
        the date above are not counted as overdue. This is done once.
      </p>
      <div className="flex gap-2">
        <Button size="sm" isLoading={busy} disabled={!ready} onClick={async () => {
          setBusy(true); setError('');
          try {
            const d = await uploadProjectDocument(project.ProjectID, 'sanction_order', scan as File);
            const x: LegacyInput = { track, category: track === 'HQ' ? category : null, start, end,
              sanctionRef: ref, sanctionDate: refDate, lines, received, spent, asOf };
            await completeLegacy(project.ProjectID, x, d.id);
            await onChanged();
          } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
        }}>Bring it in</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </Card>
  );
}
