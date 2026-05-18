import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { Treemap } from '../components/viz/Treemap';
import { useChartFilter } from '../utils/useChartFilter';

export default function PhDAnalytics() {
  const { phDStudents } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const statusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of phDStudents) {
      counts.set(s.CurrentStatus, (counts.get(s.CurrentStatus) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [phDStudents]);

  const specializationMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of phDStudents) {
      const k = s.Specialization || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size);
  }, [phDStudents]);

  const supervisorWorkload = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of phDStudents) {
      const k = s.SupervisorName || 'Unassigned';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [phDStudents]);

  const divisionLoad = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of phDStudents) {
      const k = s.DivisionCode || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [phDStudents]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Status">
        <CategoryDonut
          data={statusMix}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Supervisor workload" subtitle="top 10 by student count">
        <CategoryBar
          data={supervisorWorkload}
          horizontal
          onSelect={(d) => toggleFilter({ dim: 'supervisor', value: d.label })}
          selected={filter?.dim === 'supervisor' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Specializations" subtitle="treemap sized by student count">
        <Treemap
          data={specializationMix}
          onClick={(d) => toggleFilter({ dim: 'specialization', value: d.name })}
        />
      </ChartCard>

      <ChartCard title="Students per division">
        <CategoryBar
          data={divisionLoad}
          onSelect={(d) => toggleFilter({ dim: 'division', value: d.label })}
          selected={filter?.dim === 'division' ? filter.value : null}
        />
      </ChartCard>
    </div>
  );
}
