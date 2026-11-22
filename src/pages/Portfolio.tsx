import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { Gauge } from 'lucide-react';
import { loadPortfolio } from '../lib/projects/projectFileApi';
import { DECISION_LABELS, portfolioHealth, type Health } from '../lib/projects/monitoring';
import { STAGE_LABELS } from '../lib/projects/stage';
import { rupees } from '../lib/projects/heads';
import { friendlyError } from '../lib/errors';
import type { PortfolioRow } from '../types/projectFile';
import type { ProjectStage } from '../types';

const HEALTH: Record<Health, { label: string; variant: 'danger' | 'warning' | 'success' }> = {
  behind: { label: 'Behind', variant: 'danger' },
  watch: { label: 'Watch', variant: 'warning' },
  'on-track': { label: 'On track', variant: 'success' },
};
const RANK: Record<Health, number> = { behind: 0, watch: 1, 'on-track': 2 };

function Bar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-text-muted">—</span>;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-2" title={`${label}: ${Math.round(value)}%`}>
      <span className="w-20 h-1.5 rounded-full bg-surface-hover overflow-hidden" aria-hidden>
        <span className="block h-full bg-text-muted" style={{ width: `${v}%` }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-text w-9 text-right">{Math.round(value)}%</span>
    </span>
  );
}

export default function Portfolio() {
  const [rows, setRows] = useState<PortfolioRow[] | null>(null);
  const [error, setError] = useState('');
  const [track, setTrack] = useState<'ALL' | 'ULIP' | 'HQ' | 'NONE'>('ALL');
  const [onlyAttention, setOnlyAttention] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPortfolio().then((r) => { if (!cancelled) setRows(r); }, (e) => { if (!cancelled) setError(friendlyError(e)); });
    return () => { cancelled = true; };
  }, []);

  const view = useMemo(() => (rows ?? [])
    .map(r => ({ r, health: portfolioHealth(r) }))
    .filter(({ r }) => track === 'ALL' || (track === 'NONE' ? !r.track : r.track === track))
    .filter(({ health }) => !onlyAttention || health !== 'on-track')
    .sort((a, b) => RANK[a.health] - RANK[b.health] || b.r.overdue - a.r.overdue || a.r.projectNo.localeCompare(b.r.projectNo)),
  [rows, track, onlyAttention]);

  const counts = useMemo(() => {
    const all = (rows ?? []).map(portfolioHealth);
    return { behind: all.filter(h => h === 'behind').length, watch: all.filter(h => h === 'watch').length, total: all.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-[500] font-serif text-text">Project portfolio</h1>
        <p className="text-sm text-text-muted">
          Every running project: time elapsed against money spent and milestones met, and what is overdue.
        </p>
      </div>

      {rows && (
        <p className="text-sm text-text">
          <span className="font-mono">{counts.total}</span> running ·{' '}
          <span className="font-mono text-danger">{counts.behind}</span> behind ·{' '}
          <span className="font-mono">{counts.watch}</span> to watch
        </p>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <select aria-label="Track" value={track} onChange={(e) => setTrack(e.target.value as typeof track)}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text">
          <option value="ALL">All tracks</option><option value="ULIP">In-house (ULIP)</option>
          <option value="HQ">CSIR HQ scheme</option><option value="NONE">Not classified</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
          Only those needing attention
        </label>
      </div>

      {error && <EmptyState variant="error" title="The portfolio could not be loaded" description={error} />}
      {!error && rows && view.length === 0 && (
        <EmptyState icon={Gauge} title="No running projects to show" description="Projects appear here once sanctioned." />
      )}
      {view.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[56rem]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border">
                  <th className="px-4 py-2 font-semibold">Project</th>
                  <th className="px-4 py-2 font-semibold">Stage</th>
                  <th className="px-4 py-2 font-semibold">Time</th>
                  <th className="px-4 py-2 font-semibold">Money</th>
                  <th className="px-4 py-2 font-semibold">Milestones</th>
                  <th className="px-4 py-2 font-semibold">Overdue</th>
                  <th className="px-4 py-2 font-semibold">Next due</th>
                  <th className="px-4 py-2 font-semibold">Last review</th>
                  <th className="px-4 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {view.map(({ r, health }) => (
                  <tr key={r.projectId} className="border-t border-border align-top">
                    <td className="px-4 py-2.5">
                      <Link to={`/projects/${encodeURIComponent(r.projectId)}?tab=monitoring`} className="font-mono text-xs text-brand-blue underline">{r.projectNo}</Link>
                      <span className="block text-text max-w-[18rem] truncate" title={r.projectName}>{r.projectName}</span>
                      <span className="block text-xs text-text-muted">{r.piName} · {r.divisionCode}</span>
                    </td>
                    <td className="px-4 py-2.5 text-text">{STAGE_LABELS[r.stage as ProjectStage] ?? r.stage}</td>
                    <td className="px-4 py-2.5"><Bar value={r.elapsedPct} label="Time elapsed" /></td>
                    <td className="px-4 py-2.5">
                      <Bar value={r.sanctionedCost ? (100 * r.spent) / r.sanctionedCost : null} label="Money spent" />
                      <span className="block text-[11px] text-text-muted font-mono">{rupees(r.spent)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Bar value={r.milestonesTotal ? (100 * r.milestonesAchieved) / r.milestonesTotal : null} label="Milestones met" />
                      <span className="block text-[11px] text-text-muted">{r.milestonesAchieved} of {r.milestonesTotal}</span>
                    </td>
                    <td className={clsx('px-4 py-2.5 font-mono tabular-nums', r.overdue + r.minutesOverdue > 0 ? 'text-danger' : 'text-text-muted')}>
                      {r.overdue + r.minutesOverdue}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-text">{r.nextDue ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-text">{r.lastDecision ? DECISION_LABELS[r.lastDecision] : '—'}</td>
                    <td className="px-4 py-2.5"><Badge variant={HEALTH[health].variant}>{HEALTH[health].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
