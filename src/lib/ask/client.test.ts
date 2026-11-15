import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const updateSpy = vi.fn(async () => ({ error: null }));
const eqSpy = vi.fn(async () => ({ error: null }));
let mockSession: { access_token: string } | null = { access_token: 'tok' };

vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
    },
    from: () => ({
      update: (v: unknown) => { updateSpy(v); return { eq: eqSpy }; },
      select: (cols: string) => { selectSpy(cols); return historyChain(); },
    }),
  },
}));

// One chain per history read; every filter call is recorded, the pinned read
// (an .eq('pinned', true)) resolves to pinnedRows, the window read to windowRows.
const selectSpy = vi.fn();
const filterCalls: unknown[][] = [];
let windowRows: unknown[] = [];
let pinnedRows: unknown[] = [];
function historyChain() {
  let pinned = false;
  const chain = {
    eq: (...a: unknown[]) => { filterCalls.push(['eq', ...a]); if (a[0] === 'pinned') pinned = true; return chain; },
    gte: (...a: unknown[]) => { filterCalls.push(['gte', ...a]); return chain; },
    order: () => chain,
    limit: async () => ({ data: pinned ? pinnedRows : windowRows, error: null }),
  };
  return chain;
}

import { askSurya, sendFeedback, buildAskHistory, fetchAskHistory, setQuestionPinned } from './client';
import type { AskLogRow } from './client';

const row = (id: string, question: string, over: Partial<AskLogRow> = {}): AskLogRow =>
  ({ id, question, pinned: false, created_at: '2026-11-15T00:00:00Z', refusal_reason: null, ...over });

describe('buildAskHistory', () => {
  it('recent: distinct by trimmed lower-case, newest kept, max 10', () => {
    const rows = [row('2', ' Staff count '), row('1', 'staff count'),
      ...Array.from({ length: 12 }, (_, i) => row(`q${i}`, `q ${i}`))];
    const h = buildAskHistory(rows);
    expect(h.recent).toHaveLength(10);
    expect(h.recent[0]).toMatchObject({ id: '2', question: ' Staff count ' });
  });

  it('frequent: needs 2+ asks, ordered by count, max 5', () => {
    const h = buildAskHistory([row('a1', 'a'), row('b1', 'b'), row('b2', 'b'), row('c1', 'c'), row('c2', 'c'), row('c3', 'c')]);
    expect(h.frequent.map((i) => i.question)).toEqual(['c', 'b']);
  });

  it('saved: the pinned row represents its group', () => {
    const h = buildAskHistory([row('new', 'a'), row('old', 'a', { pinned: true })]);
    expect(h.saved).toEqual([{ id: 'old', question: 'a', pinned: true }]);
    expect(h.recent[0]).toEqual({ id: 'old', question: 'a', pinned: true });
  });

  it('frequent counts only rows inside the window; recent and saved keep old rows', () => {
    const since = '2026-08-17T00:00:00Z';
    const h = buildAskHistory([
      row('new', 'a', { created_at: '2026-11-15T00:00:00Z' }),
      row('old', 'a', { created_at: '2026-01-01T00:00:00Z', pinned: true }),
      row('ancient', 'b', { created_at: '2025-01-01T00:00:00Z' }),
    ], since);
    expect(h.frequent).toEqual([]);
    expect(h.recent.map((i) => i.question)).toEqual(['a', 'b']);
    expect(h.saved.map((i) => i.id)).toEqual(['old']);
  });

  it('refused questions appear in no list', () => {
    const h = buildAskHistory([
      row('1', 'secret', { refusal_reason: 'out_of_scope', pinned: true }),
      row('2', 'secret', { refusal_reason: 'out_of_scope' }),
      row('3', 'team', { refusal_reason: 'totals_only' }),
      row('4', 'missing', { refusal_reason: 'no_grounded_answer' }),
      row('5', 'broken', { refusal_reason: 'scope_unavailable' }),
    ]);
    expect([...h.recent, ...h.frequent, ...h.saved].map((i) => i.question)).toEqual(['missing']);
  });
});

describe('fetchAskHistory', () => {
  it('filters to the given user and never selects answers', async () => {
    windowRows = [row('w1', 'one', { created_at: '2026-11-15T02:00:00Z' })];
    pinnedRows = [row('p1', 'old pin', { pinned: true, created_at: '2026-01-01T00:00:00Z' })];
    filterCalls.length = 0;
    const h = await fetchAskHistory('U1');
    for (const [cols] of selectSpy.mock.calls) {
      expect(cols).not.toMatch(/answer|citations/);
    }
    expect(filterCalls.filter((c) => c[0] === 'eq' && c[1] === 'user_id')).toEqual([['eq', 'user_id', 'U1'], ['eq', 'user_id', 'U1']]);
    expect(h.recent.map((i) => i.id)).toEqual(['w1', 'p1']);
    expect(h.saved.map((i) => i.id)).toEqual(['p1']);
    expect(filterCalls.some((c) => c[0] === 'gte')).toBe(false);
  });
});

it('setQuestionPinned updates only pinned on that id', async () => {
  await setQuestionPinned('Q1', true);
  expect(updateSpy).toHaveBeenCalledWith({ pinned: true });
  expect(eqSpy).toHaveBeenCalledWith('id', 'Q1');
});

describe('askSurya', () => {
  beforeEach(() => vi.stubEnv('VITE_RAG_URL', 'http://rag.test'));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('parses a 200 response into AskAnswer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'hi', mode: 'document', citations: [], query_id: 'q1' }),
    })));
    const out = await askSurya('what is X');
    expect(out.answer).toBe('hi');
    expect(out.mode).toBe('document');
    expect(out.citations).toEqual([]);
    expect(out.queryId).toBe('q1');
  });

  it('sendFeedback updates the query_log row', async () => {
    await sendFeedback('q1', 1);
    expect(updateSpy).toHaveBeenCalledWith({ feedback: 1 });
    expect(eqSpy).toHaveBeenCalledWith('id', 'q1');
  });

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(askSurya('boom')).rejects.toThrow('500');
  });

  it('throws when VITE_RAG_URL is not configured', async () => {
    vi.stubEnv('VITE_RAG_URL', '');
    await expect(askSurya('q')).rejects.toThrow('VITE_RAG_URL');
  });

  it('throws when there is no session', async () => {
    mockSession = null;
    try {
      await expect(askSurya('q')).rejects.toThrow('Not signed in');
    } finally {
      mockSession = { access_token: 'tok' };
    }
  });
});
