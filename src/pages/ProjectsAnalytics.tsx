import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Treemap } from '../components/viz/Treemap';
import { Heatmap } from '../components/viz/Heatmap';
import { Histogram } from '../components/viz/Histogram';
import { HeatmapCalendar } from '../components/viz/HeatmapCalendar';
import { useChartFilter } from '../utils/useChartFilter';
import { parseCost } from '../utils/parseCost';
import { budgetWatch, type BudgetFlag } from '../lib/projects/budgetWatch';
import { Badge } from '../components/ui/Cards';

const FLAG_LABEL: Record<BudgetFlag, string> = {
  overrun: 'Overrun', exhaustion: 'Near exhaustion', ahead: 'Ahead of burn', behind: 'Behind burn',
};

const FLAG_VARIANT: Record<BudgetFlag, 'danger' | 'warning' | 'info'> = {
  overrun: 'danger', exhaustion: 'danger', ahead: 'warning', behind: 'info',
};

export default function ProjectsAnalytics() {
  const { projects } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const fundMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const k = p.FundType || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [projects]);

  const statusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      counts.set(p.ProjectStatus, (counts.get(p.ProjectStatus) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [projects]);

  const sponsorerTreemap = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of projects) {
      const k = p.SponsorerName || 'Unspecified';
      totals.set(k, (totals.get(k) ?? 0) + parseCost(p.SanctionedCost));
    }
    return Array.from(totals, ([name, size]) => ({ name, size }))
      .filter((d) => d.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 15);
  }, [projects]);

  const piWorkload = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const k = p.PrincipalInvestigator || 'Unassigned';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [projects]);

  const divFundHeatmap = useMemo(() => {
    const divs = Array.from(new Set(projects.map((p) => p.DivisionCode).filter(Boolean))).sort();
    const funds = Array.from(new Set(projects.map((p) => p.FundType || 'Unspecified'))).sort();
    const cells = [];
    for (const d of divs) {
      for (const f of funds) {
        cells.push({
          row: d,
          col: f,
          value: projects.filter((p) => p.DivisionCode === d && (p.FundType || 'Unspecified') === f).length,
        });
      }
    }
    return { cells, divs, funds };
  }, [projects]);

  const costs = useMemo(() => projects.map((p) => parseCost(p.SanctionedCost)).filter((v) => v > 0), [projects]);

  const calendarData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const day = (p.StartDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return Array.from(counts, ([day, value]) => ({ day, value }));
  }, [projects]);

  const calendarRange = useMemo(() => {
    if (calendarData.length === 0) {
      const now = new Date();
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    const sorted = [...calendarData].sort((a, b) => a.day.localeCompare(b.day));
    return { from: sorted[0].day.slice(0, 4) + '-01-01', to: sorted[sorted.length - 1].day.slice(0, 4) + '-12-31' };
  }, [calendarData]);

  const watch = useMemo(() => budgetWatch(projects), [projects]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {watch.length > 0 && (
        <ChartCard
          title="Budget watch"
          subtitle="review triggers — spend vs linear burn; R&D spend is stepwise, verify before acting"
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-text-muted">
                <tr>
                  <th className="p-2 font-medium">Project</th>
                  <th className="p-2 font-medium">PI</th>
                  <th className="p-2 font-medium">Flag</th>
                  <th className="p-2 font-medium">Spent</th>
                  <th className="p-2 font-medium">Time elapsed</th>
                  <th className="p-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {watch.slice(0, 15).map((w) => (
                  <tr key={w.project.ProjectID} className="border-t border-border">
                    <td className="p-2 text-text">{w.project.ProjectNo || w.project.ProjectName}</td>
                    <td className="p-2 text-text-muted">{w.project.PrincipalInvestigator || '—'}</td>
                    <td className="p-2"><Badge variant={FLAG_VARIANT[w.flag]}>{FLAG_LABEL[w.flag]}</Badge></td>
                    <td className="p-2 text-text-muted">{w.utilizationPct.toFixed(0)}%</td>
                    <td className="p-2 text-text-muted">{w.elapsedPct != null ? `${w.elapsedPct.toFixed(0)}%` : '—'}</td>
                    <td className="p-2 text-text-muted">
                      {w.variancePp != null ? `${w.variancePp > 0 ? '+' : ''}${w.variancePp.toFixed(0)}pp` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {watch.length > 15 && (
              <div className="p-2 text-xs text-text-muted">…and {watch.length - 15} more</div>
            )}
          </div>
        </ChartCard>
      )}

      <ChartCard title="Fund type">
        <CategoryDonut
          data={fundMix}
          onSelect={(d) => toggleFilter({ dim: 'fundType', value: d.label })}
          selected={filter?.dim === 'fundType' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Project status">
        <CategoryDonut
          data={statusMix}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Top sponsorers" subtitle="treemap sized by sanctioned cost (₹L)" className="lg:col-span-2">
        <Treemap
          data={sponsorerTreemap}
          onClick={(d) => toggleFilter({ dim: 'sponsorer', value: d.name })}
        />
      </ChartCard>

      <ChartCard title="PI workload" subtitle="top 10 by project count">
        <CategoryBar
          data={piWorkload}
          horizontal
          onSelect={(d) => toggleFilter({ dim: 'pi', value: d.label })}
          selected={filter?.dim === 'pi' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Sanctioned cost distribution">
        <Histogram values={costs} xLabel="₹L" yLabel="projects" />
      </ChartCard>

      <ChartCard title="Division × Fund Type" className="lg:col-span-2" bodyClassName="min-h-0">
        <Heatmap
          data={divFundHeatmap.cells}
          rows={divFundHeatmap.divs}
          cols={divFundHeatmap.funds}
          onCellClick={(c) => toggleFilter({ dim: 'division', value: c.row })}
        />
      </ChartCard>

      <ChartCard title="Project starts" subtitle="calendar heatmap of StartDate" className="lg:col-span-2">
        <HeatmapCalendar data={calendarData} from={calendarRange.from} to={calendarRange.to} height={220} />
      </ChartCard>
    </div>
  );
}
