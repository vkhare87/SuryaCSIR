import { describe, it, expect, vi, afterEach } from 'vitest';
import { openDocumentUrl } from './registry';

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
