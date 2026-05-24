import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryBar } from '../components/viz/CategoryBar';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { Histogram } from '../components/viz/Histogram';
import { TrendLine } from '../components/viz/TrendLine';
import {
  getTenureYears,
  getAvgTenure,
  getContractRunway,
  getHeadcountByProject,
  getHeadcountByPI,
  getDesignationMix,
  getHiresByCycle,
  getJoiningByYear,
  getDivisionMix,
} from '../utils/projectStaffMetrics';

export type FacetDim = 'project' | 'pi' | 'designation' | 'cycle';
export interface Facet {
  dim: FacetDim;
  value: string;
}

interface ProjectStaffAnalyticsProps {
  onFacet: (facet: Facet) => void;
  onDivision: (code: string) => void;
}

export function ProjectStaffAnalytics({ onFacet, onDivision }: ProjectStaffAnalyticsProps) {
  const { projectStaff } = useData();

  const tenure = useMemo(() => getTenureYears(projectStaff), [projectStaff]);
  const avgTenure = useMemo(() => getAvgTenure(projectStaff), [projectStaff]);
  const runway = useMemo(() => getContractRunway(projectStaff), [projectStaff]);
  const byProject = useMemo(() => getHeadcountByProject(projectStaff), [projectStaff]);
  const byPI = useMemo(() => getHeadcountByPI(projectStaff), [projectStaff]);
  const designation = useMemo(() => getDesignationMix(projectStaff), [projectStaff]);
  const byCycle = useMemo(() => getHiresByCycle(projectStaff), [projectStaff]);
  const joining = useMemo(() => getJoiningByYear(projectStaff), [projectStaff]);
  const division = useMemo(() => getDivisionMix(projectStaff), [projectStaff]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Service tenure" subtitle={`years since joining · avg ${avgTenure}y`}>
        <Histogram values={tenure} xLabel="years" yLabel="staff" />
      </ChartCard>
      <ChartCard title="Contract runway" subtitle="months to project-duration end">
        <CategoryBar data={runway} />
      </ChartCard>
      <ChartCard title="Headcount by project" subtitle="click to filter the list">
        <CategoryBar data={byProject} onSelect={(d) => onFacet({ dim: 'project', value: d.label })} />
      </ChartCard>
      <ChartCard title="Headcount by PI" subtitle="click to filter the list">
        <CategoryBar data={byPI} horizontal onSelect={(d) => onFacet({ dim: 'pi', value: d.label })} />
      </ChartCard>
      <ChartCard title="Designation mix" subtitle="click to filter the list">
        <CategoryDonut data={designation} onSelect={(d) => onFacet({ dim: 'designation', value: d.label })} />
      </ChartCard>
      <ChartCard title="Hires by recruitment cycle" subtitle="click to filter the list">
        <CategoryBar data={byCycle} onSelect={(d) => onFacet({ dim: 'cycle', value: d.label })} />
      </ChartCard>
      <ChartCard title="Joining trend by year">
        <TrendLine data={joining} yLabel="hires" />
      </ChartCard>
      <ChartCard title="Division distribution" subtitle="click to filter the list">
        <CategoryDonut data={division} onSelect={(d) => onDivision(d.label)} />
      </ChartCard>
    </div>
  );
}
