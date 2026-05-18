import { useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Funnel } from '../components/viz/Funnel';
import { useChartFilter } from '../utils/useChartFilter';
import type { VacancyPost } from '../types';

const FUNNEL_ORDER: VacancyPost['status'][] = ['Received', 'Shortlisted', 'Interviewed', 'Selected', 'Rejected'];

export default function RecruitmentAnalytics() {
  const { vacancyAdvertisements, vacancyPosts } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const hiringFunnel = useMemo(() => {
    return FUNNEL_ORDER.map((s) => ({
      name: s,
      value: vacancyPosts.filter((p) => p.status === s).length,
    }));
  }, [vacancyPosts]);

  const vacancyStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vacancyAdvertisements) {
      counts.set(v.status, (counts.get(v.status) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [vacancyAdvertisements]);

  const applicantsPerVacancy = useMemo(() => {
    return vacancyAdvertisements
      .map((v) => ({
        label: v.id,
        value: vacancyPosts.filter((p) => p.vacancyId === v.id).length,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [vacancyAdvertisements, vacancyPosts]);

  const applicantStatusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of vacancyPosts) {
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [vacancyPosts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Hiring funnel" subtitle="applicant counts by stage">
        <Funnel data={hiringFunnel} />
      </ChartCard>

      <ChartCard title="Vacancy status">
        <CategoryDonut
          data={vacancyStatus}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Applicants per vacancy" subtitle="top 10">
        <CategoryBar
          data={applicantsPerVacancy}
          horizontal
          onSelect={(d) => toggleFilter({ dim: 'vacancy', value: d.label })}
          selected={filter?.dim === 'vacancy' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Applicant status mix">
        <CategoryDonut data={applicantStatusMix} />
      </ChartCard>
    </div>
  );
}
