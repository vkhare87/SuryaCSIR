import type { Role } from '../types';

export const ALL_ROLES: Role[] = [
  'Director', 'DivisionHead', 'HOD', 'Scientist', 'Technician',
  'HRAdmin', 'FinanceAdmin', 'SystemAdmin', 'MasterAdmin',
  'Student', 'ProjectStaff', 'Guest', 'DefaultUser', 'EmpoweredCommittee', 'PME',
];

// MasterAdmin is the institute superuser and appears on every business page.
const MASTER: Role[] = ['MasterAdmin'];
// SystemAdmin runs the platform (accounts, imports, sync, ingestion). It holds
// no HR / PMS / research pages — MasterAdmin grants those per user if needed.
const PLATFORM: Role[] = ['SystemAdmin', 'MasterAdmin'];
const HR: Role[] = ['HRAdmin', 'MasterAdmin'];
// PME carries a project file from submission to archive. Not an admin: it
// holds the project pages only (RLS: 20261110000002).
const PME: Role[] = ['PME'];
export const DATA_ADMINS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const PMS_AUTHORS: Role[] = ['Scientist', 'HOD', 'DivisionHead', 'Director'];
// Division-scoped managers. Same page access; RLS scopes their rows to their
// own division_code (see 20260718000001_rls_scope_reads.sql).
const DIV_MANAGERS: Role[] = ['DivisionHead', 'HOD'];
// Unverified / un-provisioned identities. Kept out of anything that reads
// institute knowledge (Ask SURYA / RAG) until an admin approves a real role.
const PENDING: Role[] = ['Guest', 'DefaultUser'];
// Everyone holding a real, approved role.
export const VERIFIED: Role[] = ALL_ROLES.filter(r => !PENDING.includes(r));
// Approved institute staff — students and project hires excluded.
const STAFF: Role[] = VERIFIED.filter(r => r !== 'Student' && r !== 'ProjectStaff');

// Single source of truth for page access. Drives both sidebar nav (Layout)
// and route guards (App). RLS is the hard gate on data (read + write).
// Least privilege: each role lists only the pages its profile needs. Anything
// more is a per-user grant by MasterAdmin (feature_grants — see
// lib/access/featureControls.ts featureAccessible). Detail routes
// (/staff/:id, /projects/:id, …) are absent: any VERIFIED role may open them
// and RLS scopes the row. Full matrix: docs/engineering/access_matrix.md.
export const ACCESS_MAP = {
  '/':                        ALL_ROLES,
  '/ask':                     VERIFIED,
  '/work':                    VERIFIED,
  // Own research profile (staff_profile_facts); needs a linked staff row.
  '/me':                      STAFF,
  '/calendar':                VERIFIED,
  '/intelligence':            ['Director', ...DIV_MANAGERS, ...MASTER] as Role[],
  '/explore':                 ['Director', ...DIV_MANAGERS, ...MASTER] as Role[],
  '/staff':                   ['Director', ...DIV_MANAGERS, ...HR] as Role[],
  '/staff/analytics':         ['Director', ...DIV_MANAGERS, ...HR] as Role[],
  '/staff/project':           ['Director', ...DIV_MANAGERS, ...HR, ...PME] as Role[],
  // Post register and planning (20261113000001–02): HR keeps; managers read their division.
  '/staff/posts':             ['Director', ...DIV_MANAGERS, ...HR] as Role[],
  '/staff/planning':          ['Director', ...DIV_MANAGERS, ...HR] as Role[],
  // Expertise finder (20261113000006): team building and nominations.
  '/expertise':               ['Director', ...DIV_MANAGERS, ...HR, ...PME] as Role[],
  // Publication file (20261113000009): authors open and move papers; HoDs and the Director clear them.
  '/publication-files':       ['Director', ...DIV_MANAGERS, 'Scientist', 'Technician', ...MASTER] as Role[],
  // Acting charges (20261113000004): the Director or HR records the order.
  '/admin/acting':            ['Director', ...HR] as Role[],
  '/phd':                     ['Director', ...DIV_MANAGERS, 'Scientist', ...MASTER] as Role[],
  '/divisions':               ['Director', ...DIV_MANAGERS, ...MASTER] as Role[],
  '/recruitment':             HR,
  '/projects':                ['Director', ...DIV_MANAGERS, 'Scientist', 'FinanceAdmin', ...PME, ...MASTER] as Role[],
  '/proposals':               [...PMS_AUTHORS, 'FinanceAdmin', ...PME, ...HR] as Role[],
  '/reports':                 [...PMS_AUTHORS, ...PME, ...HR] as Role[],
  '/reports/new':             PMS_AUTHORS,
  '/facilities':              ['Director', ...DIV_MANAGERS, 'Technician', ...MASTER] as Role[],
  '/partnerships':            ['Director', ...DIV_MANAGERS, 'FinanceAdmin', ...PME, ...MASTER] as Role[],
  '/rnd-monitor':             ['Director', ...DIV_MANAGERS, 'FinanceAdmin', ...PME, ...MASTER] as Role[],
  '/portfolio':               ['Director', ...DIV_MANAGERS, 'FinanceAdmin', ...PME, ...MASTER] as Role[],
  // What closed projects learned is institute memory for everyone doing or
  // steering research (the view behind it is institute-wide).
  '/lessons':                 ['Director', ...DIV_MANAGERS, 'Scientist', 'Technician', 'FinanceAdmin', ...PME, ...MASTER] as Role[],
  '/committees':              STAFF,
  '/helpdesk':                ALL_ROLES,
  '/pms':                     [...PMS_AUTHORS, 'EmpoweredCommittee', ...HR] as Role[],
  '/pms/cycles':              HR,
  '/pms/evaluation-committees': HR,
  '/pms/reports/new':         PMS_AUTHORS,
  '/pms/assign':              HR,
  '/pms/committee':           ['EmpoweredCommittee'] as Role[],
  '/pms/audit':               HR,
  '/pms/awp':                 PMS_AUTHORS,
  '/pms/awp/inbox':           [...PMS_AUTHORS, ...HR] as Role[],
  '/pms/awp/import':          HR,
  '/pms/awp/register':        [...HR, 'Director'] as Role[],
  '/admin/access-requests':   PLATFORM,
  '/admin/features':          MASTER,
  '/data':                    DATA_ADMINS,
  // identity_link_gaps(): caller_is_admin() or Director (20261112000005).
  '/data/links':              [...DATA_ADMINS, 'Director'] as Role[],
  '/admin/rules':             MASTER,
  '/irins-sync':              PLATFORM,
  '/admin/rag':               PLATFORM,
  '/admin/holidays':          PLATFORM,
} as const satisfies Record<string, Role[]>;

