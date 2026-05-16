import { describe, it, expect } from 'vitest';
import {
  canCreateProposal,
  canEditProposal,
  canUpdateStatus,
  nextAllowedTransitions,
} from './permissions';
import type { UserAccount } from '../../types';
import type { Proposal } from '../../types/proposal';

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 'U001',
    email: 'test@ampri.res.in',
    roles: ['Scientist'],
    activeRole: 'Scientist',
    divisionCode: null,
    mustChangePassword: false,
    ...overrides,
  } as UserAccount;
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'P001',
    proposalCode: 'PROP-2026-0001',
    title: 't',
    acronym: null,
    domainTheme: 'Advanced Materials',
    fundType: 'Internal',
    sponsorType: 'CSIR-Internal',
    sponsorName: 's',
    projectCategory: 'Basic Research',
    proposedStartDate: '2026-06-01',
    proposedDurationMonths: 12,
    requestedBudget: 100000,
    piUserId: 'U001',
    piName: 'Test User',
    divisionCode: 'AMD',
    abstract: 'a',
    problemStatement: 'p',
    objectives: 'o',
    expectedOutcomes: 'e',
    currentTrl: null,
    targetTrl: null,
    status: 'DRAFT',
    reviewBody: null,
    reviewSentDate: null,
    revisionNotes: null,
    rejectionReason: null,
    sanctionedAmount: null,
    sanctionDate: null,
    omNumber: null,
    omDate: null,
    linkedProjectNo: null,
    archived: false,
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
    submittedAt: null,
    createdBy: 'U001',
    lastStatusChangeBy: null,
    lastStatusChangeAt: null,
    ...overrides,
  };
}

describe('canCreateProposal', () => {
  it('allows Scientist', () => {
    expect(canCreateProposal(makeUser({ roles: ['Scientist'] }))).toBe(true);
  });
  it('rejects non-Scientist', () => {
    expect(canCreateProposal(makeUser({ roles: ['Director'] }))).toBe(false);
  });
});

describe('canEditProposal', () => {
  const owner = makeUser({ id: 'U001' });
  const other = makeUser({ id: 'U002' });

  it('owner can edit DRAFT', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'DRAFT' }))).toBe(true);
  });
  it('owner can edit REVISION_REQUESTED', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'REVISION_REQUESTED' }))).toBe(true);
  });
  it('owner cannot edit SUBMITTED', () => {
    expect(canEditProposal(owner, makeProposal({ status: 'SUBMITTED' }))).toBe(false);
  });
  it('non-owner cannot edit', () => {
    expect(canEditProposal(other, makeProposal({ status: 'DRAFT' }))).toBe(false);
  });
});

describe('canUpdateStatus', () => {
  it('allows HRAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['HRAdmin'] }))).toBe(true);
  });
  it('allows SystemAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['SystemAdmin'] }))).toBe(true);
  });
  it('allows MasterAdmin', () => {
    expect(canUpdateStatus(makeUser({ roles: ['MasterAdmin'] }))).toBe(true);
  });
  it('rejects Scientist', () => {
    expect(canUpdateStatus(makeUser({ roles: ['Scientist'] }))).toBe(false);
  });
});

describe('nextAllowedTransitions', () => {
  it('returns admin transitions from SUBMITTED', () => {
    expect(nextAllowedTransitions('SUBMITTED')).toEqual(['UNDER_REVIEW']);
  });
  it('returns three options from UNDER_REVIEW', () => {
    expect(nextAllowedTransitions('UNDER_REVIEW')).toEqual([
      'REVISION_REQUESTED', 'REJECTED', 'RECOMMENDED',
    ]);
  });
  it('returns empty for terminal LINKED', () => {
    expect(nextAllowedTransitions('LINKED')).toEqual([]);
  });
  it('returns empty for REVISION_REQUESTED (scientist-driven)', () => {
    expect(nextAllowedTransitions('REVISION_REQUESTED')).toEqual([]);
  });
});
