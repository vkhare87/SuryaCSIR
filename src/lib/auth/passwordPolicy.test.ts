import { describe, it, expect } from 'vitest';
import { validatePassword, MIN_PASSWORD_LENGTH } from './passwordPolicy';

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('Ampri#2026Reg')).toBeNull();
  });

  it('rejects anything shorter than the server minimum', () => {
    // 11 chars, otherwise fully compliant — the length rule alone must bite.
    expect(validatePassword('Ampri#2026R')).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  });

  it('rejects the old 8-character floor the UI used to allow', () => {
    expect(validatePassword('Abc#1234')).not.toBeNull();
  });

  it.each([
    ['no lowercase', 'AMPRI#2026REG', 'a lowercase letter'],
    ['no uppercase', 'ampri#2026reg', 'an uppercase letter'],
    ['no digit',     'Ampri#Register', 'a digit'],
    ['no symbol',    'Ampri02026Reg', 'a symbol'],
  ])('reports the missing class: %s', (_label, password, expected) => {
    expect(validatePassword(password)).toContain(expected);
  });

  it('lists every missing class at once', () => {
    const result = validatePassword('aaaaaaaaaaaaaa');
    expect(result).toContain('an uppercase letter');
    expect(result).toContain('a digit');
    expect(result).toContain('a symbol');
  });

  it('counts whitespace as neither symbol nor letter', () => {
    expect(validatePassword('Ampri 2026 Reg')).toContain('a symbol');
  });
});
