import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { supabase } from '../../utils/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';
import { mapPmsRow, mapModuleRow, summarizeDetails } from '../../lib/audit/mappers';
import type { UnifiedLog } from '../../lib/audit/mappers';

type Source = 'all' | 'pms' | 'modules';

const ACTION_COLORS: Record<string, string> = {
  // PMS actions
  SUBMIT:                           'bg-blue-100 text-blue-700',
  ASSIGN_EVALUATORS:                'bg-purple-100 text-purple-700',
  AUTO_ADVANCE_EMPOWERED_COMMITTEE: 'bg-orange-100 text-orange-700',
  REPORT_FINALIZED:                 'bg-green-100 text-green-700',
  DUTY_DAYS_RECORDED:               'bg-amber-100 text-amber-700',
  MARKED_NOT_ASSESSED:              'bg-gray-100 text-gray-700',
  NON_SUBMISSION_RECORDED:          'bg-amber-100 text-amber-700',
  REPRESENTATION_SUBMITTED:         'bg-orange-100 text-orange-700',
  REPRESENTATION_RESOLVED:          'bg-green-100 text-green-700',
  // Committees / helpdesk actions
  created:        'bg-blue-100 text-blue-700',
  updated:        'bg-amber-100 text-amber-700',
  deleted:        'bg-rose-100 text-rose-700',
  status_changed: 'bg-purple-100 text-purple-700',
};

const PER_PAGE = 25;

export default function AuditLog() {
  const { user } = useAuth();
  const [source, setSource] = useState<Source>('pms');
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const isAdmin = !!user && canAdmin(user);

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    const db = supabase;
    setIsLoading(true);
    setError(null);

    const fetchOne = (table: string, mapper: (r: Record<string, unknown>) => UnifiedLog) =>
      db.from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)
        .then(({ data, error: err }) => {
          if (err) throw new Error(err.message);
          return (data ?? []).map((r) => mapper(r as Record<string, unknown>));
        });

    const wanted =
      source === 'pms' ? [fetchOne('pms_audit_logs', mapPmsRow)]
      : source === 'modules' ? [fetchOne('audit_log', mapModuleRow)]
      : [fetchOne('pms_audit_logs', mapPmsRow), fetchOne('audit_log', mapModuleRow)];

    void Promise.all(wanted)
      .then((lists) => {
        // 'all': merged client-side by time; each source pages independently so a
        // page shows the newest PER_PAGE of the union of both pages.
        const merged = lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setLogs(source === 'all' ? merged.slice(0, PER_PAGE) : merged);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLogs([]);
      })
      .finally(() => setIsLoading(false));
  }, [isAdmin, page, source]);

  // Reset page when switching sources
  useEffect(() => {
    setPage(0);
  }, [source]);

  if (!user || !isAdmin) return <Navigate to="/pms" replace />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-text">Audit Log</h1>
      <p className="text-sm text-text-muted">All state transitions and administrative actions</p>

      <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
        <button
          onClick={() => setSource('all')}
          className={`px-4 py-2 ${source === 'all' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
        >
          All
        </button>
        <button
          onClick={() => setSource('pms')}
          className={`px-4 py-2 border-l border-border ${source === 'pms' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
        >
          PMS
        </button>
        <button
          onClick={() => setSource('modules')}
          className={`px-4 py-2 border-l border-border ${source === 'modules' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
        >
          Committees &amp; Helpdesk
        </button>
      </div>

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
            ) : logs.map((log) => {
              const summary = summarizeDetails(log);
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 bg-surface hover:bg-surface-hover transition-colors">
                  <div className="shrink-0 mt-0.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted font-mono truncate">
                      {source === 'all' && (
                        <span className="mr-2 px-1.5 py-0.5 rounded bg-surface-hover text-text-muted not-italic">
                          {log.source === 'pms' ? 'PMS' : 'Modules'}
                        </span>
                      )}
                      {log.entityType} · {log.entityId.slice(0, 8)}…
                    </p>
                    {summary && (
                      <p className="text-xs text-text-muted mt-0.5 truncate">{summary}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-text-muted font-mono">{log.actorId.slice(0, 8)}…</p>
                    <p className="text-xs text-text-muted/60 mt-0.5">
                      {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm text-text-muted disabled:opacity-30 hover:text-text transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-text-muted">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
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
