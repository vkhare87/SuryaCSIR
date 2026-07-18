import { describe, it, expect } from 'vitest';
import { featureEnabled, isControllable, UNCONTROLLABLE_PATHS } from './featureControls';
import type { FeatureControl } from '../../types';

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
