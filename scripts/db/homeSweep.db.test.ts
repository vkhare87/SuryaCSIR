// @vitest-environment node
// Lane 1 SH4 — the head is told when a progress report is 7 days late (20261114120004).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7c500000-0000-0000-0000-0000000000${n}`;
const U = { hod: u('01'), hod2: u('02'), sci: u('03') } as const;

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@h.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hod}', 'HOD', 'D1'), ('${U.hod2}', 'HOD', 'D2'), ('${U.sci}', 'Scientist', 'D1');
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode") VALUES
      ('H-1', 'GAP-71', 'Late one', 'D1'), ('H-2', 'GAP-72', 'Closed one', 'D1');
    UPDATE public.projects SET stage = 'CLOSED' WHERE "ProjectID" = 'H-2';
    DELETE FROM public.project_review_slots WHERE project_id IN ('H-1', 'H-2');
    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, generated, status) VALUES
      ('H-1', 'PROGRESS_REPORT', 'PI', 'Q2', public.ist_today() - 40, public.ist_today() - 8,  false, 'PENDING'),
      ('H-1', 'PROGRESS_REPORT', 'PI', 'Q3', public.ist_today() - 20, public.ist_today() - 3,  false, 'PENDING'),
      ('H-1', 'PROGRESS_REPORT', 'PI', 'Q1', public.ist_today() - 90, public.ist_today() - 60, false, 'PENDING'),
      ('H-1', 'PROGRESS_REPORT', 'PI', 'Q0', public.ist_today() - 41, public.ist_today() - 9,  false, 'DONE'),
      ('H-2', 'PROGRESS_REPORT', 'PI', 'Q2', public.ist_today() - 40, public.ist_today() - 8,  false, 'PENDING');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('home_overdue_sweep', () => {
  it('tells the head of the division once, for a report 7 to 37 days late on a running project', async () => {
    expect((await db.query<{ n: number }>(`SELECT public.home_overdue_sweep() n`)).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>(`SELECT public.home_overdue_sweep() n`)).rows[0].n).toBe(0);
    const rows = (await db.query<{ user_id: string; title: string }>(
      `SELECT user_id, title FROM notifications WHERE kind = 'report_overdue_head'`)).rows;
    expect(rows).toEqual([{ user_id: U.hod, title: 'Progress report 7 days late: GAP-71' }]);
  });

  it('cannot be run by a signed-in user', async () => {
    await expect(as(db, U.sci, tx => tx.query(`SELECT public.home_overdue_sweep()`))).rejects.toThrow(/permission denied/);
  });
});
