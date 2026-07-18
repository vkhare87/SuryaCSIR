import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCESS_MAP, ALL_ROLES } from './access';

// Guards against ACCESS_MAP/App.tsx drift — the "triple source of truth" problem
// the overhaul's T0 collapsed. Every ACCESS_MAP path must be a registered route,
// and role-restricted paths must guard with their own ACCESS_MAP entry.
const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8');

describe('ACCESS_MAP ↔ App.tsx route consistency', () => {
  for (const [path, roles] of Object.entries(ACCESS_MAP)) {
    it(`${path} is a registered route`, () => {
      expect(appSource).toContain(`path="${path}"`);
    });

    if (roles.length < ALL_ROLES.length) {
      it(`${path} guards with ACCESS_MAP['${path}']`, () => {
        const line = appSource.split('\n').find((l) => l.includes(`path="${path}"`)) ?? '';
        expect(line).toContain(`ACCESS_MAP['${path}']`);
      });
    }
  }
});

describe('ACCESS_MAP role scoping decisions', () => {
  const can = (path: keyof typeof ACCESS_MAP, role: string) =>
    (ACCESS_MAP[path] as string[]).includes(role);

  it('unverified users cannot reach Ask SURYA', () => {
    expect(can('/ask', 'DefaultUser')).toBe(false);
    expect(can('/ask', 'Guest')).toBe(false);
    expect(can('/ask', 'Scientist')).toBe(true);
  });

  it('unverified users keep the safe commons', () => {
    for (const path of ['/', '/calendar', '/committees', '/helpdesk'] as const) {
      expect(can(path, 'DefaultUser')).toBe(true);
      expect(can(path, 'Guest')).toBe(true);
    }
  });

  it('HOD gets the division-scoped mini-Director set', () => {
    for (const path of ['/staff', '/projects', '/phd', '/intelligence', '/facilities', '/divisions'] as const) {
      expect(can(path, 'HOD')).toBe(true);
    }
  });

  it('HRAdmin is removed from Partnerships and Explore', () => {
    expect(can('/partnerships', 'HRAdmin')).toBe(false);
    expect(can('/explore', 'HRAdmin')).toBe(false);
  });

  it('FinanceAdmin can see Proposals', () => {
    expect(can('/proposals', 'FinanceAdmin')).toBe(true);
  });
});
