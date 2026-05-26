import { describe, it, expect, vi } from 'vitest';
import { fetchAllPublications } from './fetcher';

describe('fetchAllPublications', () => {
  it('loops pages until an empty page, respects cap', async () => {
    const pages = ['<h2>A</h2>', '<h2>B</h2>', ''];
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      const page = Number(new URLSearchParams(body).get('current_page'));
      return { ok: true, text: async () => pages[page] ?? '' } as Response;
    });
    const out = await fetchAllPublications('625115', { fetchImpl: fakeFetch as unknown as typeof fetch, maxPages: 100 });
    expect(out.length).toBe(2);
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it('stops at maxPages cap', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => '<h2>x</h2>' } as Response));
    const out = await fetchAllPublications('1', { fetchImpl: fakeFetch as unknown as typeof fetch, maxPages: 5 });
    expect(out.length).toBe(5);
    expect(fakeFetch).toHaveBeenCalledTimes(5);
  });
});
