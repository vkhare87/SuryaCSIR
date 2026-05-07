// HARDCODED: staff ID to user ID mapping needed after staff-user linking.
// The comparisons below (committee.chairperson_id === user.id, etc.) use
// user.id (Supabase auth UUID) but chairperson_id/secretary_id store
// staff."ID" values (like "S001"). This will be reconciled in Phase 2.

import type { UserAccount, Committee } from '../../types';

/** Admin roles that bypass all committee permission checks */
const ADMIN_ROLES: string[] = ['Director', 'SystemAdmin', 'MasterAdmin'];

export function isAdmin(user: UserAccount): boolean {
  return ADMIN_ROLES.includes(user.activeRole);
}

export function canEditCommittee(
  user: UserAccount,
  committee?: Committee
): boolean {
  if (isAdmin(user)) return true;
  if (!committee) return false;
  return (
    user.activeRole === user.id && // placeholder — real check uses staff ID mapping
    (committee.chairperson_id === user.id ||
     committee.secretary_id === user.id)
  );
}

export function canScheduleMeeting(
  user: UserAccount,
  committee?: Committee
): boolean {
  if (isAdmin(user)) return true;
  if (!committee) return false;
  return (
    committee.chairperson_id === user.id ||
    committee.secretary_id === user.id
  );
}

export function canWriteMinutes(
  user: UserAccount,
  committee?: Committee
): boolean {
  if (isAdmin(user)) return true;
  if (!committee) return false;
  return (
    committee.chairperson_id === user.id ||
    committee.secretary_id === user.id
  );
}

export function canEditActionItems(
  user: UserAccount
): boolean {
  if (isAdmin(user)) return true;
  return ['DivisionHead', 'HOD', 'Director'].includes(user.activeRole);
}

export function canDeleteCommittee(user: UserAccount): boolean {
  return user.activeRole === 'MasterAdmin';
}

export function canManageMembers(user: UserAccount): boolean {
  return isAdmin(user);
}
