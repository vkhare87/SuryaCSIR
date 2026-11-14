import { supabase } from '../../utils/supabaseClient';

// Publication file (EP12, 20261113000009). Reads are RLS-scoped; every move is an RPC.
export type PubStatus = 'DRAFT' | 'ETHICS_CHECK' | 'CLEARED' | 'SUBMITTED' | 'ACCEPTED' | 'PUBLISHED';
export interface PubAuthor { pos: number; name: string; staff_id: string | null; contribution: string | null; consented_at: string | null }
export interface PubFile {
  id: string; title: string; division_code: string; communication_no: string | null; similarity_pct: number | null;
  journal: string | null; year: number | null; doi: string | null; status: PubStatus; created_by: string; output_id: string | null;
  publication_author_consents: PubAuthor[];
}

export const PUB_STATUS_LABEL: Record<PubStatus, string> = {
  DRAFT: 'Draft', ETHICS_CHECK: 'Ethics and similarity check', CLEARED: 'Cleared', SUBMITTED: 'Submitted',
  ACCEPTED: 'Accepted', PUBLISHED: 'Published',
};

/** What the corresponding author does next, or the clearer for ETHICS_CHECK. */
export const NEXT_STEP: Partial<Record<PubStatus, { to: PubStatus; label: string; by: 'author' | 'clearer' }>> = {
  DRAFT: { to: 'ETHICS_CHECK', label: 'Send for ethics check', by: 'author' },
  ETHICS_CHECK: { to: 'CLEARED', label: 'Clear and issue number', by: 'clearer' },
  CLEARED: { to: 'SUBMITTED', label: 'Record submission', by: 'author' },
  SUBMITTED: { to: 'ACCEPTED', label: 'Record acceptance', by: 'author' },
  ACCEPTED: { to: 'PUBLISHED', label: 'Record publication', by: 'author' },
};

/** Why the paper cannot be submitted yet; empty when it can. */
export function submitBlockers(f: Pick<PubFile, 'communication_no' | 'publication_author_consents'>): string[] {
  const out: string[] = [];
  if (!f.communication_no) out.push('no communication number');
  const missing = f.publication_author_consents.filter(a => a.staff_id && !a.consented_at).map(a => a.name);
  if (missing.length) out.push(`consent missing from ${missing.join(', ')}`);
  return out;
}

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function run<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}

export const loadPubFiles = async () =>
  (await run<PubFile[] | null>(client().from('publication_files')
    .select('id, title, division_code, communication_no, similarity_pct, journal, year, doi, status, created_by, output_id, publication_author_consents(pos, name, staff_id, contribution, consented_at)')
    .order('created_at', { ascending: false }))) ?? [];

export const createPubFile = (title: string, division: string, authors: { name: string; staff_id: string | null }[]) =>
  run<string>(client().rpc('publication_file_create', { p_title: title, p_division: division, p_authors: authors }));

export const consentPub = (fileId: string, contribution: string) =>
  run(client().rpc('publication_consent', { p_file_id: fileId, p_contribution: contribution }));

export const movePub = (fileId: string, to: PubStatus, details: Record<string, unknown> = {}) =>
  run<string | null>(client().rpc('publication_move', { p_file_id: fileId, p_to: to, p_details: details }));
