import type { UserAccount } from '../../types';
import type { CommitteeTier, PMSEvaluationCommitteeMember, PMSReport } from '../../types/pms';
import { COMMITTEE_TIERS, ELIGIBLE_SCIENTIST_GRADES } from './constants';

export function canEditReport(user: UserAccount, report: PMSReport): boolean {
  return report.scientistId === user.id && report.status === 'DRAFT';
}

export function canSubmitReport(
  user: UserAccount,
  report: PMSReport,
  cycleOpen: boolean
): boolean {
  return (
    report.scientistId === user.id &&
    report.status === 'DRAFT' &&
    cycleOpen
  );
}

export function canEvaluate(
  user: UserAccount,
  membership: PMSEvaluationCommitteeMember[]
): boolean {
  return membership.some(m => m.userId === user.id);
}

export function canCommitteeDecide(user: UserAccount): boolean {
  return user.activeRole === 'EmpoweredCommittee';
}

export function canAdmin(user: UserAccount): boolean {
  return ['HRAdmin', 'SystemAdmin', 'MasterAdmin'].includes(user.activeRole);
}

/** Extracts the scientist grade letter from a free-text designation, e.g. "Scientist F" → "F". */
export function scientistGrade(designation: string): string | null {
  const match = designation.trim().match(/^Scientist[\s-]*([A-Z])$/i);
  return match ? match[1].toUpperCase() : null;
}

/** 2026 guidelines: appraisees are Scientists B through F only. */
export function isEligibleAppraisee(designation: string): boolean {
  const grade = scientistGrade(designation);
  return grade !== null && ELIGIBLE_SCIENTIST_GRADES.includes(grade);
}

/** Committee tier responsible for a given scientist designation, if any. */
export function tierForDesignation(designation: string): CommitteeTier | null {
  const grade = scientistGrade(designation);
  if (!grade) return null;
  const entry = (Object.entries(COMMITTEE_TIERS) as [CommitteeTier, string[]][])
    .find(([, grades]) => grades.includes(grade));
  return entry ? entry[0] : null;
}

/** Panel is valid with an odd member count and all three roles present. */
export function isPanelValid(members: PMSEvaluationCommitteeMember[]): boolean {
  const roles = new Set(members.map(m => m.role));
  return (
    members.length % 2 === 1 &&
    roles.has('REPORTING_OFFICER') &&
    roles.has('REVIEWING_OFFICER') &&
    roles.has('EC_MEMBER')
  );
}

/** Empowered Committee: 3, 5, or 7 members plus exactly one Chairman (Director/DG). */
export function isEmpoweredCommitteeValid(members: { isChairman: boolean }[]): boolean {
  const chairmen = members.filter(m => m.isChairman).length;
  const ordinary = members.length - chairmen;
  return chairmen === 1 && [3, 5, 7].includes(ordinary);
}
