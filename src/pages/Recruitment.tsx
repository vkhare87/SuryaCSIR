import { useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { StatCard, Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import {
  UserPlus,
  Search,
  Filter,
  ChevronRight,
  ClipboardList,
  Users2,
  FileText,
  Megaphone,
} from 'lucide-react';
import type { VacancyPost } from '../types';

const STATUS_TO_VARIANT: Record<VacancyPost['status'], 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  Received:    'info',
  Shortlisted: 'warning',
  Interviewed: 'warning',
  Selected:    'success',
  Rejected:    'danger',
};

export default function Recruitment() {
  const { vacancyAdvertisements, vacancyPosts, isLoading } = useData();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(['HRAdmin', 'SystemAdmin', 'MasterAdmin']);
  const [searchTerm, setSearchTerm] = useState('');

  // Per-vacancy applicant count and shortlisted/interviewed split.
  const stats = useMemo(() => {
    const byVacancy = new Map<string, VacancyPost[]>();
    for (const p of vacancyPosts) {
      const list = byVacancy.get(p.vacancyId) ?? [];
      list.push(p);
      byVacancy.set(p.vacancyId, list);
    }
    return byVacancy;
  }, [vacancyPosts]);

  const openVacancies = vacancyAdvertisements.filter(v => v.status === 'Open');
  const activeApplicants = vacancyPosts.filter(p =>
    p.status !== 'Rejected' && openVacancies.some(v => v.id === p.vacancyId)
  );

  const filtered = vacancyAdvertisements.filter(v => {
    const q = searchTerm.toLowerCase();
    return !q ||
      v.title.toLowerCase().includes(q) ||
      v.designation.toLowerCase().includes(q) ||
      v.division.toLowerCase().includes(q);
  });

  // Onboarding pipeline = recently Selected applicants.
  const pipeline = vacancyPosts.filter(p => p.status === 'Selected').slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[500] text-text font-serif">Recruitment Portal</h1>
          <p className="text-text-muted mt-1">Manage institutional vacancies and talent acquisition</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button className="bg-[#c96442] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#b5593b] transition-colors flex items-center gap-2">
              <UserPlus size={16} />
              New Vacancy
            </button>
          </div>
        )}
      </div>

      {!isLoading && vacancyAdvertisements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No active vacancies"
          description={canManage ? 'Create a vacancy advertisement to start recruiting.' : 'There are no open positions at this time.'}
          action={canManage ? { label: 'Upload via Data Management', to: '/data' } : undefined}
        />
      ) : (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Open Positions"  value={openVacancies.length}                icon={<Users2 />} />
        <StatCard title="Total Applicants" value={vacancyPosts.length}                icon={<ClipboardList />} />
        <StatCard title="Active Applicants" value={activeApplicants.length}           icon={<FileText />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-surface-hover">
            <h3 className="font-bold text-text">Vacancies</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-3.5 h-3.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="pl-8 pr-3 py-1.5 bg-surface border border-border rounded-md text-xs outline-none focus:ring-1 focus:ring-[#3898ec]"
                />
              </div>
              <button className="p-1.5 border border-border rounded-md hover:bg-surface text-text-muted">
                <Filter size={14} />
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">No vacancies match the current filter.</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(v => {
                const applicants = stats.get(v.id) ?? [];
                return (
                  <div
                    key={v.id}
                    className="p-4 hover:bg-surface-hover transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-text truncate" title={v.title}>{v.title}</div>
                      <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[#c96442] font-mono">{v.id}</span>
                        <span>•</span>
                        <span>{v.designation}</span>
                        <span>•</span>
                        <span>{v.division}</span>
                        <span>•</span>
                        <span>{v.numberOfPositions} position{v.numberOfPositions === 1 ? '' : 's'}</span>
                      </div>
                      <div className="text-[10px] text-text-muted mt-1">
                        Deadline: {v.applicationDeadline}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <Badge
                        variant={v.status === 'Open' ? 'success' : v.status === 'Closed' ? 'neutral' : 'warning'}
                      >
                        {v.status}
                      </Badge>
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-text">{applicants.length}</div>
                        <div className="text-[10px] text-text-muted uppercase">Applicants</div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-text-muted group-hover:text-[#c96442] transition-colors translate-x-0 group-hover:translate-x-1"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-bold text-text mb-4">Onboarding Pipeline</h3>
          {pipeline.length === 0 ? (
            <p className="text-xs text-text-muted">No candidates selected yet.</p>
          ) : (
            <div className="space-y-4">
              {pipeline.map(p => {
                const vacancy = vacancyAdvertisements.find(v => v.id === p.vacancyId);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-hover">
                    <div className="w-10 h-10 rounded-full bg-[#c96442]/10 flex items-center justify-center font-bold text-[#c96442] text-xs">
                      {p.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text truncate" title={p.candidateName}>{p.candidateName}</p>
                      <p className="text-[10px] text-text-muted uppercase truncate">
                        {vacancy?.designation ?? 'Position'}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <Badge variant={STATUS_TO_VARIANT[p.status]} className="text-[10px]">{p.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="w-full mt-6 py-2 border border-dashed border-border rounded-lg text-xs font-medium text-text-muted hover:text-[#c96442] hover:border-[#c96442] transition-all">
            View All Candidates
          </button>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
