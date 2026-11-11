// Centralised CRUD permission helper.
//
// Default policy: only SystemAdmin and MasterAdmin can create/update/delete
// across the portal. Optional `module` arg lets specific subsystems elevate
// other roles (e.g. HRAdmin for recruitment, Director for PMS).
//
// Usage:
//   import { useCanEdit } from '../lib/permissions/canEdit';
//   const canEdit = useCanEdit();          // global default
//   const canEditHR = useCanEdit('hr');    // HRAdmin allowed too
//
// In pages: `{canEdit && <Button>Edit</Button>}`.

import type { UserAccount, Role } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export type EditableModule =
  | 'hr'             // HR data: staff, divisions, phd
  | 'projects'       // project records — PME's domain (and MasterAdmin), since rollout (PL7)
  | 'pms'            // performance reports
  | 'committees'     // committee governance
  | 'helpdesk'       // ticket management
  | 'facilities';    // equipment / instruments

const GLOBAL_ADMINS: ReadonlyArray<Role> = ['SystemAdmin', 'MasterAdmin'];

const MODULE_EDITORS: Record<EditableModule, ReadonlyArray<Role>> = {
  hr:         ['HRAdmin'],
  projects:   ['PME'],
  pms:        ['HRAdmin'],
  committees: [],
  helpdesk:   [],
  facilities: [],
};

export function canEdit(user: UserAccount | null, module?: EditableModule): boolean {
  if (!user) return false;
  // Projects are PME's since rollout; SystemAdmin is platform-only there too
  // (20261112000003 withdraws its write policy).
  if (module === 'projects') return user.activeRole === 'MasterAdmin' || user.activeRole === 'PME';
  if (GLOBAL_ADMINS.includes(user.activeRole)) return true;
  if (module && MODULE_EDITORS[module].includes(user.activeRole)) return true;
  return false;
}

export function useCanEdit(module?: EditableModule): boolean {
  const { user } = useAuth();
  return canEdit(user, module);
}
