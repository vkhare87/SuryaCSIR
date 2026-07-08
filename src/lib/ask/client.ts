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

export interface AskHistoryTurn {
  question: string;
  answer: string;
}

export async function askSurya(question: string, history?: AskHistoryTurn[]): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');
  if (!supabase) throw new Error('Not signed in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${base}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(history?.length ? { question, history } : { question }),
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
): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');
  if (!supabase) throw new Error('Not signed in');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${base}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(history.length ? { question, history } : { question }),
  });
  if (res.status === 404 || res.status === 405) return askSurya(question, history);
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
