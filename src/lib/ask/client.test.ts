import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const updateSpy = vi.fn(async () => ({ error: null }));
const eqSpy = vi.fn(async () => ({ error: null }));
let mockSession: { access_token: string } | null = { access_token: 'tok' };

vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
    },
    from: () => ({ update: (v: unknown) => { updateSpy(v); return { eq: eqSpy }; } }),
  },
}));

import { askSurya, sendFeedback } from './client';

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
