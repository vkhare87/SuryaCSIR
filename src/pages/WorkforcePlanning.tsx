import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Card, Badge } from '../components/ui/Cards';
import { loadOutlook, loadWorkload, type OutlookRow, type WorkloadRow } from '../lib/people/api';
import { friendlyError } from '../lib/errors';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function WorkforcePlanning() {
  const { push } = useToast();
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [outlook, setOutlook] = useState<OutlookRow[]>([]);
  const [years, setYears] = useState(5);

  useEffect(() => { loadWorkload().then(setWorkload).catch(e => push(friendlyError(e), 'error')); }, [push]);
  useEffect(() => { loadOutlook(years).then(setOutlook).catch(e => push(friendlyError(e), 'error')); }, [years, push]);

  // --- 1. Outlook by year: retirements (flag the only holder of an area) and vacancies ---
  const byYear = useMemo(() => {
    const m = new Map<number, OutlookRow[]>();
    for (const r of outlook) m.set(r.year, [...(m.get(r.year) ?? []), r]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [outlook]);
  const overloaded = useMemo(() => workload.filter(w => w.overload).length, [workload]);
  const idle = useMemo(() => workload.filter(w => w.active_projects === 0).length, [workload]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-[500] text-text uppercase tracking-tight font-serif flex items-center gap-3">
          <Users size={26} className="text-terracotta" /> Workforce Planning
        </h1>
        <p className="text-text-muted mt-1 text-sm">Who retires, which posts are empty, and who carries how much — from the records you may see.</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <h2 className="text-base font-[500] text-text font-serif flex-1">Retirements and vacancies</h2>
          <select aria-label="Years ahead" value={years} onChange={e => setYears(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text">
            {[3, 5, 10].map(y => <option key={y} value={y}>Next {y} years</option>)}
          </select>
        </div>
        {byYear.length === 0 && <p className="px-5 py-4 text-sm text-text-muted">Nothing in this window.</p>}
        {byYear.map(([year, rs]) => (
          <div key={year} className="px-5 py-3 border-b border-border last:border-0">
            <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{year}</p>
            <ul className="space-y-1 text-sm">
              {rs.map(r => (
                <li key={r.kind + r.ref} className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.kind === 'VACANCY' ? 'info' : 'neutral'}>{r.kind === 'VACANCY' ? 'Vacant post' : 'Retires'}</Badge>
                  {r.kind === 'RETIREMENT' ? <Link to={`/staff/${encodeURIComponent(r.ref)}`} className="text-text hover:text-terracotta">{r.label}</Link>
                    : <span className="text-text">{r.ref} · {r.label}</span>}
                  {r.discipline && <span className="text-xs text-text-muted">{r.discipline}</span>}
                  {r.single_holder && <Badge variant="warning">Only holder of this area</Badge>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-base font-[500] text-text font-serif">Deployment and workload</h2>
          <p className="text-xs text-text-muted">{overloaded} on more than four running projects · {idle} on none. Time split from the latest work plan.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted"><tr>
            <th className="text-left px-5 py-2">Person</th><th className="text-right">Running projects</th><th className="text-right">As PI</th>
            <th className="text-right">Value led</th><th className="text-left px-5">Work plan time split</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {workload.map(w => (
              <tr key={w.staff_id}>
                <td className="px-5 py-2"><Link to={`/staff/${encodeURIComponent(w.staff_id)}`} className="text-text hover:text-terracotta">{w.name}</Link>
                  <span className="text-xs text-text-muted"> · {w.division ?? '—'}</span></td>
                <td className="text-right font-mono tabular-nums">{w.active_projects}{w.overload && <Badge variant="warning" className="ml-2">Overload</Badge>}</td>
                <td className="text-right font-mono tabular-nums">{w.as_pi}</td>
                <td className="text-right font-mono tabular-nums text-text-muted">{w.sanctioned_value ? inr(w.sanctioned_value) : '—'}</td>
                <td className="px-5 text-xs text-text-muted">
                  {w.awp_time_pct.length ? w.awp_time_pct.filter(a => a.timePct > 0).map(a => `${a.label} ${a.timePct}%`).join(' · ') : 'No work plan'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
