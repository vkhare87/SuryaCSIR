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

/**
 * getSession() reads the session from localStorage and only touches the network
 * when the token is near expiry — but it has been observed never resolving at all
 * (valid token, 40+ min of life left), which strands every caller awaiting it and
 * leaves the UI on "Asking…" with no request ever sent. Bound the wait so a stalled
 * auth client surfaces as an error the page can render instead of an infinite hang.
 */
const AUTH_TIMEOUT_MS = 3000;

/** The session gotrue-js persists; the same object getSession() would have returned. */
function storedToken(): string | null {
  try {
    const key = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as
      { access_token?: string; expires_at?: number } | null;
    if (!raw?.access_token) return null;
    // Don't hand back a token the API will only reject.
    if (raw.expires_at && raw.expires_at * 1000 <= Date.now()) return null;
    return raw.access_token;
  } catch {
    return null;
  }
}

async function bearerToken(): Promise<string> {
  if (!supabase) throw new Error('Not signed in');
  const session = await Promise.race([
    supabase.auth.getSession().then(r => r.data.session),
    new Promise<null>(resolve => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
  ]);
  // Fall back to the persisted session when the auth client stalls: getSession()
  // reads the same localStorage entry, so an unexpired stored token is equally
  // valid, and the request proceeds instead of failing on a client-side hang.
  const token = session?.access_token ?? storedToken();
  if (!token) throw new Error('Not signed in');
  return token;
}

export async function askSurya(question: string, history?: AskHistoryTurn[]): Promise<AskAnswer> {
  const base = import.meta.env.VITE_RAG_URL;
  if (!base) throw new Error('VITE_RAG_URL is not configured');

  const token = await bearerToken();

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

  const token = await bearerToken();

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
export async function sendFeedback(queryId: string, value: 1 | -1): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('query_log').update({ feedback: value }).eq('id', queryId);
  if (error) throw error;
}
