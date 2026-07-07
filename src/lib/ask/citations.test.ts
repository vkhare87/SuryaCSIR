import { describe, it, expect, vi } from 'vitest';

vi.mock('../documents/registry', () => ({
  getDocumentUrl: vi.fn(async (path: string) =>
    path === 'reports/d1/annual.pdf' ? 'https://signed.example/annual.pdf?token=x' : null),
}));

import { citationHref } from './citations';

const base = { document_id: 'd1', title: 'Annual Report', node_title: 'Outcomes', page_start: 3, page_end: 5 };

describe('citationHref', () => {
  it('returns signed url with page anchor', async () => {
    const href = await citationHref({ ...base, storage_path: 'reports/d1/annual.pdf' });
    expect(href).toBe('https://signed.example/annual.pdf?token=x#page=3');
  });

  it('returns null when storage_path empty', async () => {
    expect(await citationHref({ ...base, storage_path: '' })).toBeNull();
  });

  it('returns null when signing fails', async () => {
    expect(await citationHref({ ...base, storage_path: 'missing.pdf' })).toBeNull();
  });
});
