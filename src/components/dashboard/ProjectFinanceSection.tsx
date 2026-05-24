import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { ProgressRing } from '../viz/ProgressRing';
import { CategoryBar } from '../viz/CategoryBar';
import { Treemap } from '../viz/Treemap';
import { GanttLite } from '../viz/GanttLite';
import { parseCost } from '../../utils/parseCost';
import {
  getInstituteUtilization,
  getUtilizationByDivision,
  getActiveProjectGantt,
  getGanttWindow,
} from '../../utils/directorMetrics';

const GANTT_RANGES = [
  { label: 'This year', years: 1 },
  { label: '3 years', years: 3 },
  { label: '5 years', years: 5 },
] as const;

export function ProjectFinanceSection() {
  const { projects } = useData();
  const navigate = useNavigate();
  const [ganttYears, setGanttYears] = useState(1);

  const util = useMemo(() => getInstituteUtilization(projects), [projects]);
  const byDiv = useMemo(() => getUtilizationByDivision(projects), [projects]);
  const ganttWindow = useMemo(() => getGanttWindow(ganttYears), [ganttYears]);
  const gantt = useMemo(() => getActiveProjectGantt(projects, ganttWindow), [projects, ganttWindow]);
  const sponsorers = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects) {
      const k = p.SponsorerName || 'Unspecified';
      m.set(k, (m.get(k) ?? 0) + parseCost(p.SanctionedCost));
    }
    return Array.from(m, ([name, size]) => ({ name, size }))
      .filter((d) => d.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 12);
  }, [projects]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Project &amp; Finance</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Fund utilization" subtitle="institute-wide, utilized vs sanctioned">
          <div className="flex items-center justify-center min-h-[200px]">
            <ProgressRing value={util.utilized} max={util.sanctioned} size={160} label="utilized" />
          </div>
        </ChartCard>
        <ChartCard title="Utilization % by division">
          <CategoryBar data={byDiv} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
        <ChartCard
          title="Active projects timeline"
          subtitle="start → completion (top 15)"
          className="lg:col-span-2"
          action={
            <select
              value={ganttYears}
              onChange={(e) => setGanttYears(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
            >
              {GANTT_RANGES.map((r) => (
                <option key={r.years} value={r.years}>
                  {r.label}
                </option>
              ))}
            </select>
          }
        >
          <GanttLite items={gantt} domainStart={ganttWindow.start} domainEnd={ganttWindow.end} onClick={() => navigate('/projects')} />
        </ChartCard>
        <ChartCard title="Top sponsorers" subtitle="sized by sanctioned cost" className="lg:col-span-2">
          <Treemap data={sponsorers} onClick={() => navigate('/projects')} />
        </ChartCard>
      </div>
    </section>
  );
}
