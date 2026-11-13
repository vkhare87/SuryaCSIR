import { useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Card } from './ui/Cards';
import { Button } from './ui/Button';
import { friendlyError } from '../lib/errors';
import {
  formatMetric, loadMetricTable, loadMetrics, loadSnapshots, packRows, previousValues,
  type Metric, type MetricCell, type MetricSnapshot,
} from '../lib/metrics/api';

// Division scorecard (EV5): every number from metric_table, the change since
// the last monthly snapshot, and the "as on" pack from a frozen snapshot.
export function DivisionScorecard() {
  const { push } = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [cells, setCells] = useState<MetricCell[]>([]);
  const [snaps, setSnaps] = useState<MetricSnapshot[]>([]);
  const [asOn, setAsOn] = useState('');

  useEffect(() => {
    Promise.all([loadMetrics(), loadMetricTable(), loadSnapshots()])
      .then(([m, c, s]) => { setMetrics(m); setCells(c); setSnaps(s); })
      .catch(e => push(friendlyError(e), 'error'));
  }, [push]);

  const divisions = useMemo(() => [...new Set(cells.map(c => c.division).filter((d): d is string => d !== null))].sort(), [cells]);
  const value = useMemo(() => new Map(cells.map(c => [`${c.metric_key}|${c.division ?? ''}`, c.value])), [cells]);
  const before = useMemo(() => previousValues(snaps), [snaps]);
  const dates = useMemo(() => [...new Set(snaps.map(s => s.as_on))], [snaps]);
  const lastAsOn = dates[0];

  const pack = async () => {
    const day = asOn || lastAsOn;
    if (!day) return;
    try {
      const [{ pdf }, { MetricsPack }] = await Promise.all([import('@react-pdf/renderer'), import('../lib/reports/packs')]);
      const url = URL.createObjectURL(await pdf(<MetricsPack asOn={day} divisions={divisions} rows={packRows(metrics, snaps, day, divisions)} />).toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `institute_numbers_${day}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { push(friendlyError(err), 'error'); }
  };

  const cell = (m: Metric, div: string | null) => {
    const k = `${m.key}|${div ?? ''}`;
    const now = value.get(k) ?? null;
    const was = before.get(k);
    const delta = now !== null && was !== null && was !== undefined ? now - was : 0;
    return (
      <td key={div ?? 'all'} className="px-3 py-2 text-right whitespace-nowrap">
        <span className="text-text">{formatMetric(now, m.unit)}</span>
        {delta !== 0 && (
          <span className="ml-1 text-xs text-text-muted">
            {delta > 0 ? '+' : ''}{m.unit === 'inr' ? formatMetric(delta, 'inr') : Math.round(delta * 10) / 10}
          </span>
        )}
      </td>
    );
  };

  return (
    <Card className="p-0 overflow-hidden lg:col-span-2">
      <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[12rem]">
          <h2 className="text-base font-[500] text-text font-serif">Division scorecard</h2>
          <p className="text-xs text-text-muted">
            Live numbers{lastAsOn ? `; change since the snapshot of ${lastAsOn}` : '; no monthly snapshot yet'}. Hover a metric for its definition.
          </p>
        </div>
        <select aria-label="Pack as on" value={asOn || lastAsOn || ''} onChange={e => setAsOn(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text" disabled={!dates.length}>
          {dates.length ? dates.map(d => <option key={d} value={d}>As on {d}</option>) : <option value="">No snapshot</option>}
        </select>
        <Button variant="secondary" disabled={!dates.length} onClick={() => void pack()}><FileDown size={14} className="mr-1 inline" /> Pack PDF</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
            <tr>
              <th className="text-left px-5 py-2">Metric</th>
              <th className="text-right px-3 py-2">Institute</th>
              {divisions.map(d => <th key={d} className="text-right px-3 py-2">{d}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metrics.map(m => (
              <tr key={m.key}>
                <td className="px-5 py-2 text-text" title={m.definition}>{m.label}</td>
                {cell(m, null)}
                {divisions.map(d => cell(m, d))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
