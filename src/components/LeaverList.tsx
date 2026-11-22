import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Badge } from './ui/Cards';
import { loadHandover, loadLeavers, type HandoverItem, type HandoverKind, type LeaverRow } from '../lib/people/api';
import { friendlyError } from '../lib/errors';

const KIND_LABEL: Record<HandoverKind, string> = {
  INSTRUMENT: 'Instrument',
  PROJECT: 'Project as PI',
  STUDENT: 'PhD student',
  ACTION_ITEM: 'Action item',
  COMMITTEE: 'Committee seat',
  PROPOSAL: 'Proposal',
  TICKET: 'Helpdesk ticket',
  STEWARD: 'Data steward',
};

function Handover({ staffId }: { staffId: string }) {
  const [items, setItems] = useState<HandoverItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    loadHandover(staffId).then(r => { if (live) setItems(r); }, e => { if (live) setError(friendlyError(e)); });
    return () => { live = false; };
  }, [staffId]);

  if (error) return <p role="alert" className="text-sm text-danger px-5 py-3">{error}</p>;
  if (!items) return <p className="text-sm text-text-muted px-5 py-3">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-text-muted px-5 py-3">Nothing on record to hand over.</p>;
  return (
    <ul className="px-5 pb-3 space-y-1 text-sm">
      {items.map(i => (
        <li key={i.kind + i.ref} className="flex items-center gap-2 flex-wrap">
          <Badge variant="neutral">{KIND_LABEL[i.kind] ?? i.kind}</Badge>
          <Link to={i.link} className="text-text hover:text-terracotta">{i.label}</Link>
          {i.due && <span className="text-xs text-text-muted font-mono">{i.due}</span>}
        </li>
      ))}
    </ul>
  );
}

/** People leaving within the window and, on click, what each one holds. */
export function LeaverList() {
  const [months, setMonths] = useState(12);
  const [rows, setRows] = useState<LeaverRow[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    loadLeavers(months).then(r => { if (live) { setRows(r); setError(''); } }, e => { if (live) setError(friendlyError(e)); });
    return () => { live = false; };
  }, [months]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-base font-[500] text-text font-serif">Leaving soon — handover</h2>
          <p className="text-xs text-text-muted">Retirements and dated transfers. Open a row to see what the person holds.</p>
        </div>
        <select aria-label="Months ahead" value={months} onChange={e => setMonths(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text">
          {[6, 12, 24].map(m => <option key={m} value={m}>Next {m} months</option>)}
        </select>
      </div>
      {error && <p role="alert" className="px-5 py-3 text-sm text-danger">{error}</p>}
      {!error && !rows && <p className="px-5 py-3 text-sm text-text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="px-5 py-3 text-sm text-text-muted">Nobody leaves in this window.</p>}
      <ul className="divide-y divide-border">
        {rows?.map(r => {
          const isOpen = open === r.staff_id;
          return (
            <li key={r.staff_id}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.staff_id)}
                className="w-full px-5 py-2.5 flex items-center gap-3 text-left hover:bg-surface-hover transition-colors">
                {isOpen ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                <span className="flex-1 min-w-0 text-sm text-text truncate">
                  {r.name}<span className="text-text-muted">{r.designation ? ` · ${r.designation}` : ''}{r.division ? ` · ${r.division}` : ''}</span>
                </span>
                <span className="text-xs text-text-muted">{r.reason}</span>
                <span className="text-xs font-mono tabular-nums text-text">{r.leaving_on}</span>
                <Badge variant={r.items > 0 ? 'warning' : 'neutral'}>{r.items} to hand over</Badge>
              </button>
              {isOpen && (
                <>
                  <p className="px-5 pb-1 text-xs"><Link to={`/staff/${encodeURIComponent(r.staff_id)}`} className="text-iron-gall hover:underline">Open profile</Link></p>
                  <Handover staffId={r.staff_id} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
