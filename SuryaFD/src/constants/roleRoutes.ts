import type { Role } from '../types';

export const ROLE_ROUTES: Record<Role, string> = {
  Director:     '/director',
  DivisionHead: '/division-head',
  Scientist:    '/scientist',
  Technician:   '/technician',
  HRAdmin:      '/hr-admin',
  FinanceAdmin: '/finance-admin',
  SystemAdmin:  '/system-admin',
};
