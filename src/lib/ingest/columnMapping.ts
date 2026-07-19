import type { SupabaseClient } from '@supabase/supabase-js';

/** SHA-256 of sorted, normalized headers — same file shape (any header order,
 * case, whitespace) fingerprints the same. Web Crypto is browser-native, no
 * new dependency. */
export async function fingerprintHeaders(headers: string[]): Promise<string> {
  const normalized = headers.map((h) => h.trim().toLowerCase()).sort().join('|');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A previously-confirmed mapping for this exact header shape, if one exists
 * — Phase C's "repeat file auto-maps" promise. Null on miss or if the table
 * isn't reachable (not yet migrated, RLS, offline); callers just fall
 * through to manual/AI mapping in that case. */
export async function lookupSavedMapping(
  supabase: SupabaseClient,
  fileType: string,
  headerFingerprint: string,
): Promise<Record<string, string> | null> {
  const { data, error } = await supabase
    .from('import_field_mappings')
    .select('mapping')
    .eq('file_type', fileType)
    .eq('header_fingerprint', headerFingerprint)
    .maybeSingle();
  if (error || !data) return null;
  return data.mapping as Record<string, string>;
}

/** Saves a human-confirmed mapping for reuse on the next file with the same
 * header shape. Best-effort — a save failure shouldn't undo an already-
 * committed import, so callers should swallow errors from this. */
export async function saveMapping(
  supabase: SupabaseClient,
  fileType: string,
  headerFingerprint: string,
  mapping: Record<string, string>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('import_field_mappings')
    .upsert(
      {
        file_type: fileType,
        header_fingerprint: headerFingerprint,
        mapping,
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'file_type,header_fingerprint' },
    );
  if (error) throw error;
}

export interface TargetField {
  column: string;
  label: string;
}

/** Asks the RAG worker's LLM to propose a mapping for headers SCHEMA_MAPS
 * doesn't recognize. Advisory only — ImportFlow still requires a human
 * confirm before anything writes to HR tables. */
export async function suggestMappingsViaAI(
  supabase: SupabaseClient,
  rawHeaders: string[],
  targetFields: TargetField[],
): Promise<Record<string, string | null>> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${base}/map-columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ raw_headers: rawHeaders, target_fields: targetFields }),
  });
  if (!res.ok) throw new Error(`Mapping suggestion failed (${res.status})`);

  const body = (await res.json()) as { mapping: Record<string, string | null> };
  return body.mapping ?? {};
}
