import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { useProjectReports } from '../../contexts/ProjectReportsContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card, StatCard, Badge } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { PR_STATUS_LABELS, PR_STATUS_VARIANT } from '../../lib/projectReports/constants';
import type { ProjectReport, ProjectReportStatus } from '../../types/projectReport';

const AUTHOR_ROLES = ['Scientist', 'HOD', 'DivisionHead', 'Director'];

export default function ProjectReports() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reports, isLoading } = useProjectReports();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProjectReportStatus>('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reports.filter((r) => {
      const matches = r.projectName.toLowerCase().includes(q)
        || r.projectNo.toLowerCase().includes(q)
        || r.periodLabel.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matches && matchesStatus;
    });
  }, [reports, search, statusFilter]);

  const counts = useMemo(() => ({
    mine: user ? reports.filter((r) => r.submittedBy === user.id).length : 0,
    submitted: reports.filter((r) => r.status === 'SUBMITTED').length,
    revision: reports.filter((r) => r.status === 'REVISION_REQUESTED').length,
    reviewed: reports.filter((r) => r.status === 'REVIEWED').length,
  }), [reports, user]);

  const showCreate = user ? AUTHOR_ROLES.includes(user.activeRole) : false;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Progress Reports</h1>
          <p className="text-text-muted text-sm">Periodic project progress reports and reviews.</p>
        </div>
        {showCreate && (
          <Button onClick={() => navigate('/reports/new')}>
            <Plus className="w-4 h-4 mr-1" /> New Report
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Mine"               value={counts.mine} />
        <StatCard title="Awaiting Review"    value={counts.submitted} />
        <StatCard title="Revision Requested" value={counts.revision} />
        <StatCard title="Reviewed"           value={counts.reviewed} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project, number, period"
              className="w-full pl-10 pr-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ProjectReportStatus)}
            className="px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text"
          >
            <option value="ALL">All statuses</option>
            {(Object.keys(PR_STATUS_LABELS) as ProjectReportStatus[]).map((s) => (
              <option key={s} value={s}>{PR_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-text-muted">Loading…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No progress reports"
          description={reports.length === 0 ? 'No reports have been created yet.' : 'No reports match the current filters.'}
        />
      ) : (
        <DataTable<ProjectReport>
          data={filtered}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => navigate(`/reports/${r.id}`)}
          columns={[
            { header: 'Project',  cell: (r) => r.projectName },
            { header: 'No.',      cell: (r) => r.projectNo },
            { header: 'Period',   cell: (r) => r.periodLabel },
            { header: 'Status',   cell: (r) => <Badge variant={PR_STATUS_VARIANT[r.status]}>{PR_STATUS_LABELS[r.status]}</Badge> },
            { header: 'Due',      cell: (r) => r.dueDate ?? '—' },
            { header: 'Updated',  cell: (r) => new Date(r.updatedAt).toLocaleDateString('en-IN') },
          ]}
        />
      )}
    </div>
  );
}
