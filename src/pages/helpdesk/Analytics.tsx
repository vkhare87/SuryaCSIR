import { useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../../components/viz/ChartCard';
import { CategoryDonut } from '../../components/viz/CategoryDonut';
import { CategoryBar } from '../../components/viz/CategoryBar';
import { Heatmap } from '../../components/viz/Heatmap';
import { Histogram } from '../../components/viz/Histogram';
import { TrendLine } from '../../components/viz/TrendLine';
import { useChartFilter } from '../../utils/useChartFilter';
import { URGENCY_SORT_ORDER, STATUS_SORT_ORDER, CATEGORY_CONFIG } from '../../lib/helpdesk/constants';

export default function HelpdeskAnalytics() {
  const { tickets, staff } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((s) => m.set(s.ID, s.Name));
    return m;
  }, [staff]);

  const statusMix = useMemo(
    () =>
      STATUS_SORT_ORDER.map((s) => ({
        label: s,
        value: tickets.filter((t) => t.status === s).length,
      })),
    [tickets],
  );

  const urgencyCategoryHeatmap = useMemo(() => {
    const cells = [];
    for (const u of URGENCY_SORT_ORDER) {
      for (const c of CATEGORY_CONFIG) {
        cells.push({
          row: u,
          col: c.value,
          value: tickets.filter((t) => t.urgency === u && t.category === c.value).length,
        });
      }
    }
    return cells;
  }, [tickets]);

  const assigneeWorkload = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const k = t.assigned_to ? (staffById.get(t.assigned_to) ?? t.assigned_to) : 'Unassigned';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [tickets, staffById]);

  const resolutionHours = useMemo(() => {
    const out: number[] = [];
    for (const t of tickets) {
      if (t.status !== 'Resolved' && t.status !== 'Closed') continue;
      if (!t.resolved_at) continue;
      const start = Date.parse(t.created_at);
      const end = Date.parse(t.resolved_at);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const hrs = (end - start) / 36e5;
      if (hrs >= 0) out.push(hrs);
    }
    return out;
  }, [tickets]);

  const dailyVolume = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const day = (t.created_at || '').slice(0, 10);
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-30);
  }, [tickets]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Status">
        <CategoryDonut
          data={statusMix}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Assignee workload" subtitle="top 10 assignees">
        <CategoryBar
          data={assigneeWorkload}
          horizontal
          onSelect={(d) => toggleFilter({ dim: 'assignee', value: d.label })}
          selected={filter?.dim === 'assignee' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Urgency × Category" className="lg:col-span-2" bodyClassName="min-h-0">
        <Heatmap
          data={urgencyCategoryHeatmap}
          rows={[...URGENCY_SORT_ORDER]}
          cols={CATEGORY_CONFIG.map((c) => c.value)}
          onCellClick={(c) => toggleFilter({ dim: 'urgency', value: c.row })}
        />
      </ChartCard>

      <ChartCard title="Resolution time" subtitle="hours from open to resolve">
        <Histogram values={resolutionHours} xLabel="hours" yLabel="tickets" />
      </ChartCard>

      <ChartCard title="Daily volume" subtitle="last 30 days with tickets">
        <TrendLine data={dailyVolume} />
      </ChartCard>
    </div>
  );
}
