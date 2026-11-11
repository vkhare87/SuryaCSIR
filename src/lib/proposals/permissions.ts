import type { UserAccount } from '../../types';
import type { Proposal, ProposalStatus } from '../../types/proposal';
import { EDITABLE_STATUSES, NEXT_ADMIN_TRANSITIONS } from './constants';

const ADMIN_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] as const;

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

export function canUpdateStatus(user: UserAccount): boolean {
  return hasAny(user, ADMIN_ROLES);
}

export function nextAllowedTransitions(status: ProposalStatus): ProposalStatus[] {
  return NEXT_ADMIN_TRANSITIONS[status] ?? [];
}
