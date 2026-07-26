import type { SupabaseClient } from '@supabase/supabase-js';
import type { HarvestedImport } from '../../types';

const mapRow = (row: any): HarvestedImport => ({
  id: row.id,
  file_name: row.file_name,
  source: row.source,
  source_identifier: row.source_identifier,
  division_code: row.division_code,
  storage_bucket: row.storage_bucket,
  storage_path: row.storage_path,
  file_size: row.file_size,
  content_hash: row.content_hash,
  status: row.status,
  landed_at: row.landed_at,
  reviewed_by: row.reviewed_by,
  reviewed_at: row.reviewed_at,
});

/** Pending harvested files awaiting review, newest first — the "Harvested"
 * tab on Data Management. Landed by the ingest/ worker (folder watch / mail-in). */
export async function listPendingHarvested(supabase: SupabaseClient): Promise<HarvestedImport[]> {
  const { data, error } = await supabase
    .from('harvested_imports')
    .select('*')
    .eq('status', 'pending')
    .order('landed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Downloads a harvested file from Storage and wraps it as a browser File,
 * so it can feed straight into the existing ImportFlow confirm/preview steps. */
export async function downloadHarvestedFile(supabase: SupabaseClient, row: HarvestedImport): Promise<File> {
  const { data, error } = await supabase.storage.from(row.storage_bucket).download(row.storage_path);
  if (error || !data) throw error ?? new Error('Download failed');
  return new File([data], row.file_name, { type: data.type });
}

export async function markHarvestedReviewed(supabase: SupabaseClient, id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('harvested_imports')
    .update({ status: 'reviewed', reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markHarvestedDiscarded(supabase: SupabaseClient, id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('harvested_imports')
    .update({ status: 'discarded', reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
