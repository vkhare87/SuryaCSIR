import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { useData } from '../contexts/DataContext';
import { useProposals } from '../contexts/ProposalsContext';
import { useProjectReports } from '../contexts/ProjectReportsContext';
import { lifecycleThreads, type LifecycleStage } from '../lib/intelligence/lifecycle';

const STAGE_ORDER: LifecycleStage[] = [
  'Concept', 'Under Evaluation', 'Sanctioned', 'Execution', 'Completed', 'Dropped',
];

const STAGE_VARIANT: Record<LifecycleStage, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  Concept: 'neutral',
  'Under Evaluation': 'warning',
  Sanctioned: 'info',
  Execution: 'success',
  Completed: 'neutral',
  Dropped: 'danger',
};

export default function RnDMonitor() {
  const { projects } = useData();
  const { proposals } = useProposals();
  const { reports } = useProjectReports();
  const [division, setDivision] = useState('ALL');

  const threads = useMemo(
    () => lifecycleThreads(proposals, projects, reports),
    [proposals, projects, reports],
  );

  const divisions = useMemo(
    () => [...new Set(threads.map(t => t.divisionCode).filter(Boolean))].sort(),
    [threads],
  );

  const filtered = useMemo(
    () => division === 'ALL' ? threads : threads.filter(t => t.divisionCode === division),
    [threads, division],
  );

  const byStage = useMemo(() => {
    const m = new Map<LifecycleStage, typeof filtered>();
    for (const stage of STAGE_ORDER) m.set(stage, []);
    for (const t of filtered) m.get(t.stage)!.push(t);
    return m;
  }, [filtered]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text">
            <Activity className="h-6 w-6 text-text-muted" /> R&amp;D Monitor
          </h1>
          <p className="text-sm text-text-muted">
            Every R&amp;D thread from proposal conceptualisation through sanction, execution, and reporting.
          </p>
        </div>
        <select
          value={division}
          onChange={e => setDivision(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          <option value="ALL">All divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {STAGE_ORDER.map(stage => (
          <Card key={stage} className="p-4 text-center">
            <div className="text-2xl font-semibold text-text">{byStage.get(stage)!.length}</div>
            <div className="text-xs text-text-muted mt-1">{stage}</div>
          </Card>
        ))}
      </div>

      {STAGE_ORDER.map(stage => {
        const items = byStage.get(stage)!;
        if (items.length === 0) return null;
        return (
          <Card key={stage} className="p-5 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Badge variant={STAGE_VARIANT[stage]}>{stage}</Badge>
              <span className="text-text-muted font-normal">{items.length} thread{items.length > 1 ? 's' : ''}</span>
            </h3>
            <ul className="divide-y divide-border">
              {items.map(t => (
                <li key={t.key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="flex-1 min-w-48 text-text">{t.title}</span>
                  {t.divisionCode && <Badge variant="neutral">{t.divisionCode}</Badge>}
                  {t.projectNo && <span className="font-mono text-xs text-text-muted">{t.projectNo}</span>}
                  {t.proposalStatus && <span className="text-xs text-text-muted">{t.proposalStatus}</span>}
                  <span className="text-xs text-text-muted">
                    {t.reportCount > 0
                      ? `Reports: ${t.reportCount}${t.lastReport ? ` (latest ${t.lastReport})` : ''}`
                      : 'No reports'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-sm text-text-muted">
          No proposals or projects recorded yet.
        </Card>
      )}
    </div>
  );
}
