import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

import { askSurya } from './client';

describe('askSurya', () => {
  beforeEach(() => vi.stubEnv('VITE_RAG_URL', 'http://rag.test'));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('parses a 200 response into AskAnswer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'hi', mode: 'document', citations: [] }),
    })));
    const out = await askSurya('what is X');
    expect(out.answer).toBe('hi');
    expect(out.mode).toBe('document');
    expect(out.citations).toEqual([]);
  });

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(askSurya('boom')).rejects.toThrow('500');
  });
});
