import { describe, it, expect, vi, afterEach } from 'vitest';
import { friendlyError } from './errors';
import { logger } from '../utils/logger';

const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });

describe('friendlyError (SEC-06)', () => {
  it('hides Postgres text behind a plain sentence', () => {
    expect(friendlyError(pg('23505', 'duplicate key value violates unique constraint "staff_pkey" Key (ID)=(123) already exists.')))
      .toBe('That record already exists.');
    expect(friendlyError(pg('23503', 'violates foreign key constraint ... "projects"')))
      .toBe('A related record is missing or already removed.');
    expect(friendlyError(pg('42501', 'new row violates row-level security policy for table "pms_reports"')))
      .toBe("You don't have permission to do that.");
  });

  it('passes our own RAISE EXCEPTION text through', () => {
    expect(friendlyError(pg('P0001', 'Report is already finalized'))).toBe('Report is already finalized');
  });

  it('uses the fallback for an unknown code', () => {
    expect(friendlyError(pg('XX000', 'internal: relation "x" ...'), 'Save failed')).toBe('Save failed');
  });

  it('hides Storage errors, which relay Postgres text', () => {
    const e = Object.assign(new Error('new row violates row-level security policy'), { __isStorageError: true });
    expect(friendlyError(e, 'Upload failed')).toBe('Upload failed');
  });

  it('shows auth messages, except server errors', () => {
    const weak = Object.assign(new Error('Password should be at least 12 characters.'), { __isAuthError: true, status: 422, code: 'weak_password' });
    expect(friendlyError(weak)).toBe('Password should be at least 12 characters.');
    const down = Object.assign(new Error('Database error querying schema'), { __isAuthError: true, status: 500 });
    expect(friendlyError(down, 'Sign-in failed')).toBe('Sign-in failed');
  });

  it('shows text our own code threw, and falls back for anything else', () => {
    expect(friendlyError(new Error('Scores of 90 or above require reasons'))).toBe('Scores of 90 or above require reasons');
    expect(friendlyError('boom', 'Load failed')).toBe('Load failed');
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('logs the original when it hides it, and only then', () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    friendlyError(pg('P0001', 'Report is already finalized'));
    expect(log).not.toHaveBeenCalled();
    const raw = pg('23505', 'Key (ID)=(123) already exists.');
    friendlyError(raw);
    expect(log).toHaveBeenCalledWith('error_hidden_from_user', raw, { shown: 'That record already exists.' });
  });
});
