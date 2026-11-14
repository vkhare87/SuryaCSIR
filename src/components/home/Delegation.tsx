import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, SlidersHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useRules } from '../../contexts/RulesContext';
import { Card, Badge } from '../ui/Cards';
import { Button } from '../ui/Button';
import { BLOCK_TITLE, ROW } from './parts';
import {
  DELEGABLE, MODE_LABEL, PRESETS, PRESET_LABEL, floorKinds, headPowers, issueOrder, loadOrderInForce, presetOf,
} from '../../lib/home/delegation';
import type { DelegationMode, DelegationOrder, Line, Preset } from '../../lib/home/delegation';

const INPUT = 'h-8 px-2 rounded-lg border border-border bg-surface-raised text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60';
// Honest about what the dial does today: modules read it as each is connected (DH3).
const CONNECTED_NOTE = 'Modules follow this order as each one is connected to it. None is connected yet, so today it is a published office order and the record of your choice.';

function useOrder() {
  const [order, setOrder] = useState<DelegationOrder | null | undefined>(undefined);
  const reload = useCallback(() => { loadOrderInForce().then(setOrder); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { order, reload };
}

/** The Director's dial: how much reaches me. Closed to one line once an order is in force. */
export function DelegationDial() {
  const { rules } = useRules();
  const { order, reload } = useOrder();
  const floor = useMemo(() => floorKinds(rules), [rules]);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(PRESETS.BALANCED);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) setLines(DELEGABLE.map(k => {
      const l = order.lines.find(x => x.kind === k.kind && x.division === '*');
      return { kind: k.kind, mode: l?.mode ?? 'SELF', limit: l?.limit ?? (k.hasLimit ? 500000 : null) };
    }));
  }, [order]);

  const preset = presetOf(lines);
  const withHeads = lines.filter(l => l.mode !== 'SELF').length;
  const setLine = (kind: string, patch: Partial<Line>) => { setConfirm(false); setLines(ls => ls.map(l => (l.kind === kind ? { ...l, ...patch } : l))); };

  const issue = async () => {
    setBusy(true); setError('');
    try { await issueOrder(preset, lines); setConfirm(false); setOpen(false); reload(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (order === undefined) return null;
  const summary = order
    ? <>{order.preset ? PRESET_LABEL[order.preset] : 'Custom'} · <span className="font-mono">{order.lines.filter(l => l.mode !== 'SELF').length}</span> kinds with heads · order <span className="font-mono">{order.orderNo}</span> since <span className="font-mono">{order.effectiveFrom}</span></>
    : 'No delegation order yet. Every decision reaches you as today.';

  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}>
        <span className="flex items-center gap-1.5"><SlidersHorizontal size={14} aria-hidden="true" />How much reaches me</span>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-block py-1.5 -my-1.5 hover:underline">
          {open ? 'Close' : order ? 'Change' : 'Set it'}
        </button>
      </p>
      <p className="text-sm text-text">{summary}</p>

      {open && (
        <div className="mt-3">
          <div role="group" aria-label="Presets" className="flex flex-wrap gap-1.5 mb-2">
            {(Object.keys(PRESETS) as Preset[]).map(p => (
              <Button key={p} type="button" size="sm" variant={preset === p ? 'secondary' : 'ghost'} aria-pressed={preset === p}
                onClick={() => { setConfirm(false); setLines(PRESETS[p]); }}>{PRESET_LABEL[p]}</Button>
            ))}
            {!preset && <Badge variant="neutral" className="normal-case self-center">custom</Badge>}
          </div>
          {DELEGABLE.map((k) => {
            const l = lines.find(x => x.kind === k.kind) as Line;
            return (
              <div key={k.kind} className={clsx(ROW, 'flex-wrap')}>
                <p className="flex-1 min-w-[180px] text-sm text-text">{k.label}</p>
                {k.hasLimit && l.mode !== 'SELF' && (
                  <label className="text-xs text-text-muted flex items-center gap-1">up to ₹
                    <input type="number" min={0} step={10000} value={l.limit ?? ''} aria-label={`${k.label}: limit in rupees`}
                      onChange={e => setLine(k.kind, { limit: e.target.value === '' ? null : Number(e.target.value) })} className={clsx(INPUT, 'w-28 font-mono')} />
                  </label>
                )}
                <select aria-label={k.label} value={l.mode} onChange={e => setLine(k.kind, { mode: e.target.value as DelegationMode })} className={INPUT}>
                  {(Object.keys(MODE_LABEL) as DelegationMode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                </select>
              </div>
            );
          })}
          {floor.length > 0 && (
            <div className={clsx(ROW, 'items-start')}>
              <Lock size={14} className="text-text-muted mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-text-muted">
                Stay with you by rule: {floor.map(f => f.note).join(', ')}.
                {floor.some(f => !f.verified) && ' This list is the plan’s default until the CSIR Delegation of Powers text is entered.'}
              </p>
            </div>
          )}
          <p className="text-xs text-text-muted mt-3">{CONNECTED_NOTE}</p>
          {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
            {confirm && <p className="text-xs text-text-muted flex-1 min-w-[200px]">This issues a new office order to all staff. {withHeads} kinds go to the heads. The order before it ends today.</p>}
            {confirm
              ? <><Button type="button" variant="ghost" onClick={() => setConfirm(false)}>Back</Button>
                <Button type="button" variant="secondary" isLoading={busy} onClick={issue}>Issue the order</Button></>
              : <Button type="button" variant="secondary" onClick={() => setConfirm(true)}>Issue as an order</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

/** For a head: what they decide under the order in force. Absent when nothing is delegated. */
export function HeadPowers({ division }: { division: string | null }) {
  const { order } = useOrder();
  const powers = headPowers(order ?? null, division);
  if (!order || powers.length === 0) return null;
  const label = (kind: string) => DELEGABLE.find(k => k.kind === kind)?.label ?? kind;
  return (
    <Card className="p-5">
      <p className={BLOCK_TITLE}><span>You decide these under order <span className="font-mono">{order.orderNo}</span></span></p>
      {powers.map(p => (
        <div key={`${p.kind}-${p.division}`} className={ROW}>
          <p className="flex-1 text-sm text-text">{label(p.kind)}{p.limit !== null ? <> · up to ₹<span className="font-mono">{p.limit.toLocaleString('en-IN')}</span></> : null}</p>
          <span className="text-xs text-text-muted">{p.mode === 'HEAD_TELL' ? 'the Director is told' : 'the Director sees flags'}</span>
        </div>
      ))}
      <p className="text-xs text-text-muted mt-2">{CONNECTED_NOTE}</p>
    </Card>
  );
}
