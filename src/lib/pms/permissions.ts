import type { Role, UserAccount } from '../../types';
import type { CommitteeTier, PmsTrack, PMSEvaluationCommitteeMember, PMSReport } from '../../types/pms';
import { COMMITTEE_TIERS, ELIGIBLE_SCIENTIST_GRADES, SENIOR_DESIGNATIONS, STANDARD_DESIGNATIONS } from './constants';

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

/**
 * Which appraisal proforma applies to a user. The 2026 guidelines cover
 * Scientists B–F only; Scientist G (and the Chief/Outstanding/Distinguished
 * Scientist designations) file Annexure-I and the Director files Annexure-II.
 * Returns null when the person is not an appraisee at all.
 */
export function pmsTrack(activeRole: Role, designation: string): PmsTrack | null {
  if (activeRole === 'Director') return 'ANNEXURE_II';
  const trimmed = designation.trim();
  const matches = (list: string[]) => list.some(d => d.toLowerCase() === trimmed.toLowerCase());

  if (matches(SENIOR_DESIGNATIONS)) return 'ANNEXURE_I';
  if (matches(STANDARD_DESIGNATIONS)) return 'STANDARD';

  const grade = scientistGrade(trimmed);
  if (grade === 'G') return 'ANNEXURE_I';
  if (grade !== null && ELIGIBLE_SCIENTIST_GRADES.includes(grade)) return 'STANDARD';
  return null;
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
