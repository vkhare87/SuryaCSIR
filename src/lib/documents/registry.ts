import { supabase } from '../../utils/supabaseClient';
import { logger } from '../../utils/logger';

export type DocAccessTier = 'institute' | 'division' | 'owner' | 'confidential';

export interface RegisterDocInput {
  entityType: string;
  entityId: string;
  docType: string;
  title: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  accessTier: DocAccessTier;
  divisionCode?: string | null;
}

/**
 * Register an uploaded file in the unified documents registry.
 * Non-fatal by design: legacy upload flows dual-write here during the
 * transition, and a registry failure must not break the module's own upload.
 * Returns the new document id, or null on failure (logged).
 */
export async function registerDocument(input: RegisterDocInput): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('documents')
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      doc_type: input.docType,
      title: input.title,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      file_name: input.fileName,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      owner_id: user.id,
      access_tier: input.accessTier,
      division_code: input.divisionCode ?? null,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[documents] registry insert failed', error);
    return null;
  }
  return data?.id ?? null;
}

const SHARED_BUCKET = 'documents';

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export interface UploadDocInput {
  entityType: string;
  entityId: string;
  docType: string;
  accessTier: DocAccessTier;
  divisionCode?: string | null;
}

/**
 * Upload a file to the shared documents bucket and register it. Used by new
 * modules (T2+) that have no legacy bucket of their own. Files land under
 * `{entityType}/{entityId}/{epoch}_{name}`. Returns document id or an error.
 */
export async function uploadDocument(
  file: File,
  input: UploadDocInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };
  const path = `${input.entityType}/${input.entityId}/${Date.now()}_${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage.from(SHARED_BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const id = await registerDocument({
    entityType: input.entityType,
    entityId: input.entityId,
    docType: input.docType,
    title: file.name,
    storageBucket: SHARED_BUCKET,
    storagePath: path,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    accessTier: input.accessTier,
    divisionCode: input.divisionCode ?? null,
  });
  if (!id) {
    await supabase.storage.from(SHARED_BUCKET).remove([path]);
    return { ok: false, error: 'Registry insert failed' };
  }
  return { ok: true, id };
}

/** Signed URL for a document in the shared bucket. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(SHARED_BUCKET).createSignedUrl(storagePath, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** List registry rows for one entity (shared bucket). */
export async function listDocuments(entityType: string, entityId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, title, storage_path, file_name, file_size, created_at, ingest_status')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('[documents] list failed', error); return []; }
  return data ?? [];
}

/** Remove the registry row for a deleted file. Non-fatal, mirrors registerDocument. */
export async function unregisterDocument(storageBucket: string, storagePath: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('storage_bucket', storageBucket)
    .eq('storage_path', storagePath);
  if (error) logger.error('[documents] registry delete failed', error);
}
