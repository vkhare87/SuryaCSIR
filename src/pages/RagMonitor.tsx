import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScanText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import {
  fetchMonitorRows, fetchLatencies, fetchDownvoted, fetchQueryLogRows, labelRoute,
  requeueDocument, requeueAll, countByStatus, percentile, computeTraceability, toCsv,
} from '../lib/rag/monitor';
import type { MonitorRow, IngestStatus, LatencyPoint, DownvotedQuery, RouteMode, QueryLogRow } from '../lib/rag/monitor';

const ROUTES: RouteMode[] = ['structured', 'document', 'hybrid'];

const STATUS_ORDER: IngestStatus[] = ['pending', 'processing', 'indexed', 'failed', 'skipped'];

const STATUS_VARIANT: Record<IngestStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'info',
  processing: 'warning',
  indexed: 'success',
  failed: 'danger',
  skipped: 'neutral',
};

export default function RagMonitor() {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [latencies, setLatencies] = useState<LatencyPoint[]>([]);
  const [downvoted, setDownvoted] = useState<DownvotedQuery[]>([]);
  const [queryRows, setQueryRows] = useState<QueryLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchMonitorRows());
      setLatencies(await fetchLatencies());
      setDownvoted(await fetchDownvoted());
      setQueryRows(await fetchQueryLogRows());
    } catch (e) {
      console.error('Failed to load RAG monitor', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(
    () => countByStatus(rows.map((r) => ({ ingest_status: r.status }))),
    [rows],
  );

  const latencyStats = useMemo(() => {
    const values = latencies.map((l) => l.latencyMs);
    return { p50: percentile(values, 50), p90: percentile(values, 90), p99: percentile(values, 99) };
  }, [latencies]);

  const traceability = useMemo(() => computeTraceability(queryRows), [queryRows]);

  function exportCsv() {
    const csv = toCsv(
      ['created_at', 'question', 'mode', 'answer', 'citations', 'feedback', 'latency_ms'],
      queryRows.map((r) => [
        r.createdAt, r.question, r.mode, r.answer,
        r.citations?.length ?? 0, r.feedback, r.latencyMs,
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function label(q: DownvotedQuery, route: RouteMode) {
    try {
      await labelRoute(q.id, q.question, route);
      setDownvoted((prev) => prev.map((d) => (d.id === q.id ? { ...d, labeled: true } : d)));
    } catch (e) {
      console.error('Route label failed', e);
    }
  }

  async function requeue(id: string) {
    try {
      await requeueDocument(id);
      await load();
    } catch (e) {
      console.error('Requeue failed', e);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">RAG Ingestion</h1>
          <p className="text-sm text-text-muted">
            Document indexing queue and pipeline health.
            <span className="ml-2">
              M3 traceability {traceability
                ? `${(traceability.share * 100).toFixed(1)}% (${traceability.cited}/${traceability.total})`
                : '—'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
          >
            Export CSV
          </button>
          <button
            onClick={async () => { await requeueAll(); await load(); }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
          >
            Re-index all
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="p-4">
            <div className="text-2xl font-semibold text-text">{counts[s]}</div>
            <div className="text-sm capitalize text-text-muted">{s}</div>
          </Card>
        ))}
      </div>

      {latencies.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-text">Query latency (last {latencies.length})</div>
            <div className="flex gap-4 text-sm text-text-muted">
              <span>p50 {latencyStats.p50 != null ? `${latencyStats.p50} ms` : '—'}</span>
              <span>p90 {latencyStats.p90 != null ? `${latencyStats.p90} ms` : '—'}</span>
              <span>p99 {latencyStats.p99 != null ? `${latencyStats.p99} ms` : '—'}</span>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latencies}>
                <XAxis dataKey="createdAt" hide />
                <YAxis width={48} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${v} ms`, 'latency']}
                  labelFormatter={(l) => new Date(l as string).toLocaleString()}
                />
                <Line type="monotone" dataKey="latencyMs" dot={false} stroke="#3b82f6" strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {downvoted.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <div className="text-sm font-medium text-text">Downvoted queries</div>
            <div className="text-xs text-text-muted">
              Label the correct route — labels become router few-shots and eval cases.
            </div>
          </div>
          <ul className="space-y-2">
            {downvoted.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-text" title={q.question}>
                  {q.question}
                  <span className="ml-2 text-xs text-text-muted">(routed {q.mode})</span>
                </span>
                {q.labeled ? (
                  <span className="text-xs text-text-muted">Labeled</span>
                ) : (
                  <span className="flex gap-1">
                    {ROUTES.map((r) => (
                      <button
                        key={r}
                        onClick={() => void label(q, r)}
                        className="rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text"
                      >
                        {r}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <div className="text-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScanText}
          title="No documents"
          description="Nothing in the ingestion queue yet."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-text-muted">
              <tr>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Entity</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Pages</th>
                <th className="p-3 font-medium">Attempts</th>
                <th className="p-3 font-medium">Error</th>
                <th className="p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 text-text">{r.title}</td>
                  <td className="p-3 text-text-muted">{r.entityType}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="p-3 text-text-muted">{r.pageCount ?? '—'}</td>
                  <td className="p-3 text-text-muted">{r.attempts > 0 ? r.attempts : '—'}</td>
                  <td className="p-3 text-text-muted">{r.error ?? '—'}</td>
                  <td className="p-3">
                    {(r.status === 'failed' || r.status === 'indexed') && (
                      <button
                        onClick={() => void requeue(r.id)}
                        className="text-text-muted underline hover:text-text"
                      >
                        {r.status === 'failed' ? 'Retry' : 'Re-index'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
