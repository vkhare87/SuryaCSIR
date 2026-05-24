import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../viz/ChartCard';
import { TrendLine } from '../viz/TrendLine';
import { Funnel } from '../viz/Funnel';
import { CategoryBar } from '../viz/CategoryBar';
import { getDivisionMetrics } from '../../utils/analytics';
import {
  getPublicationTrend,
  getIpPipeline,
  getAvgImpactByDivision,
  getOutputPerScientist,
} from '../../utils/directorMetrics';

const PUB_RANGES = [
  { label: 'Past 3 years', years: 3 },
  { label: 'Past 5 years', years: 5 },
  { label: 'Past 10 years', years: 10 },
  { label: 'All', years: 0 },
] as const;

export function ResearchSection() {
  const { scientificOutputs, ipIntelligence, divisions, staff, projects, phDStudents, equipment } = useData();
  const navigate = useNavigate();
  const [pubYears, setPubYears] = useState(5);

  const trend = useMemo(
    () => getPublicationTrend(scientificOutputs, pubYears === 0 ? undefined : pubYears),
    [scientificOutputs, pubYears],
  );
  const pipeline = useMemo(() => getIpPipeline(ipIntelligence), [ipIntelligence]);
  const avgImpact = useMemo(() => getAvgImpactByDivision(scientificOutputs), [scientificOutputs]);
  const perScientist = useMemo(() => {
    const metrics = getDivisionMetrics({ divisions, staff, projects, phDStudents, scientificOutputs, equipment });
    return getOutputPerScientist(metrics);
  }, [divisions, staff, projects, phDStudents, scientificOutputs, equipment]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-text uppercase tracking-wide">Research Productivity</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Publications by year"
          action={
            <select
              value={pubYears}
              onChange={(e) => setPubYears(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
            >
              {PUB_RANGES.map((r) => (
                <option key={r.years} value={r.years}>
                  {r.label}
                </option>
              ))}
            </select>
          }
        >
          <TrendLine data={trend} yLabel="outputs" />
        </ChartCard>
        <ChartCard title="IP pipeline" subtitle="Filed → Published → Granted">
          <Funnel data={pipeline} />
        </ChartCard>
        <ChartCard title="Avg impact factor by division">
          <CategoryBar data={avgImpact} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
        <ChartCard title="Output per scientist by division">
          <CategoryBar data={perScientist} horizontal onSelect={() => navigate('/divisions')} />
        </ChartCard>
      </div>
    </section>
  );
}
