import { logger } from '../utils/logger';

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

const CODE_TEXT: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'A related record is missing or already removed.',
  '23502': 'A required field is missing.',
  '23514': 'One of the values is not allowed.',
  '22P02': 'One of the values is not in the expected format.',
  '42501': "You don't have permission to do that.",
  PGRST301: "You don't have permission to do that.",
  PGRST116: "That record was not found, or you don't have access to it.",
  PGRST204: 'That change is not allowed.',
};

/**
 * User-facing text for a failure. Raw Postgres / PostgREST / Storage text
 * leaks table names, constraint names and other rows' key values (SEC-06,
 * docs/roadmap/sources/SECURITY-REVIEW-2026-11-01.md), so it never reaches
 * the UI; the original is logged here. Passed through as written: our own
 * RAISE EXCEPTION text (P0001), client-side auth messages, and errors our
 * own code threw.
 */
export function friendlyError(error: unknown, fallback = DEFAULT_FALLBACK): string {
  const shown = toText(error, fallback);
  if (error && shown !== (error as { message?: unknown }).message) logger.error('error_hidden_from_user', error, { shown });
  return shown;
}

function toText(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const { code, message, status } = error as { code?: unknown; message?: unknown; status?: unknown };
  const text = typeof message === 'string' && message ? message : null;

  if ('__isAuthError' in error) return typeof status === 'number' && status >= 500 ? fallback : text ?? fallback;
  if ('__isStorageError' in error) return fallback;
  if (typeof code === 'string' && code) return code === 'P0001' ? text ?? fallback : CODE_TEXT[code] ?? fallback;
  return error instanceof Error && text ? text : fallback;
}
