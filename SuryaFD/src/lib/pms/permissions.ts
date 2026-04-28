import type { UserAccount } from '../../types';
import type { PMSReport, PMSCollegiumMember } from '../../types/pms';

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
  membership: PMSCollegiumMember[]
): boolean {
  return membership.some(
    m => m.userId === user.id && (m.role === 'MEMBER' || m.role === 'CHAIRMAN')
  );
}

export function canChairmanReview(
  user: UserAccount,
  membership: PMSCollegiumMember[]
): boolean {
  return membership.some(m => m.userId === user.id && m.role === 'CHAIRMAN');
}

export function canCommitteeDecide(user: UserAccount): boolean {
  return user.activeRole === 'EmpoweredCommittee';
}

export function canAdmin(user: UserAccount): boolean {
  return ['HRAdmin', 'SystemAdmin', 'MasterAdmin'].includes(user.activeRole);
}
