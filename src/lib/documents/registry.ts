import { supabase, getSupabaseUrl, getSupabaseAnonKey } from '../../utils/supabaseClient';
import { bearerToken } from '../auth/bearerToken';
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

/**
 * Signed URL via a raw REST call, not `supabase.storage.from().createSignedUrl()`.
 *
 * The SDK method resolves its Authorization header through the same internal
 * `auth.getSession()` path that has been observed hanging indefinitely (see
 * `lib/auth/bearerToken.ts`) — when it stalls, no error is thrown and no request is
 * ever issued, so a document viewer just sits on "Loading source…" forever. Building
 * the request by hand with `bearerToken()`'s bounded fallback means a stalled auth
 * client degrades to a clear failure (`null`) instead of an unrecoverable hang.
 */
export async function createSignedUrl(
  bucket: string, storagePath: string, expiresIn = 60,
): Promise<string | null> {
  const base = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!base || !anonKey) return null;

  let token: string;
  try {
    token = await bearerToken();
  } catch {
    return null;
  }

  const path = storagePath.split('/').map(encodeURIComponent).join('/');
  try {
    const res = await fetch(`${base}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { signedURL?: string };
    return data.signedURL ? `${base}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

/** Signed URL for a document in the shared bucket. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  return createSignedUrl(SHARED_BUCKET, storagePath);
}

/**
 * Open a document whose URL has to be fetched first, from inside a click handler.
 *
 * Every signed URL costs a network round trip, and `window.open()` called *after*
 * awaiting it is silently blocked: the click's user activation is already spent, so
 * the browser drops the popup and reports nothing. The button appears dead. Claim the
 * tab synchronously while the activation is still live, then point it at the URL once
 * it resolves.
 *
 * Returns false when no URL could be produced, so callers can surface that instead of
 * failing silently.
 */
export async function openDocumentUrl(resolve: () => Promise<string | null>): Promise<boolean> {
  const tab = window.open('', '_blank');
  const url = await resolve();
  if (!url) {
    tab?.close();
    return false;
  }
  if (tab) {
    tab.opener = null;          // keep the noopener guarantee we'd get from window.open
    tab.location.replace(url);
  } else {
    window.location.assign(url);  // popup blocker won: same-tab rather than nothing
  }
  return true;
}

/** List registry rows for one entity (shared bucket). */
export async function listDocuments(entityType: string, entityId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_type, title, storage_path, file_name, file_size, created_at, ingest_status, access_tier')
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
