import { describe, it, expect, vi, afterEach } from 'vitest';
import { openDocumentUrl, uploadDocument } from './registry';
import { logger } from '../../utils/logger';

const { sb } = vi.hoisted(() => {
  const bucket = { upload: vi.fn(), remove: vi.fn() };
  const insert = { select: () => insert, single: vi.fn() };
  return {
    sb: {
      bucket,
      insert,
      auth: { getUser: vi.fn() },
      storage: { from: () => bucket },
      from: () => ({ insert: () => insert }),
    },
  };
});
vi.mock('../../utils/supabaseClient', () => ({
  supabase: sb, getSupabaseUrl: () => '', getSupabaseAnonKey: () => '',
}));

function fakeTab() {
  return { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openDocumentUrl', () => {
  it('claims the tab before awaiting the url', async () => {
    // The whole point: window.open() must happen while the click's user activation is
    // still live. Resolve first and the browser blocks the popup silently.
    const order: string[] = [];
    const tab = fakeTab();
    vi.stubGlobal('open', vi.fn(() => { order.push('open'); return tab; }));

    await openDocumentUrl(async () => {
      order.push('resolve');
      return 'https://example.test/doc.pdf#page=4';
    });

    expect(order).toEqual(['open', 'resolve']);
    expect(tab.location.replace).toHaveBeenCalledWith('https://example.test/doc.pdf#page=4');
  });

  it('severs opener so the opened page cannot reach back', async () => {
    const tab = fakeTab();
    vi.stubGlobal('open', vi.fn(() => tab));

    await openDocumentUrl(async () => 'https://example.test/doc.pdf');

    expect(tab.opener).toBeNull();
  });

  it('closes the claimed tab and reports false when no url resolves', async () => {
    const tab = fakeTab();
    vi.stubGlobal('open', vi.fn(() => tab));

    const opened = await openDocumentUrl(async () => null);

    expect(opened).toBe(false);
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('falls back to same-tab navigation when the popup is blocked', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    const opened = await openDocumentUrl(async () => 'https://example.test/doc.pdf');

    expect(opened).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://example.test/doc.pdf');
  });
});

describe('uploadDocument (SEC-11)', () => {
  const file = new File(['x'], 'My Report.pdf', { type: 'application/pdf' });
  const input = { entityType: 'project_report', entityId: 'R1', docType: 'attachment', accessTier: 'owner' as const };

  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

  it("uploads under the uploader's uid", async () => {
    sb.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    sb.bucket.upload.mockResolvedValue({ error: null });
    sb.insert.single.mockResolvedValue({ data: { id: 'd-1' }, error: null });
    expect(await uploadDocument(file, input)).toEqual({ ok: true, id: 'd-1' });
    expect(sb.bucket.upload.mock.calls[0][0]).toMatch(/^u-1\/project_report\/R1\/\d+_My_Report\.pdf$/);
  });

  it('refuses when nobody is signed in, before uploading', async () => {
    sb.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await uploadDocument(file, input)).toEqual({ ok: false, error: 'Not signed in' });
    expect(sb.bucket.upload).not.toHaveBeenCalled();
  });

  it('says so when the leftover file cannot be removed', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    sb.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    sb.bucket.upload.mockResolvedValue({ error: null });
    sb.insert.single.mockResolvedValue({ data: null, error: { message: 'denied' } });
    sb.bucket.remove.mockResolvedValue({ error: { message: 'gone wrong' } });
    const res = await uploadDocument(file, input);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/left behind/);
    expect(log).toHaveBeenCalledWith('[documents] leftover upload not removed', expect.anything(), expect.anything());
  });
});
