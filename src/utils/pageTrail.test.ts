import { describe, it, expect } from 'vitest';
import { pageTrail } from './pageTrail';

describe('pageTrail', () => {
  it.each([
    ['/master-admin', [{ label: 'Dashboard' }]],
    ['/projects', [{ label: 'Projects' }]],
    ['/projects/AMPRI%2FRD%2F2021-22%2F0002', [{ label: 'Projects', to: '/projects' }, { label: 'Details' }]],
    ['/staff/analytics', [{ label: 'Human Capital', to: '/staff' }, { label: 'Staff Analytics' }]],
    ['/pms/reports/abc/edit', [{ label: 'Performance Mgmt', to: '/pms' }, { label: 'PMS Reports', to: '/pms/reports' }, { label: 'Edit' }]],
    ['/committees/c1/meetings/m1', [{ label: 'Committees', to: '/committees' }, { label: 'Details' }]],
    ['/pms', [{ label: 'Performance Mgmt' }]],
  ])('%s', (path, expected) => {
    expect(pageTrail(path)).toEqual(expected);
  });
});
