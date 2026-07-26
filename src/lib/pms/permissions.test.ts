import { describe, it, expect } from 'vitest';
import {
  isEmpoweredCommitteeValid,
  isPanelValid,
  pmsTrack,
  scientistGrade,
  tierForDesignation,
} from './permissions';
import { wizardStepsFor } from './constants';
import type { PMSEvaluationCommitteeMember } from '../../types/pms';

describe('scientistGrade', () => {
  it('parses grade letters from free-text designations', () => {
    expect(scientistGrade('Scientist F')).toBe('F');
    expect(scientistGrade('Scientist-C')).toBe('C');
    expect(scientistGrade('scientist e')).toBe('E');
    expect(scientistGrade('Principal Scientist')).toBeNull();
    expect(scientistGrade('Technician')).toBeNull();
  });
});

describe('pmsTrack', () => {
  it('routes Scientists B through F to the standard proforma', () => {
    for (const g of ['B', 'C', 'D', 'E', 'F']) {
      expect(pmsTrack('Scientist', `Scientist ${g}`)).toBe('STANDARD');
    }
  });

  it('routes Scientist G and the senior designations to Annexure-I', () => {
    expect(pmsTrack('Scientist', 'Scientist G')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', 'Chief Scientist')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', 'outstanding scientist')).toBe('ANNEXURE_I');
    expect(pmsTrack('Scientist', '  Distinguished Scientist ')).toBe('ANNEXURE_I');
  });

  it('routes the Director role to Annexure-II regardless of designation', () => {
    expect(pmsTrack('Director', 'Scientist G')).toBe('ANNEXURE_II');
    expect(pmsTrack('Director', 'Chief Scientist')).toBe('ANNEXURE_II');
    expect(pmsTrack('Director', '')).toBe('ANNEXURE_II');
  });

  it('returns null for designations that are not appraisees', () => {
    expect(pmsTrack('Technician', 'Technician')).toBeNull();
    expect(pmsTrack('Scientist', 'Technical Officer')).toBeNull();
    expect(pmsTrack('Scientist', 'Scientist A')).toBeNull();
  });
});

describe('tierForDesignation', () => {
  it('maps grades to Evaluation Committee tiers', () => {
    expect(tierForDesignation('Scientist B')).toBe('I');
    expect(tierForDesignation('Scientist C')).toBe('I');
    expect(tierForDesignation('Scientist D')).toBe('I');
    expect(tierForDesignation('Scientist E')).toBe('II');
    expect(tierForDesignation('Scientist F')).toBe('III');
    expect(tierForDesignation('Scientist G')).toBe('IV');
    expect(tierForDesignation('Chief Scientist')).toBeNull();
  });
});

describe('wizardStepsFor', () => {
  it('gives each track its own steps and only the standard track an AWP step', () => {
    expect(wizardStepsFor('STANDARD').some(s => s.awp)).toBe(true);
    expect(wizardStepsFor('ANNEXURE_I').some(s => s.awp)).toBe(false);
    expect(wizardStepsFor('ANNEXURE_II').some(s => s.awp)).toBe(false);
  });

  it('starts every track with a period-bearing section and ends with review', () => {
    for (const track of ['STANDARD', 'ANNEXURE_I', 'ANNEXURE_II'] as const) {
      const steps = wizardStepsFor(track);
      expect(steps[0].keys.length).toBeGreaterThan(0);
      expect(steps[steps.length - 1].label).toBe('Review & Submit');
    }
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
