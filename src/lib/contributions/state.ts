import { DATA_ADMINS } from '../../constants/access';
import type { ContributionAction, ContributionRequest, ContributionStatus, DataSteward, Role } from '../../types';

type Caller = 'assignee' | 'worker' | 'reviewer' | 'claimer';

// Mirrors the transition table in contribution_request_act (20261101000001).
// 'worker' = assignee or delegate. Order is the table's order.
const RULES: { action: ContributionAction; caller: Caller; from: ContributionStatus[] }[] = [
  { action: 'delegate',          caller: 'assignee', from: ['open'] },
  { action: 'submit',            caller: 'worker',   from: ['open', 'needs_clarification'] },
  { action: 'confirm',           caller: 'assignee', from: ['prepared'] },
  { action: 'confirm_unchanged', caller: 'assignee', from: ['open'] },
  { action: 'clarify',           caller: 'worker',   from: ['open', 'prepared'] },
  { action: 'answer',            caller: 'reviewer', from: ['needs_clarification'] },
  { action: 'not_mine',          caller: 'assignee', from: ['open', 'needs_clarification'] },
  { action: 'cannot_provide',    caller: 'assignee', from: ['open', 'needs_clarification'] },
  { action: 'accept',            caller: 'reviewer', from: ['submitted'] },
  { action: 'return',            caller: 'reviewer', from: ['submitted'] },
  { action: 'withdraw',          caller: 'reviewer', from: ['open', 'prepared', 'submitted', 'needs_clarification', 'blocked'] },
  { action: 'claim',             caller: 'claimer',  from: ['open'] },
];

export function isReviewer(r: ContributionRequest, userId: string, roles: Role[], stewards: DataSteward[]): boolean {
  if (r.requestedBy === userId) return true;
  if (roles.some(role => DATA_ADMINS.includes(role))) return true;
  return stewards.some(s =>
    s.userId === userId && s.domain === r.domain
    && (s.divisionCode === null || (r.divisionCode !== null && s.divisionCode === r.divisionCode)));
}

export function availableActions(
  r: ContributionRequest, userId: string, reviewer: boolean, canClaim: boolean,
): ContributionAction[] {
  const assignee = r.assigneeId === userId;
  const worker = assignee || r.delegateId === userId;
  const can: Record<Caller, boolean> = {
    assignee,
    worker,
    reviewer,
    claimer: canClaim && r.assigneeId === null,
  };
  return RULES.filter(rule => can[rule.caller] && rule.from.includes(r.status)).map(rule => rule.action);
}

const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

export function changedFields(
  prefill: Record<string, unknown>, response: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const fields = [...new Set([...Object.keys(prefill), ...Object.keys(response)])];
  return fields
    .filter(field => norm(prefill[field]) !== norm(response[field]))
    .map(field => ({ field, from: prefill[field], to: response[field] }));
}

export function inboxBucket(
  r: ContributionRequest, userId: string, reviewer: boolean,
): 'todo' | 'review' | 'unowned' | 'done' | null {
  if (r.status === 'done' || r.status === 'declined') return 'done';
  if (r.assigneeId === null) return 'unowned';
  const assignee = r.assigneeId === userId;
  const worker = assignee || r.delegateId === userId;
  if (worker && (r.status === 'open' || r.status === 'needs_clarification')) return 'todo';
  if (assignee && r.status === 'prepared') return 'todo';
  if (reviewer && ['submitted', 'needs_clarification', 'blocked'].includes(r.status)) return 'review';
  return null;
}
