import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { supabase } from '../../utils/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';
import { summarizeDetails } from '../../lib/audit/mappers';
import type { AuditSource, UnifiedLog } from '../../lib/audit/mappers';
import { friendlyError } from '../../lib/errors';

type Source = 'all' | 'pms' | 'modules';

const ACTION_COLORS: Record<string, string> = {
  // PMS actions
  SUBMIT:                           'bg-iron-gall/10 text-iron-gall',
  ASSIGN_EVALUATORS:                'bg-iron-gall/10 text-iron-gall',
  AUTO_ADVANCE_EMPOWERED_COMMITTEE: 'bg-badge-warning-bg text-badge-warning-fg',
  REPORT_FINALIZED:                 'bg-archive-green/10 text-archive-green',
  DUTY_DAYS_RECORDED:               'bg-badge-warning-bg text-badge-warning-fg',
  MARKED_NOT_ASSESSED:              'bg-surface-hover text-text',
  NON_SUBMISSION_RECORDED:          'bg-badge-warning-bg text-badge-warning-fg',
  REPRESENTATION_SUBMITTED:         'bg-badge-warning-bg text-badge-warning-fg',
  REPRESENTATION_RESOLVED:          'bg-archive-green/10 text-archive-green',
  // Committees / helpdesk actions
  created:        'bg-iron-gall/10 text-iron-gall',
  updated:        'bg-badge-warning-bg text-badge-warning-fg',
  deleted:        'bg-badge-danger-bg text-badge-danger-fg',
  status_changed: 'bg-iron-gall/10 text-iron-gall',
};

const PER_PAGE = 25;

export default function AuditLog() {
  const { user } = useAuth();
  const [source, setSource] = useState<Source>('pms');
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const isAdmin = !!user && canAdmin(user);

  useEffect(() => {
    if (!isAdmin || !supabase) return;
    let active = true;
    const db = supabase;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const { data, error: err } = await db.rpc('list_combined_audit_logs', {
          p_source: source,
          p_limit: PER_PAGE,
          p_offset: page * PER_PAGE,
        });
        if (!active) return;
        if (err) throw err;
        const rows = (data as {
          source: AuditSource; id: string; action: string; entity_type: string;
          entity_id: string | null; actor_label: string | null;
          details: Record<string, unknown> | null; created_at: string; total_count: number;
        }[]) ?? [];
        setTotalCount(rows[0] ? Number(rows[0].total_count) : 0);
        setLogs(rows.map((r) => ({
          id: r.id,
          source: r.source,
          actorId: r.actor_label ?? '',
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id ?? '',
          details: r.details ?? {},
          createdAt: r.created_at,
        })));
      } catch (e) {
        if (!active) return;
        setError(friendlyError(e));
        setLogs([]);
        setTotalCount(0);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => { active = false; };
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
        <div role="alert" className="px-4 py-3 bg-badge-danger-bg border border-danger/30 text-badge-danger-fg text-sm rounded-xl">{error}</div>
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
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? 'bg-surface-hover text-text'}`}>
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
              disabled={(page + 1) * PER_PAGE >= totalCount || logs.length < PER_PAGE}
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
