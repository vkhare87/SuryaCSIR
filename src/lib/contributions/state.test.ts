import { describe, it, expect } from 'vitest';
import { availableActions, changedFields, inboxBucket, isReviewer } from './state';
import type { ContributionRequest, DataSteward } from '../../types';

const req = (over: Partial<ContributionRequest> = {}): ContributionRequest => ({
  id: 'r1', domain: 'equipment', recordRef: 'UI-1', divisionCode: 'IMD',
  title: 'Confirm AMC date', reason: '', link: null, requestedBy: 'hod',
  assigneeId: 'owner', delegateId: 'deleg', status: 'open', dueDate: null,
  prefill: {}, response: null, createdAt: '', resolvedAt: null, ...over,
});

const steward = (over: Partial<DataSteward> = {}): DataSteward => ({
  id: 's1', domain: 'equipment', divisionCode: null, userId: 'stew',
  kind: 'steward', cadenceDays: 30, ...over,
});

describe('availableActions', () => {
  it('assignee on open sees delegate, submit, confirm_unchanged, clarify, not_mine, cannot_provide', () => {
    expect(availableActions(req(), 'owner', false, false)).toEqual(
      ['delegate', 'submit', 'confirm_unchanged', 'clarify', 'not_mine', 'cannot_provide']);
  });

  it('delegate on open sees submit and clarify only', () => {
    expect(availableActions(req(), 'deleg', false, false)).toEqual(['submit', 'clarify']);
  });

  it('assignee on prepared sees confirm and clarify', () => {
    expect(availableActions(req({ status: 'prepared' }), 'owner', false, false)).toEqual(['confirm', 'clarify']);
  });

  it('reviewer on submitted sees accept, return, withdraw', () => {
    expect(availableActions(req({ status: 'submitted' }), 'hod', true, false)).toEqual(['accept', 'return', 'withdraw']);
  });

  it('reviewer on needs_clarification sees answer and withdraw', () => {
    expect(availableActions(req({ status: 'needs_clarification' }), 'hod', true, false)).toEqual(['answer', 'withdraw']);
  });

  it('nothing on a closed request', () => {
    expect(availableActions(req({ status: 'done' }), 'owner', true, true)).toEqual([]);
  });

  it('stranger sees nothing', () => {
    expect(availableActions(req(), 'stranger', false, false)).toEqual([]);
  });

  it('assignee on needs_clarification sees submit, not_mine, cannot_provide (no clarify)', () => {
    expect(availableActions(req({ status: 'needs_clarification' }), 'owner', false, false))
      .toEqual(['submit', 'not_mine', 'cannot_provide']);
  });

  it('delegate on prepared sees clarify only', () => {
    expect(availableActions(req({ status: 'prepared' }), 'deleg', false, false)).toEqual(['clarify']);
  });

  it('reviewer can withdraw a blocked request', () => {
    expect(availableActions(req({ status: 'blocked' }), 'hod', true, false)).toEqual(['withdraw']);
  });

  it('canClaim shows claim only when assignee is null', () => {
    expect(availableActions(req({ assigneeId: null, delegateId: null }), 'stew', true, true)).toEqual(['withdraw', 'claim']);
    expect(availableActions(req(), 'stew', true, true)).toEqual(['withdraw']);
  });
});

describe('isReviewer', () => {
  it('requester, admin and in-scope steward review; others do not', () => {
    expect(isReviewer(req(), 'hod', ['HOD'], [])).toBe(true);
    expect(isReviewer(req(), 'x', ['HRAdmin'], [])).toBe(true);
    expect(isReviewer(req(), 'stew', ['Scientist'], [steward()])).toBe(true);
    expect(isReviewer(req(), 'stew', ['Scientist'], [steward({ divisionCode: 'IMD' })])).toBe(true);
    expect(isReviewer(req(), 'stew', ['Scientist'], [steward({ divisionCode: 'LWMD' })])).toBe(false);
    expect(isReviewer(req(), 'stew', ['Scientist'], [steward({ domain: 'staff' })])).toBe(false);
    expect(isReviewer(req({ divisionCode: null }), 'stew', ['Scientist'], [steward({ divisionCode: 'IMD' })])).toBe(false);
    expect(isReviewer(req(), 'owner', ['Director'], [steward()])).toBe(false);
    expect(isReviewer(req(), 'x', ['SystemAdmin'], [])).toBe(true);
    expect(isReviewer(req(), 'x', ['MasterAdmin'], [])).toBe(true);
    expect(isReviewer(req({ requestedBy: null }), 'x', ['Scientist'], [])).toBe(false);
  });
});

describe('changedFields', () => {
  it('changedFields ignores null→empty', () => {
    expect(changedFields({ AMCDate: null }, { AMCDate: '' })).toEqual([]);
  });

  it('changedFields reports a real edit', () => {
    expect(changedFields({ Status: 'Working' }, { Status: 'Down' }))
      .toEqual([{ field: 'Status', from: 'Working', to: 'Down' }]);
  });

  it('compares trimmed strings and includes response-only fields', () => {
    expect(changedFields({ Cost: 10 }, { Cost: ' 10 ', AMCDate: '2027-01-01' }))
      .toEqual([{ field: 'AMCDate', from: undefined, to: '2027-01-01' }]);
  });
});

describe('inboxBucket', () => {
  it('inboxBucket: done and declined → done; submitted for reviewer → review; null assignee → unowned', () => {
    expect(inboxBucket(req({ status: 'done' }), 'owner', false)).toBe('done');
    expect(inboxBucket(req({ status: 'declined' }), 'hod', true)).toBe('done');
    expect(inboxBucket(req({ status: 'submitted' }), 'hod', true)).toBe('review');
    expect(inboxBucket(req({ assigneeId: null, delegateId: null }), 'stew', true)).toBe('unowned');
  });

  it('open for assignee or delegate → todo; submitted for assignee → null', () => {
    expect(inboxBucket(req(), 'owner', false)).toBe('todo');
    expect(inboxBucket(req(), 'deleg', false)).toBe('todo');
    expect(inboxBucket(req({ status: 'submitted' }), 'owner', false)).toBeNull();
    expect(inboxBucket(req(), 'stranger', false)).toBeNull();
  });

  it('only an open request with no assignee is unowned; other orphaned statuses stay with the reviewer', () => {
    const orphan = { assigneeId: null, delegateId: null };
    for (const status of ['submitted', 'needs_clarification', 'blocked'] as const) {
      expect(inboxBucket(req({ ...orphan, status }), 'hod', true)).toBe('review');
      expect(inboxBucket(req({ ...orphan, status }), 'stranger', false)).toBeNull();
    }
    expect(inboxBucket(req({ ...orphan, status: 'prepared' }), 'hod', true)).toBeNull();
  });
});
