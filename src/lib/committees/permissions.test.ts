import { describe, it, expect } from 'vitest';
import type { UserAccount, Committee } from '../../types';
import {
  canViewCommittees,
  canCreateCommittee,
  canEditCommittee,
  canDeleteCommittee,
  canScheduleMeeting,
  canWriteMinutes,
  canEditActionItems,
  canUploadDocuments,
  canManageMembers,
  canUnlockMinutes,
} from './permissions';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 'U001',
    email: 'test@example.com',
    roles: ['Scientist'],
    activeRole: 'Scientist',
    divisionCode: null,
    mustChangePassword: false,
    ...overrides,
  };
}

function makeCommittee(overrides: Partial<Committee> = {}): Committee {
  return {
    id: 'cmt-01',
    name: 'Test Committee',
    committee_type: 'Standing',
    mandate: 'Test mandate',
    chairperson_id: 'U999',
    secretary_id: 'U888',
    status: 'Active',
    formed_date: '2025-01-01',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const ADMIN_ROLES = ['Director', 'SystemAdmin', 'MasterAdmin'] as const;

// ---------------------------------------------------------------------------
// canViewCommittees
// ---------------------------------------------------------------------------

describe('canViewCommittees', () => {
  it('returns true for any authenticated user', () => {
    expect(canViewCommittees(makeUser({ activeRole: 'Scientist' }))).toBe(true);
    expect(canViewCommittees(makeUser({ activeRole: 'Director' }))).toBe(true);
    expect(canViewCommittees(makeUser({ activeRole: 'Guest' }))).toBe(true);
    expect(canViewCommittees(makeUser({ activeRole: 'DefaultUser' }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canCreateCommittee
// ---------------------------------------------------------------------------

describe('canCreateCommittee', () => {
  it.each(ADMIN_ROLES)('returns true for %s', (role) => {
    expect(canCreateCommittee(makeUser({ activeRole: role }))).toBe(true);
  });

  it('returns false for non-admin roles', () => {
    expect(canCreateCommittee(makeUser({ activeRole: 'Scientist' }))).toBe(false);
    expect(canCreateCommittee(makeUser({ activeRole: 'HOD' }))).toBe(false);
    expect(canCreateCommittee(makeUser({ activeRole: 'DivisionHead' }))).toBe(false);
    expect(canCreateCommittee(makeUser({ activeRole: 'Technician' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canEditCommittee
// ---------------------------------------------------------------------------

describe('canEditCommittee', () => {
  it.each(ADMIN_ROLES)('returns true for %s', (role) => {
    expect(canEditCommittee(makeUser({ activeRole: role }))).toBe(true);
  });

  it('returns false for non-admin roles', () => {
    expect(canEditCommittee(makeUser({ activeRole: 'HOD' }))).toBe(false);
    expect(canEditCommittee(makeUser({ activeRole: 'Scientist' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canDeleteCommittee
// ---------------------------------------------------------------------------

describe('canDeleteCommittee', () => {
  it('returns true for MasterAdmin', () => {
    expect(canDeleteCommittee(makeUser({ activeRole: 'MasterAdmin' }))).toBe(true);
  });

  it('returns false for Director and other roles', () => {
    expect(canDeleteCommittee(makeUser({ activeRole: 'Director' }))).toBe(false);
    expect(canDeleteCommittee(makeUser({ activeRole: 'SystemAdmin' }))).toBe(false);
    expect(canDeleteCommittee(makeUser({ activeRole: 'Scientist' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canScheduleMeeting
// ---------------------------------------------------------------------------

describe('canScheduleMeeting', () => {
  it.each(ADMIN_ROLES)('returns true for admin role %s regardless of committee membership', (role) => {
    const c = makeCommittee({ chairperson_id: 'OTHER', secretary_id: 'OTHER' });
    expect(canScheduleMeeting(makeUser({ id: 'U001', activeRole: role }), c)).toBe(true);
  });

  it('returns true when user is the committee chairperson', () => {
    const c = makeCommittee({ chairperson_id: 'U001' });
    expect(canScheduleMeeting(makeUser({ id: 'U001', activeRole: 'Scientist' }), c)).toBe(true);
  });

  it('returns true when user is the committee secretary', () => {
    const c = makeCommittee({ secretary_id: 'U001' });
    expect(canScheduleMeeting(makeUser({ id: 'U001', activeRole: 'Scientist' }), c)).toBe(true);
  });

  it('returns false when user is neither admin, chairperson, nor secretary', () => {
    const c = makeCommittee({ chairperson_id: 'OTHER', secretary_id: 'OTHER' });
    expect(canScheduleMeeting(makeUser({ id: 'U001', activeRole: 'Scientist' }), c)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canWriteMinutes
// ---------------------------------------------------------------------------

describe('canWriteMinutes', () => {
  it('delegates to canScheduleMeeting (same logic)', () => {
    const c = makeCommittee({ chairperson_id: 'U001' });
    expect(canWriteMinutes(makeUser({ id: 'U001', activeRole: 'Scientist' }), c)).toBe(true);

    const c2 = makeCommittee({ chairperson_id: 'OTHER', secretary_id: 'OTHER' });
    expect(canWriteMinutes(makeUser({ id: 'U001', activeRole: 'Scientist' }), c2)).toBe(false);
  });

  it('returns true for admin roles', () => {
    expect(canWriteMinutes(
      makeUser({ activeRole: 'Director' }),
      makeCommittee()
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canEditActionItems
// ---------------------------------------------------------------------------

describe('canEditActionItems', () => {
  const ALLOWED = ['DivisionHead', 'HOD', 'Director', 'SystemAdmin', 'MasterAdmin'];
  const DENIED = ['Scientist', 'Technician', 'Guest', 'DefaultUser'];

  it.each(ALLOWED)('returns true for %s', (role) => {
    expect(canEditActionItems(makeUser({ activeRole: role as UserAccount['activeRole'] }))).toBe(true);
  });

  it.each(DENIED)('returns false for %s', (role) => {
    expect(canEditActionItems(makeUser({ activeRole: role as UserAccount['activeRole'] }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canUploadDocuments
// ---------------------------------------------------------------------------

describe('canUploadDocuments', () => {
  it.each(ADMIN_ROLES)('returns true for %s', (role) => {
    expect(canUploadDocuments(makeUser({ activeRole: role }))).toBe(true);
  });

  it('returns false for Scientist', () => {
    expect(canUploadDocuments(makeUser({ activeRole: 'Scientist' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canManageMembers
// ---------------------------------------------------------------------------

describe('canManageMembers', () => {
  it.each(ADMIN_ROLES)('returns true for %s', (role) => {
    expect(canManageMembers(makeUser({ activeRole: role }))).toBe(true);
  });

  it('returns false for HOD', () => {
    expect(canManageMembers(makeUser({ activeRole: 'HOD' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canUnlockMinutes
// ---------------------------------------------------------------------------

describe('canUnlockMinutes', () => {
  it.each(ADMIN_ROLES)('returns true for admin role %s', (role) => {
    expect(canUnlockMinutes(makeUser({ activeRole: role }))).toBe(true);
  });

  it('returns false for Scientist', () => {
    expect(canUnlockMinutes(makeUser({ activeRole: 'Scientist' }))).toBe(false);
  });
});
