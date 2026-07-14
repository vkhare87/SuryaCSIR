import { useMemo } from 'react';
import clsx from 'clsx';
import { useData } from '../contexts/DataContext';
import { instituteFreshness, type Staleness } from '../lib/divisions/freshness';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Treemap } from '../components/viz/Treemap';
import { Heatmap } from '../components/viz/Heatmap';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEMANTIC } from '../components/viz/palette';

const STALENESS_STYLE: Record<Staleness, string> = {
  fresh: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  aging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  stale: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  empty: 'bg-surface-hover text-text-muted',
};

export default function DivisionsAnalytics() {
  const { divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents } = useData();

  const freshness = useMemo(
    () => instituteFreshness(divisions, {
      staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents,
    }),
    [divisions, staff, projects, scientificOutputs, ipIntelligence, mous, techTransfers, phDStudents],
  );

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
      <ChartCard
        title="Data freshness"
        subtitle="record completeness per division — worst first"
        className="lg:col-span-2"
        bodyClassName="min-h-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                <th className="px-3 py-2">Division</th>
                <th className="px-3 py-2 w-48">Completeness</th>
                <th className="px-3 py-2">Latest record</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Gaps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {freshness.map((f) => (
                <tr key={f.divCode}>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-text" title={f.divName}>
                    {f.divCode}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full',
                            f.completeness >= 80 ? 'bg-emerald-500' : f.completeness >= 50 ? 'bg-amber-500' : 'bg-red-500',
                          )}
                          style={{ width: `${f.completeness}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-text-muted w-9 text-right">
                        {f.completeness}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-text-muted">
                    {f.latestRecordYear ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('inline-flex text-xs font-semibold px-2 py-0.5 rounded-full', STALENESS_STYLE[f.staleness])}>
                      {f.staleness}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-muted">
                    {f.gaps.slice(0, 3).join('; ') || '—'}
                    {f.gaps.length > 3 && ` (+${f.gaps.length - 3} more)`}
                  </td>
                </tr>
              ))}
              {freshness.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-text-muted italic">
                    No division data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

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
