import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { BUDGET_HEADS, headLabel, rupees } from '../../lib/projects/heads';
import { useRules } from '../../contexts/RulesContext';
import { RULE, ruleNumber } from '../../lib/rules/csirRules';
import type { ProposalBudgetLine } from '../../types/proposal';

interface BudgetLinesEditorProps {
  lines: ProposalBudgetLine[];
  /** Financial years the project spans; the first is the default for a new line. */
  years: string[];
  editable: boolean;
  onAdd: (line: Omit<ProposalBudgetLine, 'id'>) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Omit<ProposalBudgetLine, 'id'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const cell = 'w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md text-sm text-text';

export function BudgetLinesEditor({ lines, years, editable, onAdd, onUpdate, onDelete }: BudgetLinesEditorProps) {
  const [busy, setBusy] = useState(false);
  const total = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);
  const byYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.fiscalYear, (m.get(l.fiscalYear) ?? 0) + l.amount);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);
  // A year already used stays selectable even if the dates later move.
  const yearOptions = useMemo(() => [...new Set([...years, ...lines.map(l => l.fiscalYear)])].sort(), [years, lines]);
  const fallbackYear = years[0] ?? lines[0]?.fiscalYear ?? '';

  async function add() {
    if (!fallbackYear) return;
    setBusy(true);
    try { await onAdd({ fiscalYear: fallbackYear, head: 'CONSUMABLES', item: '', amount: 0 }); }
    finally { setBusy(false); }
  }

  if (!editable) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
            <th className="py-1.5 pr-3 font-semibold">Year</th><th className="py-1.5 pr-3 font-semibold">Head</th>
            <th className="py-1.5 pr-3 font-semibold">Item</th><th className="py-1.5 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(l => (
            <tr key={l.id} className="border-t border-border">
              <td className="py-1.5 pr-3 font-mono text-text-muted">{l.fiscalYear}</td>
              <td className="py-1.5 pr-3 text-text">{headLabel(l.head)}</td>
              <td className="py-1.5 pr-3 text-text">{l.item}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-text">{rupees(l.amount)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-medium">
            <td colSpan={3} className="py-1.5 text-text">Total</td>
            <td className="py-1.5 text-right font-mono tabular-nums text-text">{rupees(total)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-3">
      {!fallbackYear && (
        <p className="text-xs text-text-muted">Set the proposed start and duration in Plan first — the years come from them.</p>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="pb-1.5 pr-2 font-semibold w-28">Year</th>
                <th className="pb-1.5 pr-2 font-semibold w-40">Head</th>
                <th className="pb-1.5 pr-2 font-semibold">Item</th>
                <th className="pb-1.5 pr-2 font-semibold w-36 text-right">Amount (₹)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <BudgetRow key={l.id} line={l} years={yearOptions} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="secondary" onClick={() => void add()} isLoading={busy} disabled={!fallbackYear}>
          <Plus size={14} className="mr-1" /> Add a line
        </Button>
        <div className="text-sm text-text flex flex-wrap gap-x-4 gap-y-1 justify-end">
          {byYear.map(([y, amt]) => (
            <span key={y} className="text-text-muted"><span className="font-mono">{y}</span> {rupees(amt)}</span>
          ))}
          <span className="font-medium">Total <span className="font-mono tabular-nums">{rupees(total)}</span></span>
        </div>
      </div>
    </div>
  );
}

function BudgetRow({
  line, years, onUpdate, onDelete,
}: {
  line: ProposalBudgetLine;
  years: string[];
  onUpdate: BudgetLinesEditorProps['onUpdate'];
  onDelete: BudgetLinesEditorProps['onDelete'];
}) {
  const [item, setItem] = useState(line.item);
  const [amount, setAmount] = useState(line.amount ? String(line.amount) : '');
  const { rules } = useRules();
  const threshold = useMemo(() => ruleNumber(rules, RULE.majorEquipmentInr), [rules]);
  const big = line.head === 'EQUIPMENT' && threshold !== null && line.amount >= threshold;

  return (
    <tr className="align-top">
      <td className="py-1 pr-2">
        <select aria-label="Year" className={cell} value={line.fiscalYear} onChange={(e) => void onUpdate(line.id, { fiscalYear: e.target.value })}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </td>
      <td className="py-1 pr-2">
        <select aria-label="Head" className={cell} value={line.head} onChange={(e) => void onUpdate(line.id, { head: e.target.value })}>
          <optgroup label="Capital">
            {BUDGET_HEADS.filter(h => h.capital).map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
          </optgroup>
          <optgroup label="Recurring">
            {BUDGET_HEADS.filter(h => !h.capital).map(h => <option key={h.head} value={h.head}>{h.label}</option>)}
          </optgroup>
        </select>
      </td>
      <td className="py-1 pr-2">
        <input
          aria-label="Item" className={cell} value={item} placeholder="What it is for"
          onChange={(e) => setItem(e.target.value)}
          onBlur={() => { if (item !== line.item) void onUpdate(line.id, { item }); }}
        />
        {big && <p className="text-[11px] text-turmeric mt-0.5">{rupees(threshold!)} or more: attach a quotation under Documents.</p>}
      </td>
      <td className="py-1 pr-2">
        <input
          aria-label="Amount" inputMode="numeric" className={`${cell} text-right font-mono tabular-nums`} value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => {
            const n = Number(amount) || 0;
            if (n !== line.amount) void onUpdate(line.id, { amount: n });
          }}
        />
      </td>
      <td className="py-1">
        <button type="button" aria-label="Remove line" onClick={() => void onDelete(line.id)}
          className="p-1.5 rounded text-text-muted hover:text-danger hover:bg-surface-hover">
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
