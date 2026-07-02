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
