import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin } from '../../lib/pms/permissions';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';

export default function PMSIndex() {
  const { user, role } = useAuth();
  const { cycles, reports, collegiums, evaluations, isLoading } = usePMS();
  const navigate = useNavigate();

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (canAdmin(user)) {
    const submittedCount = reports.filter(r => r.status === 'SUBMITTED').length;
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif font-medium text-text">Performance Management</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/pms/cycles" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">Appraisal Cycles</h2>
            <p className="text-sm text-text-muted">{cycles.length} cycle{cycles.length !== 1 ? 's' : ''} total</p>
          </Link>
          <Link to="/pms/collegiums" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">Collegiums</h2>
            <p className="text-sm text-text-muted">Manage review panels</p>
          </Link>
          <Link to="/pms/assign" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">Assign Evaluators</h2>
            <p className="text-sm text-text-muted">{submittedCount} report{submittedCount !== 1 ? 's' : ''} awaiting assignment</p>
          </Link>
          <Link to="/pms/audit" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">Audit Log</h2>
            <p className="text-sm text-text-muted">View all system events</p>
          </Link>
        </div>
      </div>
    );
  }

  if (role === 'EmpoweredCommittee') {
    const committeeCount = reports.filter(r => r.status === 'EMPOWERED_COMMITTEE_REVIEW').length;
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif font-medium text-text">Performance Management</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/pms/committee" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">Committee Decision Queue</h2>
            <p className="text-sm text-text-muted">{committeeCount} report{committeeCount !== 1 ? 's' : ''} awaiting decision</p>
          </Link>
          <Link to="/pms/reports" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">All Reports</h2>
            <p className="text-sm text-text-muted">Browse all submitted reports</p>
          </Link>
        </div>
      </div>
    );
  }

  const allMembers = collegiums.flatMap(c => c.members ?? []);
  const isChairman = allMembers.some(m => m.userId === user.id && m.role === 'CHAIRMAN');
  const isCollegiumMember = allMembers.some(m => m.userId === user.id);

  if (isCollegiumMember) {
    const pendingEvalCount = evaluations.filter(e => e.evaluatorId === user.id && e.status !== 'COMPLETED').length;
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif font-medium text-text">Performance Management</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/pms/evaluate" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
            <h2 className="font-semibold text-text mb-1">My Evaluation Queue</h2>
            <p className="text-sm text-text-muted">{pendingEvalCount} pending evaluation{pendingEvalCount !== 1 ? 's' : ''}</p>
          </Link>
          {isChairman && (
            <Link to="/pms/chairman" className="block p-6 bg-surface border border-border rounded-2xl hover:border-[#c96442] transition-colors">
              <h2 className="font-semibold text-text mb-1">Chairman Review Queue</h2>
              <p className="text-sm text-text-muted">Recommend score ranges for the committee</p>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const openCycle = cycles.find(c => c.status === 'OPEN');
  const myReports = reports.filter(r => r.scientistId === user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">My Appraisal Reports</h1>
        {openCycle && (
          <Button onClick={() => navigate('/pms/reports/new')}>New Report</Button>
        )}
      </div>

      {myReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <p>
            No reports yet.
            {openCycle
              ? ' Click "New Report" to start.'
              : ' No open appraisal cycle currently.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {myReports.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
            >
              <div>
                <p className="font-medium text-text text-sm">{r.cycle?.name ?? r.cycleId}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {r.periodFrom && r.periodTo
                    ? `${r.periodFrom} – ${r.periodTo}`
                    : 'Period not set'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(
                      r.status === 'DRAFT'
                        ? `/pms/reports/${r.id}/edit`
                        : `/pms/reports/${r.id}`
                    )
                  }
                >
                  {r.status === 'DRAFT' ? 'Edit' : 'View'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
