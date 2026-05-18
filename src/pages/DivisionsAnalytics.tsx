import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Treemap } from '../components/viz/Treemap';
import { Heatmap } from '../components/viz/Heatmap';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEMANTIC } from '../components/viz/palette';

export default function DivisionsAnalytics() {
  const { divisions, staff, projects, scientificOutputs } = useData();

  const strengthGrouped = useMemo(
    () =>
      divisions.map((d) => ({
        label: d.divCode,
        sanctioned: d.divSanctionedstrength || 0,
        current: d.divCurrentStrength || 0,
      })),
    [divisions],
  );

  const treemapData = useMemo(
    () =>
      divisions
        .map((d) => ({ name: d.divCode, size: d.divCurrentStrength || 0 }))
        .filter((d) => d.size > 0),
    [divisions],
  );

  const projectsByDivision = useMemo(
    () =>
      divisions
        .map((d) => ({
          label: d.divCode,
          value: projects.filter((p) => p.DivisionCode === d.divCode && p.ProjectStatus === 'Active').length,
        }))
        .sort((a, b) => b.value - a.value),
    [divisions, projects],
  );

  const outputDensity = useMemo(
    () =>
      divisions
        .map((d) => {
          const scientistsInDiv = staff.filter((s) => s.Division === d.divCode).length || 1;
          const pubs = scientificOutputs.filter((o) => o.divisionCode === d.divCode).length;
          return { label: d.divCode, value: Math.round((pubs / scientistsInDiv) * 100) / 100 };
        })
        .sort((a, b) => b.value - a.value),
    [divisions, staff, scientificOutputs],
  );

  const researchAreaHeatmap = useMemo(() => {
    const areaSet = new Set<string>();
    for (const d of divisions) {
      (d.divResearchAreas || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((a) => areaSet.add(a));
    }
    const areas = Array.from(areaSet).sort().slice(0, 12);
    const divs = divisions.map((d) => d.divCode);
    const cells = [];
    for (const d of divisions) {
      const myAreas = new Set(
        (d.divResearchAreas || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      for (const a of areas) {
        cells.push({ row: d.divCode, col: a, value: myAreas.has(a) ? 1 : 0 });
      }
    }
    return { cells, rows: divs, cols: areas };
  }, [divisions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Sanctioned vs Current" subtitle="strength per division" className="lg:col-span-2">
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={strengthGrouped} margin={{ top: 8, right: 12, bottom: 24, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--color-text-muted)' }} />
              <Bar dataKey="sanctioned" name="Sanctioned" fill={SEMANTIC.neutral} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {strengthGrouped.map((_, i) => (
                  <Cell key={`s-${i}`} fill={SEMANTIC.neutral} />
                ))}
              </Bar>
              <Bar dataKey="current" name="Current" fill={SEMANTIC.brand} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {strengthGrouped.map((_, i) => (
                  <Cell key={`c-${i}`} fill={SEMANTIC.brand} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Treemap" subtitle="sized by current strength">
        <Treemap data={treemapData} />
      </ChartCard>

      <ChartCard title="Active projects per division">
        <CategoryBar data={projectsByDivision} />
      </ChartCard>

      <ChartCard title="Publications per scientist" subtitle="output density" className="lg:col-span-2">
        <CategoryBar data={outputDensity} />
      </ChartCard>

      <ChartCard title="Research-area coverage" subtitle="division × area" className="lg:col-span-2" bodyClassName="min-h-0">
        <Heatmap
          data={researchAreaHeatmap.cells}
          rows={researchAreaHeatmap.rows}
          cols={researchAreaHeatmap.cols}
          formatValue={(v) => (v > 0 ? '●' : '')}
        />
      </ChartCard>
    </div>
  );
}
