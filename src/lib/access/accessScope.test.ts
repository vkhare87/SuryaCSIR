import { describe, it, expect } from 'vitest';
import { featureAccessible, grantableFeatures, FEATURE_GROUPS } from './featureControls';
import { ACCESS_MAP, type AccessPath } from '../../constants/access';
import type { FeatureControl, Role } from '../../types';

const none = new Set<string>();
const paths = (role: Role) =>
  (Object.keys(ACCESS_MAP) as AccessPath[]).filter(p => featureAccessible(p, role, [], none));

const control = (over: Partial<FeatureControl>): FeatureControl => ({
  feature_key: '/intelligence', enabled: true, disabled_roles: [], note: null, updated_by: null, updated_at: '', ...over,
});

describe('least-privilege role scope', () => {
  it('Scientist sees its own work, not institute analytics', () => {
    const p = paths('Scientist');
    expect(p).toEqual(expect.arrayContaining(['/pms', '/projects', '/proposals', '/reports', '/phd', '/ask']));
    for (const x of ['/intelligence', '/explore', '/partnerships', '/rnd-monitor', '/staff', '/data'] as AccessPath[]) {
      expect(p).not.toContain(x);
    }
  });

  it('SystemAdmin is platform-only', () => {
    expect(paths('SystemAdmin').sort()).toEqual([
      '/', '/admin/access-requests', '/admin/holidays', '/admin/rag', '/ask', '/calendar',
      '/committees', '/data', '/helpdesk', '/irins-sync',
    ]);
  });

  it('Student and ProjectStaff get only the basics', () => {
    for (const r of ['Student', 'ProjectStaff'] as Role[]) {
      expect(paths(r).sort()).toEqual(['/', '/ask', '/calendar', '/helpdesk']);
    }
  });

  it('pending identities see only their dashboard and helpdesk', () => {
    for (const r of ['Guest', 'DefaultUser'] as Role[]) {
      expect(paths(r).sort()).toEqual(['/', '/helpdesk']);
    }
  });

  it('Technician sees instruments, not research or HR', () => {
    expect(paths('Technician')).toContain('/facilities');
    expect(paths('Technician')).not.toContain('/projects');
  });

  it('only MasterAdmin reaches Feature Controls', () => {
    expect(ACCESS_MAP['/admin/features']).toEqual(['MasterAdmin']);
    expect(featureAccessible('/admin/features', 'SystemAdmin', [], none)).toBe(false);
  });
});

describe('featureAccessible with grants and controls', () => {
  it('a grant opens a page the role does not include', () => {
    expect(featureAccessible('/intelligence', 'Scientist', [], new Set(['/intelligence']))).toBe(true);
  });

  it('a grant outranks a role block but not a global switch-off', () => {
    const g = new Set(['/intelligence']);
    expect(featureAccessible('/intelligence', 'Scientist', [control({ disabled_roles: ['Scientist'] })], g)).toBe(true);
    expect(featureAccessible('/intelligence', 'Scientist', [control({ enabled: false })], g)).toBe(false);
  });

  it('role access still obeys controls', () => {
    expect(featureAccessible('/intelligence', 'Director', [control({ disabled_roles: ['Director'] })], none)).toBe(false);
  });

  it('MasterAdmin reaches every feature, whatever the switches', () => {
    expect(featureAccessible('/intelligence', 'MasterAdmin', [control({ enabled: false })], none)).toBe(true);
    expect(paths('MasterAdmin').length).toBe(Object.keys(ACCESS_MAP).length);
  });

  it('unknown paths are never accessible', () => {
    expect(featureAccessible('/nope', 'Director', [], none)).toBe(false);
  });
});

describe('grantableFeatures', () => {
  it('offers only features none of the roles include and not yet granted', () => {
    const flat = grantableFeatures(['Scientist'], FEATURE_GROUPS, new Set(['/explore'])).flatMap(g => g.paths);
    expect(flat).toContain('/intelligence');
    expect(flat).not.toContain('/explore');   // already granted
    expect(flat).not.toContain('/pms');       // role already has it
    expect(flat).not.toContain('/');          // not controllable
  });

  it('considers every role the user holds', () => {
    const flat = grantableFeatures(['Scientist', 'HRAdmin'], FEATURE_GROUPS, new Set()).flatMap(g => g.paths);
    expect(flat).not.toContain('/staff');
  });
});
