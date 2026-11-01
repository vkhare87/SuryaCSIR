import { describe, it, expect } from 'vitest';
import { isDevLogin } from './devLogin';

// SEC-07: the dev superuser needs an explicit opt-in that no deploy sets.
describe('isDevLogin', () => {
  const creds = ['admin@dev.local', 'admin123'] as const;
  it('is off without VITE_DEV_LOGIN, even in dev', () => {
    expect(isDevLogin(...creds, { DEV: true, PROD: false })).toBe(false);
  });
  it('is off in a production build, even with the flag', () => {
    expect(isDevLogin(...creds, { DEV: false, PROD: true, VITE_DEV_LOGIN: '1' })).toBe(false);
  });
  it('is on with the flag outside production, for the dev credentials only', () => {
    expect(isDevLogin(...creds, { DEV: true, PROD: false, VITE_DEV_LOGIN: '1' })).toBe(true);
    expect(isDevLogin('admin@dev.local', 'wrong', { DEV: true, PROD: false, VITE_DEV_LOGIN: '1' })).toBe(false);
  });
});
