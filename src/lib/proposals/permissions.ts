import type { UserAccount } from '../../types';
import type { Proposal } from '../../types/proposal';
import { EDITABLE_STATUSES } from './constants';

function hasAny(user: UserAccount, roles: readonly string[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

// Mirrors the proposals_insert policy (20261110000003): any research role held.
const PROPOSAL_AUTHORS = ['Scientist', 'HOD', 'DivisionHead', 'Director'] as const;

export function canCreateProposal(user: UserAccount): boolean {
  return hasAny(user, PROPOSAL_AUTHORS);
}

export function canEditProposal(user: UserAccount, proposal: Proposal): boolean {
  return proposal.createdBy === user.id && EDITABLE_STATUSES.includes(proposal.status);
}
