import { useMemo, useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import { useRules } from '../../contexts/RulesContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { friendlyError } from '../../lib/errors';
import type { CsirRule } from '../../types';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';
const today = () => new Date().toISOString().slice(0, 10);
const shown = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function CsirRules() {
  const { rules, setRule } = useRules();
  const { push } = useToast();
  const [form, setForm] = useState({ key: '', value: '', unit: '', from: today(), source: '', verified: false });
  const [saving, setSaving] = useState(false);

  // --- 1. One group per rule, newest value first ---
  const groups = useMemo(() => {
    const m = new Map<string, CsirRule[]>();
    for (const r of rules) m.set(r.ruleKey, [...(m.get(r.ruleKey) ?? []), r]);
    return [...m.entries()].map(([key, rows]) => ({
      key, rows: [...rows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    }));
  }, [rules]);

  // --- 2. Add a dated value ---
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let value: unknown;
    try { value = JSON.parse(form.value); } catch { push('Value must be a number, or JSON such as {"SC":5}', 'error'); return; }
    setSaving(true);
    try {
      await setRule({ key: form.key.trim(), value, unit: form.unit, effectiveFrom: form.from, sourceRef: form.source, verified: form.verified });
      push(`${form.key} set from ${form.from}`, 'success');
      setForm(f => ({ ...f, value: '', source: '', verified: false }));
    } catch (err) {
      push(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <Scale size={26} className="text-terracotta" /> CSIR Rules
        </h1>
        <p className="text-text-muted mt-1 text-sm font-medium">
          Each value holds from its date. A new value closes the old one; an old file is still judged by the rule of its day.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide mb-4">Add a dated value</h2>
        <form onSubmit={e => void submit(e)} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-text-muted md:col-span-2">Rule
            <input className={input} list="rule-keys" required value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
            <datalist id="rule-keys">{groups.map(g => <option key={g.key} value={g.key} />)}</datalist>
          </label>
          <label className="text-xs text-text-muted">Value
            <input className={input} required value={form.value} placeholder="500000" onChange={e => setForm({ ...form, value: e.target.value })} />
          </label>
          <label className="text-xs text-text-muted">Unit
            <input className={input} value={form.unit} placeholder="INR" onChange={e => setForm({ ...form, unit: e.target.value })} />
          </label>
          <label className="text-xs text-text-muted">From
            <input className={input} type="date" required value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} />
          </label>
          <label className="text-xs text-text-muted">OM paragraph
            <input className={input} required value={form.source} placeholder="OM 33/2025 §3.1" onChange={e => setForm({ ...form, source: e.target.value })} />
          </label>
          <label className="text-sm text-text flex items-center gap-2 md:col-span-2">
            <input type="checkbox" checked={form.verified} onChange={e => setForm({ ...form, verified: e.target.checked })} />
            Checked against the OM text
          </label>
          <div className="md:text-right"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add value'}</Button></div>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
            <tr><th className="text-left px-6 py-3">Rule</th><th className="text-left px-3 py-3">Value</th><th className="text-left px-3 py-3">In force</th><th className="text-left px-3 py-3">Source</th><th className="px-6 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.flatMap(g => g.rows.map((r, i) => (
              <tr key={r.id} className={i > 0 ? 'text-text-muted' : 'text-text'}>
                <td className="px-6 py-2 font-mono text-xs">{i === 0 ? r.ruleKey : ''}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{shown(r.value)}{r.unit ? ` ${r.unit}` : ''}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-xs">{r.effectiveFrom} → {r.effectiveTo ?? 'now'}</td>
                <td className="px-3 py-2 text-xs">{r.sourceRef}</td>
                <td className="px-6 py-2 text-right">{r.verified ? <Badge variant="success">Checked</Badge> : <Badge variant="warning">Unverified</Badge>}</td>
              </tr>
            )))}
            {groups.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-center text-text-muted">No rules loaded.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
