import type { Role } from '../../types';

export const REQUESTABLE_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'Student', 'ProjectStaff', 'Guest', 'EmpoweredCommittee',
];

export function isRequestableRole(role: Role): boolean {
  return REQUESTABLE_ROLES.includes(role);
}
