import type { Role } from '../types';

export const ROLE_ROUTES: Record<Role, string> = {
  Director:     '/director',
  DivisionHead: '/division-head',
  HOD:          '/hod',
  Scientist:    '/scientist',
  Technician:   '/technician',
  HRAdmin:      '/hr-admin',
  FinanceAdmin: '/finance-admin',
  SystemAdmin:  '/system-admin',
  MasterAdmin:  '/master-admin',
  Student:      '/student',
  ProjectStaff: '/project-staff',
  Guest:        '/guest',
  DefaultUser:  '/pending',
  EmpoweredCommittee: '/pms',
};