export type AccessPath = keyof typeof ACCESS_MAP;

// Display names for the Feature Controls admin page (nav labels live in
// Sidebar's NAV_SECTIONS; sub-paths here have no nav entry).
export const FEATURE_LABELS: Record<AccessPath, string> = {
  '/':                        'Dashboard',
  '/ask':                     'Ask SURYA',
  '/work':                    'My Work',
  '/me':                      'My Profile',
  '/calendar':                'Calendar',
  '/intelligence':            'Intelligence',
  '/explore':                 'Explore Graph',
  '/staff':                   'Human Capital',
  '/staff/analytics':         'Staff Analytics',
  '/staff/project':           'Project Staff',
  '/staff/posts':             'Sanctioned Posts',
  '/staff/planning':          'Workforce Planning',
  '/expertise':               'Expertise Finder',
  '/publication-files':       'Publication Files',
  '/admin/acting':            'Acting Charges',
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
  '/portfolio':               'Project Portfolio',
  '/lessons':                 'Lessons Learned',
  '/committees':              'Committees',
  '/helpdesk':                'Helpdesk',
  '/pms':                     'Performance Mgmt',
  '/pms/cycles':              'PMS Cycles',
  '/pms/evaluation-committees': 'PMS Evaluation Committees',
  '/pms/reports/new':         'PMS Report Authoring',
  '/pms/assign':              'PMS Evaluator Assignment',
  '/pms/committee':           'PMS Committee Queue',
  '/pms/audit':               'PMS Audit Log',
  '/pms/awp':                 'My Annual Work Plan',
  '/pms/awp/inbox':           'AWP Inbox',
  '/pms/awp/import':          'AWP Import',
  '/pms/awp/register':        'AWP Register',
  '/admin/access-requests':   'Access Requests',
  '/admin/features':          'Feature Controls',
  '/data':                    'Data Management',
  '/data/links':              'People Links',
  '/admin/rules':             'CSIR Rules',
  '/irins-sync':              'IRINS Sync',
  '/admin/rag':               'RAG Ingestion',
  '/admin/holidays':          'Holidays',
};

// What each role sees first in the sidebar ("For you"). Order only — never
// access: the Sidebar still filters every entry through canAccess
// (ACCESS_MAP / grants + Feature Controls).
const RESEARCHER_NAV: AccessPath[] = ['/', '/pms', '/projects', '/reports', '/ask', '/calendar'];
const MANAGER_NAV: AccessPath[] = ['/', '/staff', '/reports', '/pms', '/ask', '/calendar'];
const LEADERSHIP_NAV: AccessPath[] = ['/', '/portfolio', '/pms', '/intelligence', '/projects', '/ask'];
const ADMIN_NAV: AccessPath[] = ['/', '/data', '/admin/access-requests', '/staff', '/admin/rag'];

export const PRIMARY_NAV: Record<Role, AccessPath[]> = {
  Scientist:          RESEARCHER_NAV,
  ProjectStaff:       RESEARCHER_NAV,
  Student:            RESEARCHER_NAV,
  HOD:                MANAGER_NAV,
  DivisionHead:       MANAGER_NAV,
  Director:           LEADERSHIP_NAV,
  EmpoweredCommittee: LEADERSHIP_NAV,
  HRAdmin:            ADMIN_NAV,
  FinanceAdmin:       ADMIN_NAV,
  SystemAdmin:        ADMIN_NAV,
  MasterAdmin:        ADMIN_NAV,
  PME:                ['/', '/portfolio', '/projects', '/proposals', '/reports', '/calendar'],
  Technician:         ['/'],
  Guest:              ['/'],
  DefaultUser:        ['/'],
};

export const ROLE_LABELS: Record<Role, string> = {
  Director:           'Director',
  DivisionHead:       'Division Head',
  HOD:                'HOD',
  Scientist:          'Scientist',
  Technician:         'Technician',
  HRAdmin:            'HR Admin',
  FinanceAdmin:       'Finance Admin',
  SystemAdmin:        'System Admin',
  MasterAdmin:        'Master Admin',
  Student:            'Student',
  ProjectStaff:       'Project Staff',
  Guest:              'Guest',
  DefaultUser:        'Pending access',
  EmpoweredCommittee: 'Empowered Committee',
  PME:                'PME',
};
