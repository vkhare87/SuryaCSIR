import { useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { ChartCard } from '../../components/viz/ChartCard';
import { CategoryDonut } from '../../components/viz/CategoryDonut';
import { CategoryBar } from '../../components/viz/CategoryBar';
import { HeatmapCalendar } from '../../components/viz/HeatmapCalendar';
import { useChartFilter } from '../../utils/useChartFilter';

export default function CommitteesAnalytics() {
  const { committees, meetings, actionItems } = useData();
  const { filter, toggleFilter } = useChartFilter();

  const statusMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of committees) {
      counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [committees]);

  const typeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of committees) {
      const k = c.committee_type === 'AdHoc' ? 'Ad Hoc' : c.committee_type;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [committees]);

  const meetingsPerCommittee = useMemo(() => {
    return committees
      .map((c) => ({
        label: c.name.length > 30 ? `${c.name.slice(0, 28)}…` : c.name,
        value: meetings.filter((m) => m.committee_id === c.id).length,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [committees, meetings]);

  const meetingCalendar = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of meetings) {
      const day = (m.meeting_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return Array.from(counts, ([day, value]) => ({ day, value }));
  }, [meetings]);

  const meetingRange = useMemo(() => {
    if (meetingCalendar.length === 0) {
      const now = new Date();
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    const sorted = [...meetingCalendar].sort((a, b) => a.day.localeCompare(b.day));
    return {
      from: sorted[0].day.slice(0, 4) + '-01-01',
      to: sorted[sorted.length - 1].day.slice(0, 4) + '-12-31',
    };
  }, [meetingCalendar]);

  const actionItemMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actionItems) {
      counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }, [actionItems]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Status (Active vs Inactive)">
        <CategoryDonut
          data={statusMix}
          onSelect={(d) => toggleFilter({ dim: 'status', value: d.label })}
          selected={filter?.dim === 'status' ? filter.value : null}
        />
      </ChartCard>

      <ChartCard title="Type mix">
        <CategoryDonut
          data={typeMix}
          onSelect={(d) =>
            toggleFilter({ dim: 'type', value: d.label === 'Ad Hoc' ? 'AdHoc' : d.label })
          }
          selected={filter?.dim === 'type' ? (filter.value === 'AdHoc' ? 'Ad Hoc' : filter.value) : null}
        />
      </ChartCard>

      <ChartCard title="Meetings per committee" subtitle="top 10" className="lg:col-span-2">
        <CategoryBar data={meetingsPerCommittee} horizontal height={320} />
      </ChartCard>

      <ChartCard title="Action item status">
        <CategoryDonut data={actionItemMix} />
      </ChartCard>

      <ChartCard title="Meeting calendar" subtitle="committee sessions by date" className="lg:col-span-2">
        <HeatmapCalendar data={meetingCalendar} from={meetingRange.from} to={meetingRange.to} height={220} />
      </ChartCard>
    </div>
  );
}
