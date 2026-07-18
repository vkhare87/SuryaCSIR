import { describe, it, expect } from 'vitest';
import { resolvePostLoginPath } from './postLogin';

describe('resolvePostLoginPath', () => {
  it('returns the stored path for a valid deep link', () => {
    expect(resolvePostLoginPath('#/helpdesk/new', '/system-admin')).toBe('/helpdesk/new');
  });

  it('falls back when from is missing or not a string', () => {
    expect(resolvePostLoginPath(undefined, '/scientist')).toBe('/scientist');
    expect(resolvePostLoginPath({ evil: true }, '/scientist')).toBe('/scientist');
  });

  it('falls back for login/root/malformed targets', () => {
    expect(resolvePostLoginPath('#/login', '/hod')).toBe('/hod');
    expect(resolvePostLoginPath('#/', '/hod')).toBe('/hod');
    expect(resolvePostLoginPath('https://evil.example/#/x', '/hod')).toBe('/hod');
  });
});
