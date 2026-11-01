import { supabase } from '../../utils/supabaseClient';

/**
 * supabase.auth.getSession() reads the session from localStorage and only touches the
 * network when the token is near expiry — but it has been observed never resolving at
 * all (valid token, 40+ min of life left), which strands every caller awaiting it. Any
 * SDK call chained off it (storage.createSignedUrl, postgrest queries, …) hangs the
 * same way with no error and no network request, since the request is never issued.
 * Bound the wait so a stalled auth client surfaces as an error instead of an infinite
 * hang, silently blank UI, or a spinner that never resolves.
 */
const AUTH_TIMEOUT_MS = 3000;
const TIMED_OUT = Symbol('timed out');

// Set by a sign-out in any tab (gotrue broadcasts it). After that the stored
// token must never be reused, even if getSession() stalls (SEC-16).
let signedOut = false;
supabase?.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT') signedOut = true;
  else if (event === 'SIGNED_IN') signedOut = false;
});

/** The session gotrue-js persists; the same object getSession() would have returned. */
function storedToken(): string | null {
  try {
    const key = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as
      { access_token?: string; expires_at?: number } | null;
    if (!raw?.access_token) return null;
    // Don't hand back a token the API will only reject.
    if (raw.expires_at && raw.expires_at * 1000 <= Date.now()) return null;
    return raw.access_token;
  } catch {
    return null;
  }
}

/**
 * A valid access token, from getSession() when it resolves in time or from the
 * persisted session when it doesn't. Throws 'Not signed in' when neither yields one.
 */
export async function bearerToken(): Promise<string> {
  if (!supabase) throw new Error('Not signed in');
  const session = await Promise.race([
    supabase.auth.getSession().then(r => r.data.session),
    new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), AUTH_TIMEOUT_MS)),
  ]);
  // Fall back to the persisted session only when the auth client stalls:
  // getSession() reads the same localStorage entry, so an unexpired stored token
  // is equally valid. A session that resolved to null means signed out.
  const token = session === TIMED_OUT
    ? (signedOut ? null : storedToken())
    : session?.access_token ?? null;
  if (!token) throw new Error('Not signed in');
  return token;
}
