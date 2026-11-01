import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    listeners: [] as ((event: string) => void)[],
    onAuthStateChange(fn: (event: string) => void) { this.listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
  },
}));
vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth } }));

const STORED = 'stored-token';

// gotrue's persisted session, as storedToken() finds it: an own enumerable key.
function fakeStorage(entries: Record<string, string>) {
  const store: Record<string, string> = { ...entries };
  Object.defineProperty(store, 'getItem', { value: (k: string) => store[k] ?? null });
  return store;
}

beforeEach(() => {
  vi.resetModules();
  auth.listeners = [];
  vi.stubGlobal('localStorage', fakeStorage({
    'sb-proj-auth-token': JSON.stringify({ access_token: STORED, expires_at: Date.now() / 1000 + 3600 }),
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const load = async () => (await import('./bearerToken')).bearerToken;
const hang = () => new Promise(() => {});

describe('bearerToken fallback (SEC-16)', () => {
  it('a resolved null session means signed out, even with a stored token', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect((await load())()).rejects.toThrow('Not signed in');
  });

  it('uses the stored token only when getSession times out', async () => {
    vi.useFakeTimers();
    auth.getSession.mockReturnValue(hang());
    const p = (await load())();
    await vi.advanceTimersByTimeAsync(3001);
    await expect(p).resolves.toBe(STORED);
  });

  it('after SIGNED_OUT, a timeout does not reuse the stored token', async () => {
    vi.useFakeTimers();
    auth.getSession.mockReturnValue(hang());
    const bearerToken = await load();
    auth.listeners.forEach(fn => fn('SIGNED_OUT'));
    const p = bearerToken();
    const check = expect(p).rejects.toThrow('Not signed in');
    await vi.advanceTimersByTimeAsync(3001);
    await check;
  });
});
