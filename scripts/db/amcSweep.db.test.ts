// @vitest-environment node
// Roadmap WP-2 A1 — the owner and the head are told when an AMC nears its end (20261122000001).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7c600000-0000-0000-0000-0000000000${n}`;
const U = { hod: u('01'), hod2: u('02'), owner: u('03'), otherOwner: u('04') } as const;

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@a.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hod}', 'HOD', 'D1'), ('${U.hod2}', 'HOD', 'D2'),
      ('${U.owner}', 'Scientist', 'D1'), ('${U.otherOwner}', 'Scientist', 'D1');
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.equipment ("UInsID", "Name", "Division", owner_user_id, amc_end_date) VALUES
      ('A-SOON', 'SEM',     'D1', '${U.owner}',      public.ist_today() + 30),
      ('A-GONE', 'XRD',     'D1', NULL,              public.ist_today() - 10),
      ('A-OLD',  'Furnace', 'D1', '${U.otherOwner}', public.ist_today() - 200),
      ('A-FAR',  'TEM',     'D1', '${U.otherOwner}', public.ist_today() + 200),
      ('A-NONE', 'Balance', 'D1', '${U.otherOwner}', NULL);
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('amc_expiry_sweep', () => {
  it('tells the owner and the head of the division once, only inside the window', async () => {
    expect((await db.query<{ n: number }>(`SELECT public.amc_expiry_sweep() n`)).rows[0].n).toBe(3);
    expect((await db.query<{ n: number }>(`SELECT public.amc_expiry_sweep() n`)).rows[0].n).toBe(0);
    const rows = (await db.query<{ user_id: string; title: string }>(
      `SELECT user_id, title FROM notifications WHERE kind = 'amc-expiry' ORDER BY title, user_id`)).rows;
    expect(rows).toEqual([
      { user_id: U.hod, title: 'AMC ended: XRD' },
      { user_id: U.hod, title: 'AMC ends soon: SEM' },
      { user_id: U.owner, title: 'AMC ends soon: SEM' },
    ]);
  });

  it('tells again when the AMC is renewed to a new end date', async () => {
    await db.exec(`UPDATE public.equipment SET amc_end_date = public.ist_today() + 60 WHERE "UInsID" = 'A-SOON'`);
    expect((await db.query<{ n: number }>(`SELECT public.amc_expiry_sweep() n`)).rows[0].n).toBe(2);
  });

  it('cannot be run by a signed-in user', async () => {
    await expect(as(db, U.owner, tx => tx.query(`SELECT public.amc_expiry_sweep()`))).rejects.toThrow(/permission denied/);
  });
});
