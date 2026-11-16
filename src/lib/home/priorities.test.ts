import { describe, expect, it } from 'vitest';
import { askerState, splitPriorities } from './priorities';
import type { WorkPriority } from './priorities';

const NOW = new Date('2026-11-14T06:00:00Z');
const p = (id: string, over: Partial<WorkPriority> = {}): WorkPriority => ({
  id, assigneeUserId: 'me', askedBy: 'boss', title: id, reason: 'reason text', wantedBy: '2026-11-20', link: null,
  status: 'OPEN', seenAt: null, pushbackReason: null, pushbackDate: null, pushbackAt: null, pushbackAnswer: null,
  doneAt: null, createdAt: '2026-11-10T00:00:00Z', ...over,
});

describe('askerState', () => {
  it('says what the asker needs to know', () => {
    expect(askerState(p('a'))).toBe('not seen yet');
    expect(askerState(p('a', { seenAt: 'x' }))).toBe('seen');
    expect(askerState(p('a', { seenAt: 'x', pushbackAt: 'x', pushbackDate: '2026-11-25' }))).toBe('asks for 2026-11-25');
    expect(askerState(p('a', { pushbackAt: 'x', pushbackDate: '2026-11-25', pushbackAnswer: 'KEPT', seenAt: 'x' }))).toBe('seen');
    expect(askerState(p('a', { status: 'DONE' }))).toBe('done');
  });
});

describe('splitPriorities', () => {
  it('gives my open ones, and the ones I asked including those closed in the last 14 days', () => {
    const all = [
      p('mine'), p('mine-done', { status: 'DONE', doneAt: '2026-11-13T00:00:00Z' }),
      p('asked', { assigneeUserId: 'x', askedBy: 'me' }),
      p('asked-recent', { assigneeUserId: 'x', askedBy: 'me', status: 'DONE', doneAt: '2026-11-12T00:00:00Z' }),
      p('asked-old', { assigneeUserId: 'x', askedBy: 'me', status: 'WITHDRAWN', createdAt: '2026-10-01T00:00:00Z' }),
    ];
    const s = splitPriorities(all, 'me', NOW);
    expect(s.forMe.map(x => x.id)).toEqual(['mine']);
    expect(s.askedByMe.map(x => x.id)).toEqual(['asked', 'asked-recent']);
  });
});
