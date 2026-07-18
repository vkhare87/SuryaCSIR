import { useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { drivesByStage, setDriveStage, DRIVE_STAGES, type DriveStage } from '../lib/recruitment/drives';
import { ChartCard } from '../components/viz/ChartCard';
import { CategoryDonut } from '../components/viz/CategoryDonut';
import { CategoryBar } from '../components/viz/CategoryBar';
import { Funnel } from '../components/viz/Funnel';
import { useChartFilter } from '../utils/useChartFilter';
import type { VacancyPost } from '../types';

const FUNNEL_ORDER: VacancyPost['status'][] = ['Received', 'Shortlisted', 'Interviewed', 'Selected', 'Rejected'];

export default function RecruitmentAnalytics() {
  const { vacancyAdvertisements, vacancyPosts, refreshData } = useData();
  const { hasPermission } = useAuth();
  const canManageDrives = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const [stageError, setStageError] = useState('');

  const driveFunnel = useMemo(() => drivesByStage(vacancyAdvertisements), [vacancyAdvertisements]);
  const openDrives = useMemo(
    () => vacancyAdvertisements.filter(a => a.driveStage !== 'Closed'),
    [vacancyAdvertisements],
  );
  // Days open since the advertisement was issued. Not per-stage timing — the
  // schema only tracks issue date + current stage, no stage-transition log —
  // but still surfaces which open drives have gone stale.
  const agingDrives = useMemo(() => {
    const now = new Date().getTime();
    return openDrives
      .map(a => ({ ...a, daysOpen: a.createdAt ? Math.floor((now - Date.parse(a.createdAt)) / 86400000) : null }))
      .filter(a => a.daysOpen !== null)
      .sort((a, b) => (b.daysOpen ?? 0) - (a.daysOpen ?? 0));
  }, [openDrives]);

  async function onStageChange(id: string, stage: DriveStage) {
    setStageError('');
    const res = await setDriveStage(id, stage);
    if (!res.ok) { setStageError(res.error); return; }
    await refreshData();
  }
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

      <ChartCard title="Vacancy pipeline aging" subtitle="open drives, oldest first" className="lg:col-span-2">
        {agingDrives.length === 0 ? (
          <p className="text-sm text-text-muted">No open drives with a recorded issue date.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="py-1 pr-2">Vacancy</th>
                <th className="py-1 pr-2">Stage</th>
                <th className="py-1 text-right">Days Open</th>
              </tr>
            </thead>
            <tbody>
              {agingDrives.map(a => (
                <tr key={a.id} className="border-t border-border text-text">
                  <td className="py-1.5 pr-2 truncate max-w-[240px]">{a.title}</td>
                  <td className="py-1.5 pr-2 text-text-muted">{a.driveStage}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      (a.daysOpen ?? 0) > 60 ? 'bg-[#fde2e2] text-[#991b1b]' : 'bg-surface-hover text-text-muted'
                    }`}>
                      {a.daysOpen}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      <ChartCard title="Drive progress" subtitle="drives per stage — permanent vs project staff" className="lg:col-span-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="py-1 pr-2">Stage</th>
              <th className="py-1 pr-2">Permanent</th>
              <th className="py-1">Project</th>
            </tr>
          </thead>
          <tbody>
            {driveFunnel.map(r => (
              <tr key={r.stage} className="border-t border-border text-text">
                <td className="py-1.5 pr-2">{r.stage}</td>
                <td className="py-1.5 pr-2">{r.permanent}</td>
                <td className="py-1.5">{r.project}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {canManageDrives && (
        <ChartCard title="Manage drive stages" subtitle="admin — advance open drives" className="lg:col-span-2">
          {stageError && <p className="text-sm text-danger mb-2">{stageError}</p>}
          {openDrives.length === 0 ? (
            <p className="text-sm text-text-muted">No open drives.</p>
          ) : (
            <ul className="divide-y divide-border">
              {openDrives.map(a => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1 min-w-40 text-sm text-text">{a.title}</span>
                  <span className="text-xs text-text-muted">{a.staffCategory}</span>
                  <select
                    value={a.driveStage}
                    onChange={e => void onStageChange(a.id, e.target.value as DriveStage)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                  >
                    {DRIVE_STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      )}
    </div>
  );
}
