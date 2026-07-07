import { supabase } from '../../utils/supabaseClient';

export type IngestStatus = 'pending' | 'processing' | 'indexed' | 'failed' | 'skipped';

export type StatusCounts = Record<IngestStatus, number>;

export interface MonitorRow {
  id: string;
  title: string;
  entityType: string;
  status: IngestStatus;
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
    .select('id, title, entity_type, ingest_status, ingest_error, doc_indexes(page_count, built_at)')
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
      error: d.ingest_error ?? null,
      pageCount: idx?.page_count ?? null,
      builtAt: idx?.built_at ?? null,
    };
  });
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
