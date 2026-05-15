import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAdmin } from '../../lib/pms/permissions';
import { supabase } from '../../utils/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';

type Source = 'pms' | 'modules';

interface UnifiedLog {
  id: string;
  source: Source;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  // PMS actions
  SUBMIT:                         'bg-blue-100 text-blue-700',
  ASSIGN_EVALUATORS:              'bg-purple-100 text-purple-700',
  AUTO_ADVANCE_CHAIRMAN_REVIEW:   'bg-orange-100 text-orange-700',
  CHAIRMAN_REVIEW_SUBMITTED:      'bg-amber-100 text-amber-700',
  REPORT_FINALIZED:               'bg-green-100 text-green-700',
  // Committees / helpdesk actions
  created:        'bg-blue-100 text-blue-700',
  updated:        'bg-amber-100 text-amber-700',
  deleted:        'bg-rose-100 text-rose-700',
  status_changed: 'bg-purple-100 text-purple-700',
};

const PER_PAGE = 25;

function mapPmsRow(r: Record<string, unknown>): UnifiedLog {
  return {
    id:         r.id as string,
    source:     'pms',
    actorId:    r.user_id as string,
    action:     r.action as string,
    entityType: r.entity_type as string,
    entityId:   r.entity_id as string,
    details:    (r.details as Record<string, unknown>) ?? {},
    createdAt:  r.created_at as string,
  };
}

function mapModuleRow(r: Record<string, unknown>): UnifiedLog {
  return {
    id:         r.id as string,
    source:     'modules',
    actorId:    r.actor_id as string,
    action:     r.action as string,
    entityType: r.entity_type as string,
    entityId:   r.entity_id as string,
    details:    (r.changes as Record<string, unknown>) ?? {},
    createdAt:  r.created_at as string,
  };
}

function summarizeDetails(log: UnifiedLog): string {
  const d = log.details;
  if (!d || Object.keys(d).length === 0) return '';
  if (log.source === 'pms') {
    return Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
  }
  // module audit_log packs changes as { old, new } for updates
  if ('new' in d && 'old' in d) {
    const newObj = d.new as Record<string, unknown>;
    const oldObj = d.old as Record<string, unknown>;
    const changed: string[] = [];
    for (const key of Object.keys(newObj)) {
      if (newObj[key] !== oldObj?.[key]) {
        changed.push(`${key}: ${String(oldObj?.[key])} → ${String(newObj[key])}`);
      }
    }
    return changed.slice(0, 3).join(' · ');
  }
  // For inserts/deletes show a few useful keys if present
  const preferred = ['name', 'subject', 'token', 'status', 'urgency', 'category', 'title'];
  const lines = preferred
    .filter((k) => d[k] !== undefined)
    .map((k) => `${k}: ${String(d[k])}`);
  return lines.slice(0, 3).join(' · ');
}

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
    setIsLoading(true);
    setError(null);
    const table = source === 'pms' ? 'pms_audit_logs' : 'audit_log';
    const mapper = source === 'pms' ? mapPmsRow : mapModuleRow;
    void supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setLogs([]);
        } else {
          setLogs(data ? data.map((r) => mapper(r as Record<string, unknown>)) : []);
        }
        setIsLoading(false);
      });
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
          onClick={() => setSource('pms')}
          className={`px-4 py-2 ${source === 'pms' ? 'bg-surface-hover text-text font-medium' : 'bg-surface text-text-muted hover:text-text'}`}
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
