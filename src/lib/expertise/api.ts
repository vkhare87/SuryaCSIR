import { supabase } from '../../utils/supabaseClient';
import { DOMAIN_THEMES } from '../proposals/constants';

// Enterprise P6 (20261113000006): expertise vocabulary, tags and finder.
// Terms and tags are table writes under RLS; merge, suggest and find are RPCs.

export type TermKind = 'MATERIAL' | 'TECHNIQUE' | 'APPLICATION';
export interface ExpertiseTerm { id: string; label: string; kind: TermKind; theme_code: string | null; status: 'ACTIVE' | 'MERGED' }
export interface StaffTag { staff_id: string; term_id: string; source: 'SELF' | 'SUGGESTED'; confirmed_at: string | null }
export interface TermSuggestion { term_id: string; label: string; kind: TermKind; evidence_count: number }
export interface EvidenceItem { type: string; id: string; title: string; link: string }
export interface ExpertMatch {
  staff_id: string; name: string; division: string | null; designation: string | null; confirmed_terms: number;
  evidence: EvidenceItem[]; evidence_count: number; active_projects: number; overload: boolean; retires_on: string | null;
}

export const KIND_LABEL: Record<TermKind, string> = { MATERIAL: 'Material', TECHNIQUE: 'Technique', APPLICATION: 'Application' };
/** theme_code '01'–'09' is the position in DOMAIN_THEMES. */
export const themeLabel = (code: string | null) => (code ? DOMAIN_THEMES[Number(code) - 1] ?? code : '');
export const THEME_OPTIONS = DOMAIN_THEMES.map((label, i) => ({ code: String(i + 1).padStart(2, '0'), label }));

function client() {
  if (!supabase) throw new Error('Database not provisioned');
  return supabase;
}

async function run<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}

export const loadTerms = async () =>
  (await run<ExpertiseTerm[] | null>(client().from('expertise_terms').select('id, label, kind, theme_code, status').eq('status', 'ACTIVE').order('label'))) ?? [];

export const addTerm = async (label: string, kind: TermKind, themeCode: string | null) => {
  const { data: { user } } = await client().auth.getUser();
  await run(client().from('expertise_terms').insert({ label: label.trim(), kind, theme_code: themeCode, created_by: user?.id ?? null }));
};

export const mergeTerm = (from: string, into: string) => run(client().rpc('expertise_merge', { p_from: from, p_into: into }));

export const loadTags = async (staffId: string) =>
  (await run<StaffTag[] | null>(client().from('staff_expertise').select('staff_id, term_id, source, confirmed_at').eq('staff_id', staffId))) ?? [];

export const suggestTerms = async (staffId: string) =>
  (await run<TermSuggestion[] | null>(client().rpc('expertise_suggest', { p_staff_id: staffId }))) ?? [];

/** The person's own tag, confirmed now. Re-confirms a proposed one. */
export const confirmTag = async (staffId: string, termId: string, source: 'SELF' | 'SUGGESTED') => {
  const { data: { user } } = await client().auth.getUser();
  await run(client().from('staff_expertise').upsert(
    { staff_id: staffId, term_id: termId, source, confirmed_at: new Date().toISOString(), added_by: user?.id ?? null },
    { onConflict: 'staff_id,term_id' }));
};

export const removeTag = (staffId: string, termId: string) =>
  run(client().from('staff_expertise').delete().eq('staff_id', staffId).eq('term_id', termId));

export const findExperts = async (termIds: string[], text: string) =>
  (await run<ExpertMatch[] | null>(client().rpc('expertise_find', { p_term_ids: termIds.length ? termIds : null, p_text: text.trim() || null }))) ?? [];
