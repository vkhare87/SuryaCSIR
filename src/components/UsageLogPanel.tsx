import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { loadUsage, logbookRequired, logUsage } from '../lib/compliance/api';
import { friendlyError } from '../lib/errors';
import type { EquipmentUsage, StaffMember } from '../types';

const input = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';
const today = () => new Date().toISOString().slice(0, 10);

/** The usage logbook of a major project instrument (§3.1). Entries are added, never changed. */
export function UsageLogPanel({ equipmentId, staff }: { equipmentId: string; staff: StaffMember[] }) {
  const { push } = useToast();
  const [required, setRequired] = useState(false);
  const [rows, setRows] = useState<EquipmentUsage[]>([]);
  const [form, setForm] = useState({ usedOn: today(), hours: '', user: '', purpose: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const req = await logbookRequired(equipmentId);
      setRequired(req);
      if (req) setRows(await loadUsage(equipmentId));
    } catch (e) { push(friendlyError(e), 'error'); }
  }, [equipmentId, push]);
  useEffect(() => { void reload(); }, [reload]);

  if (!required) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await logUsage(equipmentId, form.usedOn, Number(form.hours), form.user || null, form.purpose);
      setForm({ usedOn: today(), hours: '', user: '', purpose: '' });
      push('Entry added to the logbook', 'success');
      await reload();
    } catch (err) { push(friendlyError(err), 'error'); }
    finally { setBusy(false); }
  };

  const nameOf = (id: string | null) => (id ? staff.find(s => s.ID === id)?.Name ?? id : '—');

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <BookOpenCheck size={16} className="text-terracotta" />
        <h3 className="text-base font-[500] text-text font-serif">Usage logbook</h3>
      </div>
      <form onSubmit={e => void save(e)} className="px-5 py-3 flex flex-wrap items-end gap-2 border-b border-border">
        <label className="text-xs text-text-muted">Date<input type="date" className={`block ${input}`} max={today()} required value={form.usedOn} onChange={e => setForm({ ...form, usedOn: e.target.value })} /></label>
        <label className="text-xs text-text-muted">Hours<input type="number" step="0.25" min="0.25" max="24" className={`block w-20 ${input}`} required value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} /></label>
        <label className="text-xs text-text-muted">Used by
          <select className={`block ${input}`} value={form.user} onChange={e => setForm({ ...form, user: e.target.value })}>
            <option value="">—</option>
            {staff.map(s => <option key={s.ID} value={s.ID}>{s.Name}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-muted flex-1 min-w-40">Purpose<input className={`block w-full ${input}`} required value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></label>
        <Button type="submit" disabled={busy}>Add</Button>
      </form>
      <ul className="divide-y divide-border">
        {rows.map(r => (
          <li key={r.id} className="px-5 py-2 flex items-center gap-4 text-sm">
            <span className="font-mono tabular-nums text-xs text-text-muted w-24">{r.usedOn}</span>
            <span className="font-mono tabular-nums text-xs w-12 text-right">{r.hours} h</span>
            <span className="flex-1 text-text truncate">{r.purpose}</span>
            <span className="text-xs text-text-muted">{nameOf(r.userStaffId)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-5 py-4 text-sm text-text-muted">No entries yet.</li>}
      </ul>
    </Card>
  );
}
