import { supabase } from '../../utils/supabaseClient';

export type IngestStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'skipped';

export type StatusCounts = Record<IngestStatus, number>;

export interface MonitorRow {
  id: string;
  title: string;
  entityType: string;
  status: IngestStatus;
  attempts: number;
  error: string | null;
  pageCount: number | null;
  builtAt: string | null;
}

const ZERO: StatusCounts = {
  pending: 0, processing: 0, indexed: 0, failed: 0, skipped: 0,
};

export function countByStatus(rows: { ingest_status: IngestStatus }[]): StatusCounts {
  const counts: StatusCounts = { ...ZERO };
  for (const r of rows) counts[r.ingest_status] += 1;
  return counts;
}

export async function fetchMonitorRows(): Promise<MonitorRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, entity_type, ingest_status, ingest_error, ingest_attempts, doc_indexes(page_count, built_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const idx = Array.isArray(d.doc_indexes) ? d.doc_indexes[0] : d.doc_indexes;
    return {
      id: d.id,
      title: d.title,
      entityType: d.entity_type,
      status: d.ingest_status as IngestStatus,
      attempts: d.ingest_attempts ?? 0,
      error: d.ingest_error ?? null,
      pageCount: idx?.page_count ?? null,
      builtAt: idx?.built_at ?? null,
    };
  });
}

export interface LatencyPoint {
  createdAt: string;
  latencyMs: number;
}

/** Recent query latencies, oldest first (admins see all rows via query_log RLS). */
export async function fetchLatencies(): Promise<LatencyPoint[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('query_log')
    .select('created_at, latency_ms')
    .not('latency_ms', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((d) => ({ createdAt: d.created_at as string, latencyMs: d.latency_ms as number }))
    .reverse();
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export type RouteMode = 'structured' | 'document' | 'hybrid';

export interface DownvotedQuery {
  id: string;
  question: string;
  mode: RouteMode;
  createdAt: string;
  labeled: boolean;
}

/** Downvoted queries awaiting an admin route label (feeds router few-shots). */
export async function fetchDownvoted(): Promise<DownvotedQuery[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('query_log')
    .select('id, question, mode, created_at, route_labels(query_id)')
    .eq('feedback', -1)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const label = Array.isArray(d.route_labels) ? d.route_labels[0] : d.route_labels;
    return {
      id: d.id,
      question: d.question,
      mode: d.mode as RouteMode,
      createdAt: d.created_at,
      labeled: Boolean(label),
    };
  });
}

export async function labelRoute(queryId: string, question: string, route: RouteMode): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('route_labels')
    .insert({ query_id: queryId, question, correct_route: route });
  if (error) throw error;
}

export async function requeueDocument(docId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('rag_requeue_document', { p_doc_id: docId });
  if (error) throw error;
}

export async function requeueAll(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('rag_requeue_all');
  if (error) throw error;
}
