// @vitest-environment node
// notifications_sweep against every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb } from './pgliteHarness';

const SCI = '70000000-0000-0000-0000-000000000001';
const SCI2 = '70000000-0000-0000-0000-000000000002';
const CYCLE = '70000000-0000-0000-0000-000000000003';
const R = '70000000-0000-0000-0000-000000000004';
const R_CONDONED = '70000000-0000-0000-0000-000000000005';
// End year next year, so the cycle's Nov 30 lock is always ahead of today.
const Y = new Date().getFullYear() + 1;

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${SCI}', 's1@t.local'), ('${SCI2}', 's2@t.local');
    INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
      VALUES ('${CYCLE}', 'Sweep', '${Y - 1}-04-01', '${Y}-03-31', 'OPEN');
    INSERT INTO public.pms_reports (id, cycle_id, scientist_id) VALUES
      ('${R}', '${CYCLE}', '${SCI}'), ('${R_CONDONED}', '${CYCLE}', '${SCI2}');
    INSERT INTO public.pms_condonations (report_id, condoned_until, reason, condoned_by)
      VALUES ('${R_CONDONED}', '${Y}-06-20', 'Field deployment in Antarctica', '${SCI}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

// Runs the sweep on a pinned IST day and rolls it back.
async function sweepOn(day: string) {
  let rows: { user_id: string; body: string }[] = [];
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    await tx.query(`SELECT public.notifications_sweep()`);
    rows = (await tx.query<{ user_id: string; body: string }>(
      `SELECT user_id, body FROM notifications WHERE kind = 'pms-draft' ORDER BY user_id`)).rows;
    await tx.rollback();
  });
  return rows;
}

describe('self-appraisal reminder (BUG-08)', () => {
  it('stays quiet near the cycle end date (31 Mar), which is not the deadline', async () => {
    expect(await sweepOn(`${Y}-03-20`)).toEqual([]);
  });

  it('fires within 14 days of 15 May and names 15 May', async () => {
    const rows = await sweepOn(`${Y}-05-05`);
    expect(rows).toEqual([{ user_id: SCI, body: `Complete and submit your appraisal report by 15 May ${Y}` }]);
  });

  it('a condoned report is reminded against its condoned date instead', async () => {
    const rows = await sweepOn(`${Y}-06-10`);
    expect(rows).toEqual([{ user_id: SCI2, body: `Complete and submit your appraisal report by 20 Jun ${Y}` }]);
  });

  it('a same-day re-run adds nothing', async () => {
    await db.transaction(async tx => {
      await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${Y}-05-05'::date $$`);
      const first = (await tx.query<{ n: number }>(`SELECT public.notifications_sweep() AS n`)).rows[0].n;
      const second = (await tx.query<{ n: number }>(`SELECT public.notifications_sweep() AS n`)).rows[0].n;
      expect(first).toBeGreaterThan(0);
      expect(second).toBe(0);
      await tx.rollback();
    });
  });
});
