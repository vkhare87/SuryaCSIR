import { supabase } from '../../utils/supabaseClient';

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
  mode: 'document' | 'structured';
  citations: AskCitation[];
  queryId: string | null;
}

// The RAG /query response uses dataclass field names (text/mode/citations); normalize here.
interface QueryResponse {
  text: string;
  mode: 'document' | 'structured';
  citations: AskCitation[];
  query_id: string | null;
}

export async function askSurya(question: string): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');
  if (!supabase) throw new Error('Not signed in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${base}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Ask SURYA failed (${res.status})`);

  const data = (await res.json()) as QueryResponse;
  return {
    answer: data.text, mode: data.mode,
    citations: data.citations ?? [], queryId: data.query_id ?? null,
  };
}

/** Duplication check: prior/ongoing work similar to a topic. Citation-shaped matches. */
export async function findSimilar(text: string): Promise<AskCitation[]> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');
  if (!supabase) throw new Error('Not signed in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

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
export async function sendFeedback(queryId: string, value: 1 | -1): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('query_log').update({ feedback: value }).eq('id', queryId);
  if (error) throw error;
}
