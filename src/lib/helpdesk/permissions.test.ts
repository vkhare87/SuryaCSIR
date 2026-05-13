import { describe, it, expect } from 'vitest';
import {
  canCreateTicket,
  canViewAllTickets,
  canViewDivisionTickets,
  canRespond,
  canTransitionStatus,
  canCloseTicket,
  canReassign,
  canForceClose,
  canReopenTicket,
  isAdmin,
} from './permissions';
import type { UserAccount, Ticket } from '../../types';

// --- Test Fixtures ---

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 'U001',
    email: 'test@ampri.res.in',
    roles: ['Scientist'],
    activeRole: 'Scientist',
    divisionCode: null,
    mustChangePassword: false,
    ...overrides,
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'tkt-test-01',
    token: 'AMPRI-260510-001',
    subject: 'Test ticket',
    category: 'Infrastructure',
    urgency: 'Medium',
    description: 'Test description',
    submitted_by: 'U001',
    assigned_to: 'H001',
    status: 'Open',
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

// --- canCreateTicket ---

describe('canCreateTicket', () => {
  it('returns true for any authenticated user', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(canCreateTicket(user)).toBe(true);
  });

  it('returns true for guest user', () => {
    const user = makeUser({ activeRole: 'Guest' });
    expect(canCreateTicket(user)).toBe(true);
  });

  it('returns true for admin user', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(canCreateTicket(user)).toBe(true);
  });
});

// --- canViewAllTickets ---

describe('canViewAllTickets', () => {
  it('returns true for HRAdmin', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(canViewAllTickets(user)).toBe(true);
  });

  it('returns true for SystemAdmin', () => {
    const user = makeUser({ activeRole: 'SystemAdmin' });
    expect(canViewAllTickets(user)).toBe(true);
  });

  it('returns true for MasterAdmin', () => {
    const user = makeUser({ activeRole: 'MasterAdmin' });
    expect(canViewAllTickets(user)).toBe(true);
  });

  it('returns false for Scientist', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(canViewAllTickets(user)).toBe(false);
  });

  it('returns false for Technician', () => {
    const user = makeUser({ activeRole: 'Technician' });
    expect(canViewAllTickets(user)).toBe(false);
  });

  it('returns false for DivisionHead', () => {
    const user = makeUser({ activeRole: 'DivisionHead' });
    expect(canViewAllTickets(user)).toBe(false);
  });
});

// --- canViewDivisionTickets ---

describe('canViewDivisionTickets', () => {
  it('returns true for Scientist', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(canViewDivisionTickets(user)).toBe(true);
  });

  it('returns true for DivisionHead', () => {
    const user = makeUser({ activeRole: 'DivisionHead' });
    expect(canViewDivisionTickets(user)).toBe(true);
  });

  it('returns true for HRAdmin', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(canViewDivisionTickets(user)).toBe(true);
  });
});

// --- canRespond ---

describe('canRespond', () => {
  it('returns true when user is the submitter', () => {
    const user = makeUser({ id: 'U001' });
    const ticket = makeTicket({ submitted_by: 'U001' });
    expect(canRespond(user, ticket)).toBe(true);
  });

  it('returns true when user is the assigned handler', () => {
    const user = makeUser({ id: 'H001' });
    const ticket = makeTicket({ assigned_to: 'H001' });
    expect(canRespond(user, ticket)).toBe(true);
  });

  it('returns false when user is neither submitter nor handler', () => {
    const user = makeUser({ id: 'U999' });
    const ticket = makeTicket({ submitted_by: 'U001', assigned_to: 'H001' });
    expect(canRespond(user, ticket)).toBe(false);
  });
});

// --- canTransitionStatus ---

