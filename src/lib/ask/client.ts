import { supabase } from '../../utils/supabaseClient';
import { bearerToken } from '../auth/bearerToken';

export interface AskCitation {
  document_id: string;
  title: string;
  node_title: string;
  page_start: number;
  page_end: number;
  storage_path: string;
}

export interface AskAnswer {
  answer: string;
  mode: 'document' | 'structured' | 'hybrid';
  citations: AskCitation[];
  queryId: string | null;
}

// The RAG /query response uses dataclass field names (text/mode/citations); normalize here.
interface QueryResponse {
  text: string;
  mode: 'document' | 'structured' | 'hybrid';
  citations: AskCitation[];
  query_id: string | null;
}

/** EI3: the record a question is asked from (rag/api.py ContextEntity). */
export type AskEntityType = 'project' | 'staff' | 'division' | 'instrument';
export interface AskEntity { type: AskEntityType; id: string }
const ENTITY_TYPES: AskEntityType[] = ['project', 'staff', 'division', 'instrument'];

/** "project:P-1" (the ?entity= value) → { type, id }; null for anything else. */
export function parseAskEntity(value: string | null): AskEntity | null {
  const i = value?.indexOf(':') ?? -1;
  if (!value || i < 1) return null;
  const type = value.slice(0, i) as AskEntityType;
  const id = value.slice(i + 1).trim();
  return ENTITY_TYPES.includes(type) && id ? { type, id } : null;
}

export const askAboutHref = (e: AskEntity) => `/ask?entity=${encodeURIComponent(`${e.type}:${e.id}`)}`;

function queryBody(question: string, history?: AskHistoryTurn[], entity?: AskEntity | null) {
  return JSON.stringify({
    question,
    ...(history?.length ? { history } : {}),
    ...(entity ? { context_entity: entity } : {}),
  });
}

export interface AskHistoryTurn {
  question: string;
  answer: string;
}

