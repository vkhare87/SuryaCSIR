import type { Role } from '../types';

export const ALL_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee',
];

const ADMINS: Role[] = ['SystemAdmin', 'MasterAdmin'];
const DATA_ADMINS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const PMS_AUTHORS: Role[] = ['Scientist', 'HOD', 'DivisionHead', 'Director'];

// Single source of truth for page access. Drives both sidebar nav (Layout)
// and route guards (App). RLS remains the hard gate on data.
// Detail routes reachable from ALL_ROLES pages (e.g. /staff/:id via
// committees) are intentionally absent — they stay open, RLS scopes data.
export const ACCESS_MAP = {
  '/':                        ALL_ROLES,
  '/calendar':                ALL_ROLES,
  '/intelligence':            ['Director', 'DivisionHead', 'Scientist', ...ADMINS] as Role[],
  '/staff':                   ['Director', 'DivisionHead', 'HRAdmin', ...ADMINS] as Role[],
  '/staff/analytics':         ['Director', 'DivisionHead', 'HRAdmin', ...ADMINS] as Role[],
  '/staff/project':           ['Director', 'DivisionHead', 'HRAdmin', ...ADMINS] as Role[],
  '/phd':                     ['Director', 'DivisionHead', 'Scientist', ...ADMINS] as Role[],
  '/divisions':               ['Director', ...ADMINS] as Role[],
  '/recruitment':             DATA_ADMINS,
  '/projects':                ['Director', 'DivisionHead', 'Scientist', 'FinanceAdmin', ...ADMINS] as Role[],
  '/proposals':               [...PMS_AUTHORS, ...DATA_ADMINS] as Role[],
  '/reports':                 [...PMS_AUTHORS, ...DATA_ADMINS] as Role[],
  '/reports/new':             PMS_AUTHORS,
  '/facilities':              ['Director', 'DivisionHead', 'Technician', ...ADMINS] as Role[],
  '/committees':              ALL_ROLES,
  '/helpdesk':                ALL_ROLES,
  '/pms':                     [...PMS_AUTHORS, 'EmpoweredCommittee', ...DATA_ADMINS] as Role[],
  '/pms/cycles':              DATA_ADMINS,
  '/pms/collegiums':          DATA_ADMINS,
  '/pms/reports/new':         PMS_AUTHORS,
  '/pms/assign':              DATA_ADMINS,
  '/pms/committee':           ['EmpoweredCommittee'] as Role[],
  '/pms/audit':               DATA_ADMINS,
  '/admin/access-requests':   ADMINS,
  '/data':                    DATA_ADMINS,
  '/irins-sync':              ADMINS,
  '/admin/holidays':          ADMINS,
} as const satisfies Record<string, Role[]>;

export type AccessPath = keyof typeof ACCESS_MAP;
