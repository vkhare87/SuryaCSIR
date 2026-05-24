import { describe, it, expect } from 'vitest';
import { REQUESTABLE_ROLES, isRequestableRole } from './requestableRoles';

describe('requestableRoles', () => {
  it('excludes admin and default roles', () => {
    expect(REQUESTABLE_ROLES).not.toContain('SystemAdmin');
    expect(REQUESTABLE_ROLES).not.toContain('MasterAdmin');
    expect(REQUESTABLE_ROLES).not.toContain('DefaultUser');
  });
  it('includes common roles', () => {
    expect(REQUESTABLE_ROLES).toContain('Scientist');
    expect(REQUESTABLE_ROLES).toContain('DivisionHead');
  });
  it('isRequestableRole guards the allow-list', () => {
    expect(isRequestableRole('Scientist')).toBe(true);
    expect(isRequestableRole('SystemAdmin')).toBe(false);
  });
});
