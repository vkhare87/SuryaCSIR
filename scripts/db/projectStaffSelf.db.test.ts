// @vitest-environment node
// Lane 1 PJ1 — a project staff member reads their own engagement (20261114000001).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c200000-0000-0000-0000-0000000000${n}`;
const U = { pme: u('01'), ravi: u('02'), meera: u('03'), sci: u('04') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
let ravi = '';
let meera = '';

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@s.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pme}', 'PME', NULL), ('${U.ravi}', 'ProjectStaff', NULL), ('${U.meera}', 'ProjectStaff', NULL),
      ('${U.sci}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode")
      VALUES ('SR-1', 'GAP-11', 'One', 'D1'), ('SR-2', 'GAP-12', 'Two', 'D1');
  `);
  ravi = (await q<{ id: string }>(db, `INSERT INTO public.project_staff_persons (name) VALUES ('Ravi K') RETURNING id`))[0].id;
  meera = (await q<{ id: string }>(db, `INSERT INTO public.project_staff_persons (name) VALUES ('Meera S') RETURNING id`))[0].id;
  await db.query(`INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on)
                  VALUES ($1, 'SR-1', 'JRF', '2024-04-01', '2027-03-31'), ($2, 'SR-2', 'PA', '2025-01-01', '2026-12-31')`, [ravi, meera]);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('project staff self read', () => {
  it('an unlinked login sees no engagement', async () => {
    expect(await call(U.ravi, `SELECT id FROM project_engagements`)).toEqual([]);
    expect((await call<{ p: string | null }>(U.ravi, `SELECT project_staff_caller_person() p`))[0].p).toBeNull();
  });

  it('only PME or HR links a login, and one login goes to one person', async () => {
    await expect(call(U.sci, `SELECT project_staff_link_user($1, $2)`, [ravi, U.ravi])).rejects.toThrow(/Only PME or HR/);
    await expect(call(U.ravi, `SELECT project_staff_link_user($1, $2)`, [ravi, U.ravi])).rejects.toThrow(/Only PME or HR/);
    await call(U.pme, `SELECT project_staff_link_user($1, $2)`, [ravi, U.ravi]);
    await expect(call(U.pme, `SELECT project_staff_link_user($1, $2)`, [meera, U.ravi])).rejects.toThrow(/already linked/);
    await call(U.pme, `SELECT project_staff_link_user($1, $2)`, [meera, U.meera]);
  });

  it('a linked person reads their own engagement, person record and tenure, and nobody else\'s', async () => {
    const rows = await call<{ project_id: string }>(U.ravi, `SELECT project_id FROM project_engagements`);
    expect(rows.map(r => r.project_id)).toEqual(['SR-1']);
    expect((await call<{ name: string }>(U.ravi, `SELECT name FROM project_staff_persons`)).map(r => r.name)).toEqual(['Ravi K']);
    const days = (await call<{ d: number }>(U.ravi, `SELECT project_staff_tenure_days($1, '2025-03-31') d`, [ravi]))[0].d;
    expect(days).toBe(365);
    expect(await call(U.ravi, `SELECT id FROM project_staff_persons WHERE id = $1`, [meera])).toEqual([]);
  });

  it('the person still cannot write', async () => {
    await expect(call(U.ravi, `UPDATE project_engagements SET to_on = '2030-01-01'`)).rejects.toThrow(/permission denied/);
    await expect(call(U.ravi, `UPDATE project_staff_persons SET user_id = NULL`)).rejects.toThrow(/permission denied/);
  });
});
