import { describe, it, expect } from 'vitest';
import { buildPmsDigest } from './pms';
import type { PMSEvaluation, PMSReport } from '../../types/pms';

const evaluation = (over: Partial<PMSEvaluation>): PMSEvaluation => ({
  id: 'e1', reportId: 'r1', evaluatorId: 'u1', status: 'PENDING', scores: {},
  totalScore: null, reasonsForOutstanding: null, reasonsBelowThreshold: null,
  suggestionsForImprovement: null, comments: null, createdAt: '', updatedAt: '', ...over,
});
const report = (over: Partial<PMSReport>): PMSReport => ({
  id: 'r1', cycleId: 'c1', scientistId: 's1', status: 'EMPOWERED_COMMITTEE_REVIEW',
  periodFrom: null, periodTo: null, selfScore: null, submittedAt: null, signatureUrl: null,
  previousPmsSubmittedOnTime: null, previousPmsSubmissionDate: null, dutyDays: null,
  systemRemark: null, scoreCommunicatedAt: null, nonSubmissionCertificatePath: null,
  createdAt: '', updatedAt: '', ...over,
});

describe('buildPmsDigest', () => {
  it('flags pending evaluations assigned to this user', () => {
    const items = buildPmsDigest('EmpoweredCommittee', 'u1', [evaluation({ status: 'PENDING' })], []);
    expect(items.some(i => i.id === 'pms-evaluations-pending')).toBe(true);
  });

  it('ignores evaluations assigned to other users', () => {
    const items = buildPmsDigest('Scientist', 'u1', [evaluation({ evaluatorId: 'other' })], []);
    expect(items).toHaveLength(0);
  });

  it('ignores completed evaluations', () => {
    const items = buildPmsDigest('Scientist', 'u1', [evaluation({ status: 'COMPLETED' })], []);
    expect(items).toHaveLength(0);
  });

  it('flags empowered-committee-pending reports only for that role', () => {
    const reports = [report({})];
    expect(buildPmsDigest('EmpoweredCommittee', 'u1', [], reports)
      .some(i => i.id === 'pms-committee-decisions-pending')).toBe(true);
    expect(buildPmsDigest('Scientist', 'u1', [], reports)
      .some(i => i.id === 'pms-committee-decisions-pending')).toBe(false);
  });

  it('returns empty when nothing pending', () => {
    expect(buildPmsDigest('EmpoweredCommittee', 'u1', [], [])).toHaveLength(0);
  });
});
