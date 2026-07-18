import { describe, it, expect } from 'vitest';
import {
  featureEnabled, isControllable, UNCONTROLLABLE_PATHS,
  featuresForRole, toggleRoleBlock, featureRoleSummary, blankControl,
} from './featureControls';
import type { FeatureControl } from '../../types';
import type { AccessPath } from '../../constants/access';

const control = (over: Partial<FeatureControl>): FeatureControl => ({
  feature_key: '/explore',
  enabled: true,
  disabled_roles: [],
  note: null,
  updated_by: null,
  updated_at: '',
  ...over,
});

describe('featureEnabled', () => {
  it('defaults open when no control row exists', () => {
    expect(featureEnabled('/explore', 'Scientist', [])).toBe(true);
  });

  it('global off blocks every role except MasterAdmin', () => {
    const controls = [control({ enabled: false })];
    expect(featureEnabled('/explore', 'Scientist', controls)).toBe(false);
    expect(featureEnabled('/explore', 'Director', controls)).toBe(false);
    expect(featureEnabled('/explore', 'SystemAdmin', controls)).toBe(false);
    expect(featureEnabled('/explore', 'MasterAdmin', controls)).toBe(true);
  });

  it('role-specific disable blocks only the listed roles', () => {
    const controls = [control({ disabled_roles: ['Scientist'] })];
    expect(featureEnabled('/explore', 'Scientist', controls)).toBe(false);
    expect(featureEnabled('/explore', 'Director', controls)).toBe(true);
  });

  it('controls on one feature do not affect another', () => {
    const controls = [control({ enabled: false })];
    expect(featureEnabled('/projects', 'Scientist', controls)).toBe(true);
  });

  it('uncontrollable paths ignore controls entirely', () => {
    const controls = [
      control({ feature_key: '/', enabled: false }),
      control({ feature_key: '/admin/access-requests', enabled: false }),
    ];
    expect(featureEnabled('/', 'Scientist', controls)).toBe(true);
    expect(featureEnabled('/admin/access-requests', 'SystemAdmin', controls)).toBe(true);
  });
});

describe('isControllable', () => {
  it('dashboard and admin paths are locked out of control', () => {
    expect(isControllable('/')).toBe(false);
    expect(isControllable('/admin/rag')).toBe(false);
    expect(isControllable('/explore')).toBe(true);
    expect(isControllable('/pms')).toBe(true);
    expect(isControllable('/not-a-path')).toBe(false);
  });

  it('UNCONTROLLABLE_PATHS covers exactly / and /admin/*', () => {
    for (const p of UNCONTROLLABLE_PATHS) {
      expect(p === '/' || p.startsWith('/admin/')).toBe(true);
    }
  });
});

describe('featuresForRole', () => {
  it('filters groups to only paths the role is eligible for', () => {
    const groups = [{ label: 'Test', paths: ['/pms/committee', '/data'] as AccessPath[] }];
    expect(featuresForRole('EmpoweredCommittee', groups)).toEqual([
      { label: 'Test', paths: ['/pms/committee'] },
    ]);
    expect(featuresForRole('HRAdmin', groups)).toEqual([
      { label: 'Test', paths: ['/data'] },
    ]);
  });

  it('drops a group entirely when the role has no eligible paths in it', () => {
    const groups = [{ label: 'Test', paths: ['/pms/committee'] as AccessPath[] }];
    expect(featuresForRole('HRAdmin', groups)).toEqual([]);
  });
});

describe('toggleRoleBlock', () => {
  it('adds the role to disabled_roles when not already blocked', () => {
    const c = blankControl('/data');
    const next = toggleRoleBlock(c, 'HRAdmin');
    expect(next.disabled_roles).toEqual(['HRAdmin']);
  });

  it('removes the role from disabled_roles when already blocked', () => {
    const c = { ...blankControl('/data'), disabled_roles: ['HRAdmin', 'SystemAdmin'] };
    const next = toggleRoleBlock(c, 'HRAdmin');
    expect(next.disabled_roles).toEqual(['SystemAdmin']);
  });

  it('does not mutate the input control', () => {
    const c = blankControl('/data');
    toggleRoleBlock(c, 'HRAdmin');
    expect(c.disabled_roles).toEqual([]);
  });
});

describe('featureRoleSummary', () => {
  it('counts eligible roles excluding MasterAdmin, with none blocked by default', () => {
    expect(featureRoleSummary('/data' as AccessPath, undefined)).toEqual({
      totalEligible: 2,
      enabledCount: 2,
      blockedRoles: [],
      globallyKilled: false,
    });
  });

  it('reflects a per-role block', () => {
    const c = { ...blankControl('/data'), disabled_roles: ['HRAdmin'] };
    expect(featureRoleSummary('/data' as AccessPath, c)).toEqual({
      totalEligible: 2,
      enabledCount: 1,
      blockedRoles: ['HRAdmin'],
      globallyKilled: false,
    });
  });

  it('treats a global kill as blocking every eligible role', () => {
    const c = { ...blankControl('/data'), enabled: false };
    expect(featureRoleSummary('/data' as AccessPath, c)).toEqual({
      totalEligible: 2,
      enabledCount: 0,
      blockedRoles: ['HRAdmin', 'SystemAdmin'],
      globallyKilled: true,
    });
  });
});
