import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCESS_MAP, ALL_ROLES, VERIFIED } from './access';

// Guards against ACCESS_MAP/App.tsx drift — the "triple source of truth" problem
// the overhaul's T0 collapsed. Every ACCESS_MAP path must be a registered route,
// and role-restricted paths must guard with their own key — ProtectedRoute's
// accessPath runs canAccess(), which checks ACCESS_MAP (plus MasterAdmin grants).
const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8');

describe('ACCESS_MAP ↔ App.tsx route consistency', () => {
  for (const [path, roles] of Object.entries(ACCESS_MAP)) {
    it(`${path} is a registered route`, () => {
      expect(appSource).toContain(`path="${path}"`);
    });

    if (roles.length < ALL_ROLES.length) {
      it(`${path} guards with accessPath="${path}"`, () => {
        const line = appSource.split('\n').find((l) => l.includes(`path="${path}"`)) ?? '';
        expect(line).toContain(`accessPath="${path}"`);
      });
    }
  }

  // A typo'd accessPath locks that page for everyone, MasterAdmin included
  // (featureAccessible returns `path in ACCESS_MAP` for MasterAdmin).
  it('every accessPath in App.tsx is an ACCESS_MAP key', () => {
    const used = [...appSource.matchAll(/accessPath="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((p) => !(p in ACCESS_MAP))).toEqual([]);
  });

  it('authoring and admin pages are desktop-only; review pages stay on phones', () => {
    const line = (p: string) => appSource.split('\n').find((l) => l.includes(`path="${p}"`)) ?? '';
    for (const p of ['/data', '/pms/reports/:id/edit', '/proposals/new', '/reports/new', '/explore', '/irins-sync']) {
      expect(line(p)).toContain('desktopOnly');
    }
    for (const p of ['/pms/reports/:id', '/proposals/:id', '/reports/:id', '/pms/evaluate/:evaluationId', '/admin/access-requests']) {
      expect(line(p)).not.toContain('desktopOnly');
    }
  });

  it('every page route has a guard, except the public auth pages', () => {
    const PUBLIC = ['/login', '/setup', '/change-password'];
    const open = appSource.split('\n')
      .filter((l) => /<Route path="\/[^"]+" element=\{<(?!ProtectedRoute|Navigate|Suspense)/.test(l))
      .filter((l) => !PUBLIC.some((p) => l.includes(`path="${p}"`)));
    expect(open.map((l) => l.trim())).toEqual([]);
  });
});

describe('ACCESS_MAP role scoping decisions', () => {
  const can = (path: keyof typeof ACCESS_MAP, role: string) =>
    (ACCESS_MAP[path] as string[]).includes(role);

  it('unverified users cannot reach Ask SURYA', () => {
    expect(can('/ask', 'DefaultUser')).toBe(false);
    expect(can('/ask', 'Guest')).toBe(false);
    expect(can('/ask', 'Scientist')).toBe(true);
  });

  it('unverified users keep only their dashboard and helpdesk', () => {
    for (const path of ['/', '/helpdesk'] as const) {
      expect(can(path, 'DefaultUser')).toBe(true);
      expect(can(path, 'Guest')).toBe(true);
    }
    for (const path of ['/calendar', '/committees'] as const) {
      expect(can(path, 'DefaultUser')).toBe(false);
      expect(can(path, 'Guest')).toBe(false);
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

  it('/work is reachable by every verified role and not by DefaultUser', () => {
    for (const role of VERIFIED) expect(can('/work', role)).toBe(true);
    expect(can('/work', 'DefaultUser')).toBe(false);
  });

  it('FinanceAdmin can see Proposals', () => {
    expect(can('/proposals', 'FinanceAdmin')).toBe(true);
  });
});
