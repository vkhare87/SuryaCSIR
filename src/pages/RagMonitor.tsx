import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScanText } from 'lucide-react';
import { Card, Badge } from '../components/ui/Cards';
import { EmptyState } from '../components/ui/EmptyState';
import { fetchMonitorRows, requeueDocument, countByStatus } from '../lib/rag/monitor';
import type { MonitorRow, IngestStatus } from '../lib/rag/monitor';

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
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchMonitorRows());
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
          <p className="text-sm text-text-muted">Document indexing queue and pipeline health.</p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="p-4">
            <div className="text-2xl font-semibold text-text">{counts[s]}</div>
            <div className="text-sm capitalize text-text-muted">{s}</div>
          </Card>
        ))}
      </div>

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