export async function askSurya(question: string, history?: AskHistoryTurn[], entity?: AskEntity | null): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');

  const token = await bearerToken();

  const res = await fetch(`${base}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: queryBody(question, history, entity),
  });
  if (!res.ok) throw new Error(`Ask SURYA failed (${res.status})`);

  const data = (await res.json()) as QueryResponse;
  return {
    answer: data.text, mode: data.mode,
    citations: data.citations ?? [], queryId: data.query_id ?? null,
  };
}

/**
 * Streaming ask: onToken receives text chunks as the model produces them;
 * resolves with the final answer (citations, queryId). Falls back to the
 * non-streaming endpoint when /query/stream is unavailable.
 */
export async function askSuryaStream(
  question: string,
  history: AskHistoryTurn[],
  onToken: (text: string) => void,
  entity?: AskEntity | null,
): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');

  const token = await bearerToken();

  const res = await fetch(`${base}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: queryBody(question, history, entity),
  });
  if (res.status === 405) return askSurya(question, history, entity);
  if (res.status === 404 && !entity) return askSurya(question, history);
  if (res.status === 404) throw new Error('That record is not available to you.');
  if (!res.ok || !res.body) throw new Error(`Ask SURYA failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: QueryResponse | null = null;
  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5)) as {
        token?: string; done?: QueryResponse; error?: string;
      };
      if (event.token) onToken(event.token);
      if (event.done) done = event.done;
      if (event.error) throw new Error(event.error);
    }
  }
  if (!done) throw new Error('Stream ended without a final answer');
  return {
    answer: done.text, mode: done.mode,
    citations: done.citations ?? [], queryId: done.query_id ?? null,
  };
}

/** Duplication check: prior/ongoing work similar to a topic. Citation-shaped matches. */
export async function findSimilar(text: string): Promise<AskCitation[]> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');

  const token = await bearerToken();

  const res = await fetch(`${base}/similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Similarity check failed (${res.status})`);
  const data = (await res.json()) as { matches: AskCitation[] };
  return data.matches ?? [];
}

// Owner-only feedback update (RLS: user_id = auth.uid()). value: 1 up, -1 down.
/** Save a question as a recurring brief. The briefs worker answers it as `ownerId`
 * and posts the answer to their notification bell (rag/briefs.py). RLS requires
 * ownerId to be the signed-in user. */
export async function scheduleBrief(ownerId: string, question: string, cadence: 'daily' | 'weekly' = 'weekly'): Promise<void> {
  if (!supabase) throw new Error('Not signed in');
  const { error } = await supabase.from('scheduled_queries').insert({ owner: ownerId, question, cadence });
  if (error) throw error;
}

// --- Question history (recent / most used / saved) ---
// Question text only. A click asks again, so an old answer never comes back
// to someone who has since lost the role that allowed it.

export interface AskHistoryItem { id: string; question: string; pinned: boolean }
export interface AskHistory { recent: AskHistoryItem[]; frequent: AskHistoryItem[]; saved: AskHistoryItem[] }
export interface AskLogRow { id: string; question: string; pinned: boolean; created_at: string; refusal_reason: string | null }

export const RECENT_LIMIT = 10;
export const FREQUENT_LIMIT = 5;
export const SAVED_LIMIT = 20;
const HISTORY_DAYS = 90;
const HISTORY_ROWS = 500;
const SCOPE_REFUSALS = new Set(['out_of_scope', 'totals_only', 'scope_unavailable', 'self_unsure']);

/** Groups a person's logged questions (newest first) into the three history lists.
 * Refused questions appear in none; two questions match after trim + lower-case.
 * frequentSince: only rows at or after this ISO time count toward Most used. */
export function buildAskHistory(rows: AskLogRow[], frequentSince?: string): AskHistory {
  const groups = new Map<string, { newest: AskLogRow; pinned?: AskLogRow; count: number; order: number }>();
  for (const row of rows) {
    if (row.refusal_reason && SCOPE_REFUSALS.has(row.refusal_reason)) continue;
    const key = row.question.trim().toLowerCase();
    if (!key) continue;
    const counts = !frequentSince || row.created_at >= frequentSince ? 1 : 0;
    const g = groups.get(key);
    if (g) {
      g.count += counts;
      if (row.pinned && !g.pinned) g.pinned = row;
    } else {
      groups.set(key, { newest: row, pinned: row.pinned ? row : undefined, count: counts, order: groups.size });
    }
  }
  const item = (r: AskLogRow): AskHistoryItem => ({ id: r.id, question: r.question, pinned: r.pinned });
  const all = [...groups.values()];
  return {
    recent: all.slice(0, RECENT_LIMIT).map((g) => item(g.pinned ?? g.newest)),
    frequent: all
      .filter((g) => g.count >= 2)
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .slice(0, FREQUENT_LIMIT)
      .map((g) => item(g.pinned ?? g.newest)),
    saved: all.filter((g) => g.pinned).slice(0, SAVED_LIMIT).map((g) => item(g.pinned!)),
  };
}

const HISTORY_COLUMNS = 'id, question, pinned, created_at, refusal_reason';

/** The signed-in person's history. Filters on user_id even though RLS already
 * does: SystemAdmin / MasterAdmin may read every row of query_log. */
export async function fetchAskHistory(userId: string): Promise<AskHistory> {
  if (!supabase) return { recent: [], frequent: [], saved: [] };
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  // Recent has no date bound; the 90 days apply only to Most used (frequentSince).
  // ponytail: newest 500 rows, move the grouping into an RPC if a person outgrows it.
  const [window, pins] = await Promise.all([
    supabase.from('query_log').select(HISTORY_COLUMNS).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(HISTORY_ROWS),
    supabase.from('query_log').select(HISTORY_COLUMNS).eq('user_id', userId)
      .eq('pinned', true).order('created_at', { ascending: false }).limit(SAVED_LIMIT),
  ]);
  if (window.error) throw window.error;
  if (pins.error) throw pins.error;
  const byId = new Map<string, AskLogRow>();
  for (const r of [...(window.data ?? []), ...(pins.data ?? [])] as AskLogRow[]) byId.set(r.id, r);
  const rows = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return buildAskHistory(rows, since);
}

export async function setQuestionPinned(queryId: string, pinned: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('query_log').update({ pinned }).eq('id', queryId);
  if (error) throw error;
}

export async function sendFeedback(queryId: string, value: 1 | -1): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('query_log').update({ feedback: value }).eq('id', queryId);
  if (error) throw error;
}
