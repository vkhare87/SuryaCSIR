import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { Histogram } from '../components/viz/Histogram';
import { useChartFilter } from '../utils/useChartFilter';

function yearsBetween(dateStr: string, ref = new Date()): number {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return NaN;
  return (ref.getTime() - t) / (365.25 * 86400000);
}

export default function StaffAnalytics() {
  const { staff } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const byDivision = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Division || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [staff]);

  const designationMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Designation || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [staff]);

  const groupMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      counts.set(s.Group || 'Unspecified', (counts.get(s.Group || 'Unspecified') ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [staff]);

  const tenureYears = useMemo(
    () => staff.map((s) => yearsBetween(s.DOJ)).filter((v) => Number.isFinite(v) && v >= 0),
    [staff],
  );

  const retirementRunway = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, number> = { '0–1y': 0, '1–3y': 0, '3–5y': 0, '5–10y': 0, '>10y': 0 };
    for (const s of staff) {
      if (!s.DOB) continue;
      const t = Date.parse(s.DOB);
      if (!Number.isFinite(t)) continue;
      const retireAt = new Date(t);
      retireAt.setFullYear(retireAt.getFullYear() + 60);
      const yrs = (retireAt.getTime() - now.getTime()) / (365.25 * 86400000);
      if (yrs < 0) continue;
      if (yrs <= 1) buckets['0–1y']++;
      else if (yrs <= 3) buckets['1–3y']++;
      else if (yrs <= 5) buckets['3–5y']++;
      else if (yrs <= 10) buckets['5–10y']++;
      else buckets['>10y']++;
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [staff]);

  const genderMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of staff) {
      const k = s.Gender || 'Unspecified';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [staff]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Staff Analytics</h1>
          <p className="text-text-muted mt-1 text-sm">Institute-wide workforce overview</p>
        </div>
        <Link
          to="/hr-admin"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={14} />
          Back to HR Admin
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Headcount by division" subtitle="click to filter the staff list">
          <CategoryBar
            data={byDivision}
            onSelect={(d) => toggleFilter({ dim: 'division', value: d.label })}
            selected={filter?.dim === 'division' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Top 12 designations">
          <CategoryBar
            data={designationMix}
            horizontal
            onSelect={(d) => toggleFilter({ dim: 'designation', value: d.label })}
            selected={filter?.dim === 'designation' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Group mix">
          <CategoryDonut
            data={groupMix}
            onSelect={(d) => toggleFilter({ dim: 'group', value: d.label })}
            selected={filter?.dim === 'group' ? filter.value : null}
          />
        </ChartCard>

        <ChartCard title="Gender mix">
          <CategoryDonut data={genderMix} />
        </ChartCard>

        <ChartCard title="Service tenure" subtitle="years since DOJ">
          <Histogram values={tenureYears} xLabel="years" yLabel="staff" />
        </ChartCard>

        <ChartCard title="Retirement runway" subtitle="from DOB + 60y">
          <CategoryBar data={retirementRunway} />
        </ChartCard>
      </div>
    </div>
  );
}
