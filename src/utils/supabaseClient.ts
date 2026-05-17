import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

// gotrue-js uses navigator.locks by default. React StrictMode in dev
// double-mounts the AuthProvider, which can orphan the lock and stall
// auth resolution for ~5s per cycle. Provide an in-memory lock that just
// serializes calls in this tab — single-tab session sharing is the
// existing behavior anyway, since localStorage is the session store.
const inMemoryLock = (() => {
  let chain: Promise<unknown> = Promise.resolve();
  return <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
    const next = chain.then(() => fn());
    chain = next.catch(() => undefined);
    return next;
  };
})();

const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: inMemoryLock,
  },
};

function initSupabase(): SupabaseClient | null {
  // Try env vars first (build-time injection)
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return createClient(envUrl, envKey, clientOptions);
  }

  // Fallback: localStorage keys set by Setup Wizard
  if (typeof localStorage !== 'undefined') {
    const lsUrl = localStorage.getItem('surya_supabase_url');
    const lsKey = localStorage.getItem('surya_supabase_anon_key');
    if (lsUrl && lsKey) {
      return createClient(lsUrl, lsKey, clientOptions);
    }
  }

  return null;
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

export function provisionDatabase(url: string, key: string): void {
  localStorage.setItem('surya_supabase_url', url);
  localStorage.setItem('surya_supabase_anon_key', key);
  // Redirect to login so the post-reload route is not /setup
  window.location.hash = '#/login';
  window.location.reload();
}
