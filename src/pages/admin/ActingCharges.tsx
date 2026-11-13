import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { UserCog } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { assignActing, endActing, loadActing, type ActingAssignment } from '../../lib/people/api';
import { friendlyError } from '../../lib/errors';

const input = 'rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-terracotta/40';
const today = () => new Date().toISOString().slice(0, 10);

export default function ActingCharges() {
  const { staff, divisions } = useData();
  const { push } = useToast();
  const [rows, setRows] = useState<ActingAssignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ role: 'HOD', division: '', principal: '', acting: '', from: today(), to: today(), orderRef: '' });

  const reload = useCallback(() => { loadActing().then(setRows).catch(e => push(friendlyError(e), 'error')); }, [push]);
  useEffect(() => { reload(); }, [reload]);

  // Only people with a login can hold or hand over a charge.
  const people = useMemo(() => staff.filter(s => s.user_id), [staff]);
  const nameOf = useCallback((userId: string | null) => people.find(s => s.user_id === userId)?.Name ?? '—', [people]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); push(done, 'success'); reload(); }
    catch (e) { push(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => assignActing({ ...f, division: f.role === 'Director' ? null : f.division, principal: f.principal || null }), 'Acting charge recorded');
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <UserCog size={26} className="text-terracotta" /> Acting Charges
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          While a charge runs, the acting officer holds the role and its approvals; the next day they do not. The record shows who acted in what capacity.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <label className="text-xs text-text-muted">Charge
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className={`block w-full ${input}`}>
              <option value="HOD">HoD</option><option value="DivisionHead">Division Head</option><option value="Director">Director</option>
            </select>
          </label>
          {f.role !== 'Director' && (
            <label className="text-xs text-text-muted">Division
              <select required value={f.division} onChange={e => setF({ ...f, division: e.target.value })} className={`block w-full ${input}`}>
                <option value="">Choose…</option>
                {divisions.map(d => <option key={d.divCode} value={d.divCode}>{d.divCode} · {d.divName}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-text-muted">In place of
            <select value={f.principal} onChange={e => setF({ ...f, principal: e.target.value })} className={`block w-full ${input}`}>
              <option value="">—</option>
              {people.map(s => <option key={s.ID} value={s.user_id!}>{s.Name}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">Acting officer
            <select required value={f.acting} onChange={e => setF({ ...f, acting: e.target.value })} className={`block w-full ${input}`}>
              <option value="">Choose…</option>
              {people.map(s => <option key={s.ID} value={s.user_id!}>{s.Name}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">From<input type="date" required value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className={`block w-full ${input}`} /></label>
          <label className="text-xs text-text-muted">To<input type="date" required value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className={`block w-full ${input}`} /></label>
          <label className="text-xs text-text-muted md:col-span-1">Office order<input required value={f.orderRef} onChange={e => setF({ ...f, orderRef: e.target.value })} className={`block w-full ${input}`} /></label>
          <Button type="submit" disabled={busy}>Record</Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted"><tr>
            <th className="text-left px-5 py-2">Charge</th><th className="text-left">Acting officer</th><th className="text-left">In place of</th>
            <th className="text-left">Dates</th><th className="text-left">Order</th><th className="px-5" />
          </tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => {
              const live = r.from_on <= today() && today() <= r.to_on;
              return (
                <tr key={r.id}>
                  <td className="px-5 py-2 text-text">{r.role}{r.division_code ? ` · ${r.division_code}` : ''} {live && <Badge variant="success">Now</Badge>}</td>
                  <td className="text-text">{nameOf(r.acting_user_id)}</td>
                  <td className="text-text-muted">{nameOf(r.principal_user_id)}</td>
                  <td className="font-mono text-xs">{r.from_on} → {r.to_on}</td>
                  <td className="text-xs text-text-muted">{r.order_ref}</td>
                  <td className="px-5 text-right">{live && (
                    <button className="text-xs text-terracotta hover:underline" disabled={busy} onClick={() => void run(() => endActing(r.id, today()), 'Charge ends today')}>End today</button>
                  )}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-4 text-sm text-text-muted">No acting charges recorded.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
