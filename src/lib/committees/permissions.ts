import type { UserAccount, Committee } from '../../types';

const ADMIN_ROLES = ['Director', 'SystemAdmin', 'MasterAdmin'] as const;

export function canViewCommittees(_user: UserAccount): boolean {
  return true;
}

export function canCreateCommittee(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canEditCommittee(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canDeleteCommittee(user: UserAccount): boolean {
  return user.activeRole === 'MasterAdmin';
}

export function canScheduleMeeting(user: UserAccount, committee: Committee): boolean {
  if ((ADMIN_ROLES as readonly string[]).includes(user.activeRole)) return true;
  return user.id === committee.chairperson_id || user.id === committee.secretary_id;
}

export function canWriteMinutes(user: UserAccount, committee: Committee): boolean {
  return canScheduleMeeting(user, committee);
}

export function canEditActionItems(user: UserAccount): boolean {
  const allowed: string[] = ['DivisionHead', 'HOD', 'Director', 'SystemAdmin', 'MasterAdmin'];
  return allowed.includes(user.activeRole);
}

export function canUploadDocuments(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canManageMembers(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

export function canUnlockMinutes(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}
