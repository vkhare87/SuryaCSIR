import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { canAdmin } from '../../lib/pms/permissions';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';

export default function Reports() {
  const { user } = useAuth();
  const { cycles, reports, isLoading } = usePMS();
  const navigate = useNavigate();
  const isAdmin = user ? canAdmin(user) : false;

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const openCycle = cycles.find(c => c.status === 'OPEN');
  const displayReports = isAdmin ? reports : reports.filter(r => r.scientistId === user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-text">
          {isAdmin ? 'All Reports' : 'My Reports'}
        </h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/pms/assign')}>
              Assign Evaluators
            </Button>
          )}
          {!isAdmin && openCycle && (
            <Button onClick={() => navigate('/pms/reports/new')}>New Report</Button>
          )}
        </div>
      </div>

      {displayReports.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <p>
            {isAdmin
              ? 'No reports submitted yet.'
              : openCycle
              ? 'No reports yet. Click "New Report" to start.'
              : 'No open appraisal cycle currently.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {displayReports.map(r => (
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
                {isAdmin && (
                  <p className="text-xs text-text-muted/60 font-mono mt-0.5">
                    Scientist: {r.scientistId.slice(0, 8)}…
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {isAdmin && r.status === 'SUBMITTED' && (
                  <Button size="sm" variant="secondary" onClick={() => navigate('/pms/assign')}>
                    Assign
                  </Button>
                )}
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
