import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function initSupabase(): SupabaseClient | null {
  // Try env vars first (build-time injection)
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    return createClient(envUrl, envKey);
  }

  // Fallback: localStorage keys set by Setup Wizard
  if (typeof localStorage !== 'undefined') {
    const lsUrl = localStorage.getItem('surya_supabase_url');
    const lsKey = localStorage.getItem('surya_supabase_anon_key');
    if (lsUrl && lsKey) {
      return createClient(lsUrl, lsKey);
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
  // Reload so the module re-initializes with the new credentials
  window.location.reload();
}
