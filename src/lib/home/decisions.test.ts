import { describe, expect, it } from 'vitest';
import type { MyAction } from '../dashboard/myActions';
import { decisionQueue, isDecision } from './decisions';

const NOW = new Date(2026, 10, 14, 9, 0);
const act = (id: string, since?: string | null): MyAction =>
  ({ id, kind: 'proposal', due: null, label: id, detail: '', link: '/', ...(since !== undefined ? { since } : {}) });

describe('decision queue', () => {
  it('keeps decisions only: items with a since date, and closure steps', () => {
    expect(isDecision(act('prop-review-1', '2026-11-01T00:00:00Z'))).toBe(true);
    expect(isDecision(act('change-1', null))).toBe(true);
    expect(isDecision(act('closure-step-1'))).toBe(true);
    expect(isDecision(act('prop-1'))).toBe(false);
    expect(isDecision(act('tk-1'))).toBe(false);
  });

  it('puts the oldest first, and items with no date last', () => {
    const q = decisionQueue([
      act('a', '2026-11-12T10:00:00Z'), act('b', '2026-11-01T00:00:00Z'), act('c', null), act('d'),
    ], NOW);
    expect(q.map(r => [r.action.id, r.days])).toEqual([['b', 13], ['a', 2], ['c', null]]);
  });
});