describe('canTransitionStatus', () => {
  // Handler tests: assigned_to user can move Open->InProgress, InProgress->Resolved
  describe('handler (assigned_to user)', () => {
    const handler = makeUser({ id: 'H001', activeRole: 'Technician' });

    it('allows Open -> InProgress', () => {
      const ticket = makeTicket({ status: 'Open', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'InProgress')).toBe(true);
    });

    it('allows InProgress -> Resolved', () => {
      const ticket = makeTicket({ status: 'InProgress', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'Resolved')).toBe(true);
    });

    it('denies InProgress -> Closed', () => {
      const ticket = makeTicket({ status: 'InProgress', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'Closed')).toBe(false);
    });

    it('denies Open -> Resolved (skip step)', () => {
      const ticket = makeTicket({ status: 'Open', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'Resolved')).toBe(false);
    });

    it('denies Resolved -> Reopened', () => {
      const ticket = makeTicket({ status: 'Resolved', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'Reopened')).toBe(false);
    });

    it('denies Closed -> anything', () => {
      const ticket = makeTicket({ status: 'Closed', assigned_to: 'H001' });
      expect(canTransitionStatus(handler, ticket, 'InProgress')).toBe(false);
    });
  });

  // Submitter tests: can only Close their own resolved ticket
  describe('submitter', () => {
    const submitter = makeUser({ id: 'U001', activeRole: 'Scientist' });

    it('allows Resolved -> Closed for own ticket', () => {
      const ticket = makeTicket({
        status: 'Resolved',
        submitted_by: 'U001',
        assigned_to: 'H001',
      });
      expect(canTransitionStatus(submitter, ticket, 'Closed')).toBe(true);
    });

    it('denies Open -> InProgress', () => {
      const ticket = makeTicket({ status: 'Open', submitted_by: 'U001' });
      expect(canTransitionStatus(submitter, ticket, 'InProgress')).toBe(false);
    });

    it('denies InProgress -> Resolved', () => {
      const ticket = makeTicket({ status: 'InProgress', submitted_by: 'U001' });
      expect(canTransitionStatus(submitter, ticket, 'Resolved')).toBe(false);
    });

    it('denies Resolved -> Closed for someone elses ticket', () => {
      const ticket = makeTicket({
        status: 'Resolved',
        submitted_by: 'OTHER',
      });
      expect(canTransitionStatus(submitter, ticket, 'Closed')).toBe(false);
    });

    it('denies Open -> Closed (skip steps)', () => {
      const ticket = makeTicket({ status: 'Open', submitted_by: 'U001' });
      expect(canTransitionStatus(submitter, ticket, 'Closed')).toBe(false);
    });
  });

  // Admin tests: can perform any transition
  describe('admin user', () => {
    const admin = makeUser({ id: 'A001', activeRole: 'HRAdmin' });

    it('allows any transition from Open', () => {
      const ticket = makeTicket({ status: 'Open' });
      expect(canTransitionStatus(admin, ticket, 'InProgress')).toBe(true);
      expect(canTransitionStatus(admin, ticket, 'Resolved')).toBe(true);
      expect(canTransitionStatus(admin, ticket, 'Closed')).toBe(true);
    });

    it('allows any transition from InProgress', () => {
      const ticket = makeTicket({ status: 'InProgress' });
      expect(canTransitionStatus(admin, ticket, 'Resolved')).toBe(true);
      expect(canTransitionStatus(admin, ticket, 'Closed')).toBe(true);
    });

    it('allows any transition from Resolved', () => {
      const ticket = makeTicket({ status: 'Resolved' });
      expect(canTransitionStatus(admin, ticket, 'Closed')).toBe(true);
    });

    it('SystemAdmin can also perform any transition', () => {
      const sysadmin = makeUser({ id: 'A002', activeRole: 'SystemAdmin' });
      const ticket = makeTicket({ status: 'Open' });
      expect(canTransitionStatus(sysadmin, ticket, 'Closed')).toBe(true);
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('denies transition to same status', () => {
      const user = makeUser({ id: 'H001', activeRole: 'Technician' });
      const ticket = makeTicket({ status: 'InProgress', assigned_to: 'H001' });
      expect(canTransitionStatus(user, ticket, 'InProgress')).toBe(false);
    });

    it('denies for uninvolved user', () => {
      const user = makeUser({ id: 'U999', activeRole: 'Scientist' });
      const ticket = makeTicket({
        status: 'Open',
        submitted_by: 'U001',
        assigned_to: 'H001',
      });
      expect(canTransitionStatus(user, ticket, 'InProgress')).toBe(false);
    });

    it('denies invalid target status string', () => {
      const admin = makeUser({ activeRole: 'MasterAdmin' });
      const ticket = makeTicket({ status: 'Open' });
      expect(canTransitionStatus(admin, ticket, 'InvalidStatus')).toBe(false);
    });
  });
});

// --- canCloseTicket ---

describe('canCloseTicket', () => {
  it('returns true for submitter of resolved ticket', () => {
    const user = makeUser({ id: 'U001' });
    const ticket = makeTicket({ status: 'Resolved', submitted_by: 'U001' });
    expect(canCloseTicket(user, ticket)).toBe(true);
  });

  it('returns true for admin of any resolved ticket', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    const ticket = makeTicket({ status: 'Resolved', submitted_by: 'OTHER' });
    expect(canCloseTicket(user, ticket)).toBe(true);
  });

  it('returns false for submitter of non-resolved ticket', () => {
    const user = makeUser({ id: 'U001' });
    const ticket = makeTicket({ status: 'InProgress', submitted_by: 'U001' });
    expect(canCloseTicket(user, ticket)).toBe(false);
  });

  it('returns false for uninvolved user', () => {
    const user = makeUser({ id: 'U999' });
    const ticket = makeTicket({ status: 'Resolved', submitted_by: 'U001' });
    expect(canCloseTicket(user, ticket)).toBe(false);
  });
});

// --- canReassign ---

describe('canReassign', () => {
  it('returns true for HRAdmin', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(canReassign(user)).toBe(true);
  });

  it('returns true for SystemAdmin', () => {
    const user = makeUser({ activeRole: 'SystemAdmin' });
    expect(canReassign(user)).toBe(true);
  });

  it('returns true for MasterAdmin', () => {
    const user = makeUser({ activeRole: 'MasterAdmin' });
    expect(canReassign(user)).toBe(true);
  });

  it('returns false for Scientist', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(canReassign(user)).toBe(false);
  });

  it('returns false for DivisionHead', () => {
    const user = makeUser({ activeRole: 'DivisionHead' });
    expect(canReassign(user)).toBe(false);
  });
});

