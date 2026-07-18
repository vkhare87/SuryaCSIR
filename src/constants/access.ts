import type { Role } from '../types';

export const ALL_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee',
];

const ADMINS: Role[] = ['SystemAdmin', 'MasterAdmin'];
const DATA_ADMINS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const PMS_AUTHORS: Role[] = ['Scientist', 'HOD', 'DivisionHead', 'Director'];
// Division-scoped managers. Same page access; RLS scopes their rows to their
// own division_code (see 20260718000001_rls_scope_reads.sql).
const DIV_MANAGERS: Role[] = ['DivisionHead', 'HOD'];
// Unverified / un-provisioned identities. Kept out of anything that reads
// institute knowledge (Ask SURYA / RAG) until an admin approves a real role.
const PENDING: Role[] = ['Guest', 'DefaultUser'];
// Everyone holding a real, approved role.
const VERIFIED: Role[] = ALL_ROLES.filter(r => !PENDING.includes(r));

// Single source of truth for page access. Drives both sidebar nav (Layout)
// and route guards (App). RLS is the hard gate on data (read + write).
// Detail routes reachable from ALL_ROLES pages (e.g. /staff/:id via
// committees) are intentionally absent — they stay open, RLS scopes data.
export const ACCESS_MAP = {
  '/':                        ALL_ROLES,
  '/ask':                     VERIFIED,
  '/calendar':                ALL_ROLES,
  '/intelligence':            ['Director', ...DIV_MANAGERS, 'Scientist', ...ADMINS] as Role[],
  '/explore':                 ['Director', ...DIV_MANAGERS, 'Scientist', ...ADMINS] as Role[],
  '/staff':                   ['Director', ...DIV_MANAGERS, 'HRAdmin', ...ADMINS] as Role[],
  '/staff/analytics':         ['Director', ...DIV_MANAGERS, 'HRAdmin', ...ADMINS] as Role[],
  '/staff/project':           ['Director', ...DIV_MANAGERS, 'HRAdmin', ...ADMINS] as Role[],
  '/phd':                     ['Director', ...DIV_MANAGERS, 'Scientist', ...ADMINS] as Role[],
  '/divisions':               ['Director', ...DIV_MANAGERS, ...ADMINS] as Role[],
  '/recruitment':             DATA_ADMINS,
  '/projects':                ['Director', ...DIV_MANAGERS, 'Scientist', 'FinanceAdmin', ...ADMINS] as Role[],
  '/proposals':               [...PMS_AUTHORS, 'FinanceAdmin', ...DATA_ADMINS] as Role[],
  '/reports':                 [...PMS_AUTHORS, ...DATA_ADMINS] as Role[],
  '/reports/new':             PMS_AUTHORS,
  '/facilities':              ['Director', ...DIV_MANAGERS, 'Technician', ...ADMINS] as Role[],
  '/partnerships':            ['Director', ...DIV_MANAGERS, 'Scientist', 'FinanceAdmin', ...ADMINS] as Role[],
  '/rnd-monitor':             ['Director', ...DIV_MANAGERS, 'Scientist', 'FinanceAdmin', ...ADMINS] as Role[],
  '/committees':              ALL_ROLES,
  '/helpdesk':                ALL_ROLES,
  '/pms':                     [...PMS_AUTHORS, 'EmpoweredCommittee', ...DATA_ADMINS] as Role[],
  '/pms/cycles':              DATA_ADMINS,
  '/pms/evaluation-committees': DATA_ADMINS,
  '/pms/reports/new':         PMS_AUTHORS,
  '/pms/assign':              DATA_ADMINS,
  '/pms/committee':           ['EmpoweredCommittee'] as Role[],
  '/pms/audit':               DATA_ADMINS,
  '/admin/access-requests':   ADMINS,
  '/admin/features':          ['MasterAdmin'] as Role[],
  '/data':                    DATA_ADMINS,
  '/irins-sync':              ADMINS,
  '/admin/rag':               ADMINS,
  '/admin/holidays':          ADMINS,
} as const satisfies Record<string, Role[]>;

export type AccessPath = keyof typeof ACCESS_MAP;

// Display names for the Feature Controls admin page (nav labels live in
// Sidebar's NAV_SECTIONS; sub-paths here have no nav entry).
export const FEATURE_LABELS: Record<AccessPath, string> = {
  '/':                        'Dashboard',
  '/ask':                     'Ask SURYA',
  '/calendar':                'Calendar',
  '/intelligence':            'Intelligence',
  '/explore':                 'Explore Graph',
  '/staff':                   'Human Capital',
  '/staff/analytics':         'Staff Analytics',
  '/staff/project':           'Project Staff',
  '/phd':                     'PhD Tracker',
  '/divisions':               'Divisions',
  '/recruitment':             'Recruitment',
  '/projects':                'Projects',
  '/proposals':               'Proposals',
  '/reports':                 'Progress Reports',
  '/reports/new':             'Progress Report Authoring',
  '/facilities':              'Instruments',
  '/partnerships':            'Partnerships',
  '/rnd-monitor':             'R&D Monitor',
  '/committees':              'Committees',
  '/helpdesk':                'Helpdesk',
  '/pms':                     'Performance Mgmt',
  '/pms/cycles':              'PMS Cycles',
  '/pms/evaluation-committees': 'PMS Evaluation Committees',
  '/pms/reports/new':         'PMS Report Authoring',
  '/pms/assign':              'PMS Evaluator Assignment',
  '/pms/committee':           'PMS Committee Queue',
  '/pms/audit':               'PMS Audit Log',
  '/admin/access-requests':   'Access Requests',
  '/admin/features':          'Feature Controls',
  '/data':                    'Data Management',
  '/irins-sync':              'IRINS Sync',
  '/admin/rag':               'RAG Ingestion',
  '/admin/holidays':          'Holidays',
};
