import { supabase } from '../../utils/supabaseClient';
import type { ProposalDocType, ProposalDocument } from '../../types/proposal';
import { mapDocumentRow } from '../../utils/proposalMappers';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './constants';
import { registerDocument } from '../documents/registry';

const BUCKET = 'proposal-documents';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadProposalDoc(
  proposalId: string,
  docType: ProposalDocType,
  file: File,
): Promise<{ ok: true, document: ProposalDocument } | { ok: false, error: string }> {
  if (!supabase) return { ok: false, error: 'Database not provisioned' };

  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return { ok: false, error: 'Only PDF files are allowed' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: 'File exceeds 25 MB' };
  }

  const safe = sanitizeFilename(file.name);
  const path = `${proposalId}/${docType}/${Date.now()}_${safe}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return { ok: false, error: uploadErr.message };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: 'Not authenticated' };
  }

  const { data, error: insertErr } = await supabase
    .from('proposal_documents')
    .insert({
      proposal_id: proposalId,
      doc_type: docType,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insertErr?.message ?? 'Insert failed' };
  }

  // Dual-write into the unified registry (T1). Non-fatal.
  // ponytail: tier 'owner' — proposal division code isn't in scope here;
  // widen to 'division' when uploads pass divisionCode through.
  void registerDocument({
    entityType: 'proposal',
    entityId: proposalId,
    docType,
    title: file.name,
    storageBucket: BUCKET,
    storagePath: path,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    accessTier: 'owner',
  });

  return { ok: true, document: mapDocumentRow(data) };
}

export async function getDownloadUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
