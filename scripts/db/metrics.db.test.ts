// @vitest-environment node
// Enterprise P7 — metric registry, snapshots, project lens, digest (20261113000007).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c300000-0000-0000-0000-0000000000${n}`;
const U = { master: u('01'), hod: u('02'), sci: u('03'), pme: u('04') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const num = (v: unknown) => (v === null ? null : Number(v));
const value = async (uid: string, key: string, scope: object = {}) =>
  num((await call<{ v: string | null }>(uid, `SELECT metric_value($1, $2::jsonb) v`, [key, JSON.stringify(scope)]))[0].v);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@m.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.master}', 'MasterAdmin', NULL), ('${U.hod}', 'HOD', 'D1'), ('${U.sci}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('M-1', 'A', 'D1', '${U.sci}'), ('M-2', 'B', 'D1', NULL), ('M-3', 'C', 'D2', NULL);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('MP-1', 'OLP-1', 'One', 'D1', 'M-1'), ('MP-2', 'OLP-2', 'Two', 'D2', NULL), ('MP-3', 'OLP-3', 'Three', 'D1', NULL);
    UPDATE public.projects SET stage = 'ACTIVE', sanctioned_cost = 1000000 WHERE "ProjectID" IN ('MP-1', 'MP-2');
    INSERT INTO public.phd_students ("EnrollmentNo", "StudentName", "DivisionCode", "CurrentStatus") VALUES
      ('E1', 'S1', 'D1', 'DAC III completed'), ('E2', 'S2', 'D1', 'Thesis Submitted'), ('E3', 'S3', 'D2', NULL);
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('registry', () => {
  it('each metric counts what it says, for the institute and a division', async () => {
    expect(await value(U.master, 'staff_headcount')).toBe(3);
    expect(await value(U.master, 'staff_headcount', { division: 'D1' })).toBe(2);
    expect(await value(U.master, 'projects_active')).toBe(2);
    expect(await value(U.master, 'projects_sanctioned_value', { division: 'D2' })).toBe(1000000);
    expect(await value(U.master, 'projects_utilisation_pct')).toBeNull();
    expect(await value(U.master, 'students_in_progress')).toBe(2);
    await expect(value(U.master, 'drop_table')).rejects.toThrow(/Unknown metric/);
  });

  it('one number in three places: metric_value, metric_table and the snapshot agree', async () => {
    const live = await value(U.master, 'projects_active', { division: 'D1' });
    const table = await call<{ value: string }>(U.master, `SELECT value FROM metric_table() WHERE metric_key = 'projects_active' AND division = 'D1'`);
    await call(U.master, `SELECT metric_snapshot_run('2026-03-31')`);
    const snap = await q<{ value: string }>(db, `SELECT value FROM metric_snapshots WHERE metric_key = 'projects_active' AND scope = '{"division":"D1"}' AND as_on = '2026-03-31'`);
    expect([num(table[0].value), num(snap[0].value)]).toEqual([live, live]);
  });

  it('a snapshot never changes: the 31 March pack prints the same next month', async () => {
    const before = await q(db, `SELECT metric_key, scope, value FROM metric_snapshots WHERE as_on = '2026-03-31' ORDER BY 1, 2::text`);
    await db.exec(`UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = 'MP-3'`);
    await call(U.master, `SELECT metric_snapshot_run('2026-03-31')`);
    expect(await q(db, `SELECT metric_key, scope, value FROM metric_snapshots WHERE as_on = '2026-03-31' ORDER BY 1, 2::text`)).toEqual(before);
    await expect(call(U.sci, `SELECT metric_snapshot_run('2026-04-30')`)).rejects.toThrow(/Only MasterAdmin/);
    await expect(call(U.master, `UPDATE metric_snapshots SET value = 0`)).rejects.toThrow(/permission denied/);
  });

  it('an account with no role yet reads no numbers (20261113000011)', async () => {
    const nobody = u('09');
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${nobody}', '09@m.local')`);
    expect(await call(nobody, `SELECT 1 FROM metric_snapshots`)).toEqual([]);
    expect(await call(nobody, `SELECT 1 FROM metrics`)).toEqual([]);
    expect((await call(U.sci, `SELECT 1 FROM metrics`)).length).toBeGreaterThan(0);
  });
});

describe('project lens', () => {
  it('the PI or PME sets theme and TRL; others cannot', async () => {
    await call(U.sci, `SELECT project_set_lens('MP-1', '03', 6, 4)`);
    expect(await q(db, `SELECT theme_code, trl_target, trl_reached FROM projects WHERE "ProjectID" = 'MP-1'`)).toEqual([{ theme_code: '03', trl_target: 6, trl_reached: 4 }]);
    await call(U.pme, `SELECT project_set_lens('MP-2', '01', 5, NULL)`);
    await expect(call(U.sci, `SELECT project_set_lens('MP-2', '01', 5, 5)`)).rejects.toThrow(/Only PME or the PI/);
    await expect(call(U.pme, `SELECT project_set_lens('MP-2', '01', 12, NULL)`)).rejects.toThrow(/check/);
  });
});

describe('digest', () => {
  it('posts one weekly note per reader, scoped to the HoD division, once a week', async () => {
    const n = (await q<{ n: number }>(db, `SELECT metric_digest_run() n`))[0].n;
    expect(n).toBe(3);
    const hod = await q<{ title: string; body: string }>(db, `SELECT title, body FROM notifications WHERE user_id = $1 AND kind = 'metric-digest'`, [U.hod]);
    expect(hod[0].title).toBe('Weekly numbers · D1');
    expect(hod[0].body).toContain('Staff 2');
    expect((await q<{ n: number }>(db, `SELECT metric_digest_run() n`))[0].n).toBe(0);
  });
});
