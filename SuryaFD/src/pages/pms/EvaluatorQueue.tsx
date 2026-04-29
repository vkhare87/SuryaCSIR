import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { StatusBadge } from '../../components/pms/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';

const EVAL_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PENDING:     { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'Pending' },
  IN_PROGRESS: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Progress' },
  COMPLETED:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Completed' },
};

export default function EvaluatorQueue() {
  const { user } = useAuth();
  const { evaluations, reports, isLoading } = usePMS();
  const navigate = useNavigate();

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

  const myEvals = evaluations.filter(e => e.evaluatorId === user.id);
  const pendingCount = myEvals.filter(e => e.status !== 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">My Evaluation Queue</h1>
      <p className="text-sm text-text-muted">
        {pendingCount} pending evaluation{pendingCount !== 1 ? 's' : ''}
      </p>

      {myEvals.length === 0 ? (
        <div className="py-16 text-center text-text-muted border border-border rounded-2xl">
          No reports assigned to you for evaluation.
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {myEvals.map(ev => {
            const report = reports.find(r => r.id === ev.reportId);
            const statusStyle = EVAL_STATUS_COLORS[ev.status] ?? EVAL_STATUS_COLORS.PENDING;
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between px-5 py-4 bg-surface hover:bg-surface-hover transition-colors"
              >
                <div className="space-y-1">
                  <p className="font-medium text-text text-sm">
                    {report?.cycle?.name ?? ev.reportId.slice(0, 8) + '…'}
                  </p>
                  <p className="text-xs text-text-muted font-mono">
                    Report: {ev.reportId.slice(0, 8)}…
                  </p>
                  {report && <StatusBadge status={report.status} />}
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx(
                    'text-xs font-medium px-2.5 py-1 rounded-full',
                    statusStyle.bg, statusStyle.text
                  )}>
                    {statusStyle.label}
                  </span>
                  <Button
                    size="sm"
                    variant={ev.status === 'COMPLETED' ? 'ghost' : 'primary'}
                    onClick={() => navigate(`/pms/evaluate/${ev.id}`)}
                  >
                    {ev.status === 'COMPLETED' ? 'View' : ev.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