// --- canForceClose ---

describe('canForceClose', () => {
  it('returns true for HRAdmin', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(canForceClose(user)).toBe(true);
  });

  it('returns true for SystemAdmin', () => {
    const user = makeUser({ activeRole: 'SystemAdmin' });
    expect(canForceClose(user)).toBe(true);
  });

  it('returns false for Scientist', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(canForceClose(user)).toBe(false);
  });

  it('returns false for Technician', () => {
    const user = makeUser({ activeRole: 'Technician' });
    expect(canForceClose(user)).toBe(false);
  });
});

// --- canReopenTicket ---

describe('canReopenTicket', () => {
  it('returns true for handler when ticket is Closed', () => {
    const user = makeUser({ id: 'H001', activeRole: 'Technician' });
    const ticket = makeTicket({ status: 'Closed', assigned_to: 'H001' });
    expect(canReopenTicket(user, ticket)).toBe(true);
  });

  it('returns true for admin when ticket is Closed', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    const ticket = makeTicket({ status: 'Closed' });
    expect(canReopenTicket(user, ticket)).toBe(true);
  });

  it('returns false when ticket is not Closed', () => {
    const user = makeUser({ id: 'H001', activeRole: 'Technician' });
    const ticket = makeTicket({ status: 'Resolved', assigned_to: 'H001' });
    expect(canReopenTicket(user, ticket)).toBe(false);
  });

  it('returns false for uninvolved user on Closed ticket', () => {
    const user = makeUser({ id: 'U999', activeRole: 'Scientist' });
    const ticket = makeTicket({ status: 'Closed', submitted_by: 'U001', assigned_to: 'H001' });
    expect(canReopenTicket(user, ticket)).toBe(false);
  });
});

// --- isAdmin ---

describe('isAdmin', () => {
  it('returns true for HRAdmin', () => {
    const user = makeUser({ activeRole: 'HRAdmin' });
    expect(isAdmin(user)).toBe(true);
  });

  it('returns true for SystemAdmin', () => {
    const user = makeUser({ activeRole: 'SystemAdmin' });
    expect(isAdmin(user)).toBe(true);
  });

  it('returns true for MasterAdmin', () => {
    const user = makeUser({ activeRole: 'MasterAdmin' });
    expect(isAdmin(user)).toBe(true);
  });

  it('returns false for Scientist', () => {
    const user = makeUser({ activeRole: 'Scientist' });
    expect(isAdmin(user)).toBe(false);
  });

  it('returns false for Director', () => {
    const user = makeUser({ activeRole: 'Director' });
    expect(isAdmin(user)).toBe(false);
  });
});
