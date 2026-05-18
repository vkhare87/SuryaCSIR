import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Heatmap } from '../components/viz/Heatmap';
import { useChartFilter } from '../utils/useChartFilter';

export default function FacilitiesAnalytics() {
  const { equipment, labs } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const labMap = useMemo(() => new Map(labs.map((l) => [l.id, l.lab_name])), [labs]);

  const statusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of equipment) {
      counts.set(e.WorkingStatus, (counts.get(e.WorkingStatus) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [equipment]);

  const perLab = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of equipment) {
      const labName = e.lab_id ? (labMap.get(e.lab_id) ?? e.lab_id) : 'Unassigned';
      counts.set(labName, (counts.get(labName) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [equipment, labMap]);

  const perDivision = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of equipment) {
      const k = e.Division || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [equipment]);

  const divLabHeatmap = useMemo(() => {
    const divs = Array.from(new Set(equipment.map((e) => e.Division).filter(Boolean))).sort();
    const lbls = Array.from(new Set(equipment.map((e) => (e.lab_id ? (labMap.get(e.lab_id) ?? e.lab_id) : 'Unassigned')))).sort();
    const cells = [];
    for (const d of divs) {
      for (const l of lbls) {
        cells.push({
          row: d,
          col: l,
          value: equipment.filter(
            (e) => e.Division === d && (e.lab_id ? labMap.get(e.lab_id) ?? e.lab_id : 'Unassigned') === l,
          ).length,
        });
      }
    }
    return { cells, divs, lbls };
  }, [equipment, labMap]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Operational status">
        <CategoryDonut
          data={statusMix}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Equipment per division">
        <CategoryBar
          data={perDivision}
          onSelect={(d) => toggleFilter({ dim: 'division', value: d.label })}
          selected={filter?.dim === 'division' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Equipment per lab" subtitle="top 12" className="lg:col-span-2">
        <CategoryBar data={perLab} horizontal height={320} />
      </ChartCard>

      <ChartCard title="Division × Lab utilization" className="lg:col-span-2" bodyClassName="min-h-0">
        <Heatmap
          data={divLabHeatmap.cells}
          rows={divLabHeatmap.divs}
          cols={divLabHeatmap.lbls}
          onCellClick={(c) => toggleFilter({ dim: 'division', value: c.row })}
        />
      </ChartCard>
    </div>
  );
}
