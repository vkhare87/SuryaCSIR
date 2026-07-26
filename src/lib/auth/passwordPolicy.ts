/**
 * Password rules, mirrored from the server.
 *
 * GoTrue is the enforcing side — `minimum_password_length` and
 * `password_requirements` in `supabase/config.toml`. This module exists so
 * the UI can say *which* rule failed before a round trip, instead of
 * surfacing GoTrue's generic rejection. Keep the two in sync: if you change
 * one, change the other, or users get told a password is fine and then
 * watch it be refused.
 */

/** Must equal `[auth] minimum_password_length` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Mirrors `password_requirements = "lower_upper_letters_digits_symbols"`.
 * Returns a human-readable reason, or null when the password is acceptable.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  const missing: string[] = [];
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(password)) missing.push('a digit');
  // Anything that is not a letter, digit or whitespace counts as a symbol —
  // matches GoTrue's own definition rather than a hand-picked list.
  if (!/[^a-zA-Z0-9\s]/.test(password)) missing.push('a symbol');

  if (missing.length > 0) {
    return `Password must include ${formatList(missing)}.`;
  }

  return null;
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
