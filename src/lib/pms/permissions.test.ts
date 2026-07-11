import { describe, it, expect } from 'vitest';
import {
  isEligibleAppraisee,
  isEmpoweredCommitteeValid,
  isPanelValid,
  scientistGrade,
  tierForDesignation,
} from './permissions';
import type { PMSEvaluationCommitteeMember } from '../../types/pms';

describe('scientistGrade / isEligibleAppraisee', () => {
  it('parses grade letters from free-text designations', () => {
    expect(scientistGrade('Scientist F')).toBe('F');
    expect(scientistGrade('Scientist-C')).toBe('C');
    expect(scientistGrade('scientist e')).toBe('E');
    expect(scientistGrade('Principal Scientist')).toBeNull();
    expect(scientistGrade('Technician')).toBeNull();
  });

  it('eligibility is Scientist B through F only', () => {
    for (const g of ['B', 'C', 'D', 'E', 'F']) {
      expect(isEligibleAppraisee(`Scientist ${g}`)).toBe(true);
    }
    expect(isEligibleAppraisee('Scientist G')).toBe(false); // above F
    expect(isEligibleAppraisee('Scientist H')).toBe(false);
    expect(isEligibleAppraisee('Technical Officer')).toBe(false);
  });
});

describe('tierForDesignation', () => {
  it('maps grades to Evaluation Committee tiers', () => {
    expect(tierForDesignation('Scientist B')).toBe('I');
    expect(tierForDesignation('Scientist C')).toBe('I');
    expect(tierForDesignation('Scientist D')).toBe('I');
    expect(tierForDesignation('Scientist E')).toBe('II');
    expect(tierForDesignation('Scientist F')).toBe('III');
    expect(tierForDesignation('Scientist G')).toBeNull();
  });
});

function member(role: PMSEvaluationCommitteeMember['role'], i: number): PMSEvaluationCommitteeMember {
  return { id: String(i), committeeId: 'c1', userId: `u${i}`, role };
}

describe('isPanelValid', () => {
  it('valid with odd count and all three roles', () => {
    expect(isPanelValid([
      member('REPORTING_OFFICER', 1),
      member('REVIEWING_OFFICER', 2),
      member('EC_MEMBER', 3),
    ])).toBe(true);
  });

  it('invalid with even count or a missing role', () => {
    expect(isPanelValid([
      member('REPORTING_OFFICER', 1),
      member('REVIEWING_OFFICER', 2),
      member('EC_MEMBER', 3),
      member('EC_MEMBER', 4),
    ])).toBe(false); // even
    expect(isPanelValid([
      member('REPORTING_OFFICER', 1),
      member('REPORTING_OFFICER', 2),
      member('EC_MEMBER', 3),
    ])).toBe(false); // no reviewing officer
    expect(isPanelValid([])).toBe(false);
  });
});

describe('isEmpoweredCommitteeValid', () => {
  const members = (ordinary: number, chairmen = 1) => [
    ...Array.from({ length: ordinary }, () => ({ isChairman: false })),
    ...Array.from({ length: chairmen }, () => ({ isChairman: true })),
  ];

  it('valid with 3, 5, or 7 members plus one chairman', () => {
    expect(isEmpoweredCommitteeValid(members(3))).toBe(true);
    expect(isEmpoweredCommitteeValid(members(5))).toBe(true);
    expect(isEmpoweredCommitteeValid(members(7))).toBe(true);
  });

  it('invalid with wrong member count or chairman count', () => {
    expect(isEmpoweredCommitteeValid(members(4))).toBe(false);
    expect(isEmpoweredCommitteeValid(members(3, 0))).toBe(false);
    expect(isEmpoweredCommitteeValid(members(3, 2))).toBe(false);
    expect(isEmpoweredCommitteeValid([])).toBe(false);
  });
});
