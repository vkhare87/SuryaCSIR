import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;
let resolvedUrl: string | null = null;
let resolvedAnonKey: string | null = null;

// gotrue-js uses navigator.locks by default. React StrictMode in dev
// double-mounts the AuthProvider, which can orphan the lock and stall
// auth resolution for ~5s per cycle. We don't need cross-call locking in
// a single tab — localStorage is already the session store — so the lock
// is a pure pass-through. Earlier attempts at a promise-chain serializer
// deadlocked when a fetch hung mid-chain.
const noopLock = <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn();

const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: noopLock,
  },
};

function resolveCredentials(): { url: string; key: string } | null {
  // Try env vars first (build-time injection)
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) return { url: envUrl, key: envKey };

  // Fallback: localStorage keys set by Setup Wizard. Dev only — in a
  // production bundle this would let any script foothold repoint the whole
  // app at an attacker-controlled Supabase and harvest credentials through
  // a pixel-identical login screen.
  if (import.meta.env.PROD) return null;

  if (typeof localStorage !== 'undefined') {
    const lsUrl = localStorage.getItem('surya_supabase_url');
    const lsKey = localStorage.getItem('surya_supabase_anon_key');
    if (lsUrl && lsKey) return { url: lsUrl, key: lsKey };
  }

  return null;
}

function initSupabase(): SupabaseClient | null {
  const creds = resolveCredentials();
  if (!creds) return null;
  resolvedUrl = creds.url;
  resolvedAnonKey = creds.key;
  return createClient(creds.url, creds.key, clientOptions);
}

// Lazily initialize on first access
export const supabase: SupabaseClient | null = (() => {
  if (!supabaseInstance) {
    supabaseInstance = initSupabase();
  }
  return supabaseInstance;
})();

export function isProvisioned(): boolean {
  return supabase !== null;
}

/**
 * The project URL/anon key `supabase` was constructed with — for callers that need to
 * hit a REST endpoint (e.g. Storage's sign endpoint) directly rather than through an
 * SDK method whose internal auth resolution can stall. Null exactly when `supabase` is.
 */
export function getSupabaseUrl(): string | null {
  return resolvedUrl;
}

export function getSupabaseAnonKey(): string | null {
  return resolvedAnonKey;
}

export function provisionDatabase(url: string, key: string): void {
  localStorage.setItem('surya_supabase_url', url);
  localStorage.setItem('surya_supabase_anon_key', key);
  // Redirect to login so the post-reload route is not /setup
  window.location.hash = '#/login';
  window.location.reload();
}
