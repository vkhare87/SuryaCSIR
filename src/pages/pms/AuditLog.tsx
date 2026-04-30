import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { supabase } from '../../utils/supabaseClient';
import type { PMSAuditLog } from '../../types/pms';
import { Skeleton } from '../../components/ui/Skeleton';

const ACTION_COLORS: Record<string, string> = {
  SUBMIT:                         'bg-blue-100 text-blue-700',
  ASSIGN_EVALUATORS:              'bg-purple-100 text-purple-700',
  AUTO_ADVANCE_CHAIRMAN_REVIEW:   'bg-orange-100 text-orange-700',
  CHAIRMAN_REVIEW_SUBMITTED:      'bg-amber-100 text-amber-700',
  REPORT_FINALIZED:               'bg-green-100 text-green-700',
};

const PER_PAGE = 25;

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<PMSAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  if (!user || !canAdmin(user)) return <Navigate to="/pms" replace />;

  useEffect(() => {
    if (!supabase) return;
    setIsLoading(true);
    setError(null);
    void supabase
      .from('pms_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); }
        else {
          setLogs(
            data ? data.map(r => ({
              id:         r.id as string,
              userId:     r.user_id as string,
              action:     r.action as string,
              entityType: r.entity_type as string,
              entityId:   r.entity_id as string,
              details:    (r.details as Record<string, unknown>) ?? {},
              createdAt:  r.created_at as string,
            })) : []
          );
        }
        setIsLoading(false);
      });
  }, [page]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Audit Log</h1>
      <p className="text-sm text-text-muted">All PMS state transitions and administrative actions</p>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{error}</div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-sm">No audit log entries.</div>
            ) : logs.map(log => (
              <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 bg-surface hover:bg-surface-hover transition-colors">
                <div className="shrink-0 mt-0.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-muted font-mono truncate">
                    {log.entityType} · {log.entityId.slice(0, 8)}…
                  </p>
                  {Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {Object.entries(log.details).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-text-muted font-mono">{log.userId.slice(0, 8)}…</p>
                  <p className="text-xs text-text-muted/60 mt-0.5">
                    {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm text-text-muted disabled:opacity-30 hover:text-text transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-text-muted">Page {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={logs.length < PER_PAGE}
              className="text-sm text-text-muted disabled:opacity-30 hover:text-text transition-colors"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
