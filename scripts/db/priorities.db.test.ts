// @vitest-environment node
// Lane 1 SH3 — priorities pinned by a senior (20261114120002).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c300000-0000-0000-0000-0000000000${n}`;
const U = { dir: u('01'), hod: u('02'), ro: u('03'), sci: u('04'), other: u('05'), pi: u('06'), sci2: u('07') } as const;
const LATER = '2099-01-15';

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const pin = (asker: string, assignee: string, title: string, day = LATER, reason = 'Monitoring committee meets Monday') =>
  call<{ id: string }>(asker, `SELECT priority_pin($1, $2, $3, $4::date) id`, [assignee, title, reason, day]).then(r => r[0].id);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@w.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL), ('${U.hod}', 'HOD', 'D1'), ('${U.ro}', 'Scientist', 'D1'),
      ('${U.sci}', 'Scientist', 'D1'), ('${U.other}', 'Scientist', 'D2'), ('${U.pi}', 'Scientist', 'D2'), ('${U.sci2}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", "ReportingID", user_id) VALUES
      ('W-HOD', 'Head One', 'D1', NULL, '${U.hod}'), ('W-RO', 'Officer Two', 'D1', NULL, '${U.ro}'),
      ('W-SCI', 'Rao Three', 'D1', 'W-RO', '${U.sci}'), ('W-OTH', 'Other Four', 'D2', NULL, '${U.other}'),
      ('W-PI', 'Pi Five', 'D2', NULL, '${U.pi}'), ('W-SCI2', 'Sen Six', 'D1', NULL, '${U.sci2}');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id)
      VALUES ('W-P1', 'GAP-91', 'Shield', 'D2', 'W-PI');
    INSERT INTO public.project_staff (id, "StaffName", "ProjectNo", staff_id) VALUES ('w-ps-1', 'Rao Three', 'GAP-91', 'W-SCI');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('who may pin', () => {
  it('the Director, the head, the reporting officer and the PI may; a colleague and the person may not', async () => {
    const may = async (who: string, whom: string) => (await call<{ ok: boolean }>(who, `SELECT priority_may_pin($1) ok`, [whom]))[0].ok;
    expect(await may(U.dir, U.sci)).toBe(true);
    expect(await may(U.hod, U.sci)).toBe(true);
    expect(await may(U.ro, U.sci)).toBe(true);
    expect(await may(U.pi, U.sci)).toBe(true);
    expect(await may(U.other, U.sci)).toBe(false);
    expect(await may(U.sci, U.sci)).toBe(false);
    expect(await may(U.hod, U.other)).toBe(false); // a head of another division
    await expect(pin(U.other, U.sci, 'Send the data')).rejects.toThrow(/only for someone you lead/);
  });

  it('needs a reason of 10 characters and a date that is not past', async () => {
    await expect(pin(U.hod, U.sci2, 'Send it', LATER, 'soon')).rejects.toThrow(/at least 10 characters/);
    await expect(pin(U.hod, U.sci2, 'Send it', '2000-01-01')).rejects.toThrow(/today or later/);
  });
});

describe('the three-priority limit and the clash', () => {
  it('a fourth open priority is refused by name', async () => {
    await pin(U.hod, U.sci, 'One', '2099-01-10');
    await pin(U.ro, U.sci, 'Two', '2099-01-11');
    await pin(U.dir, U.sci, 'Three', '2099-01-10');
    await expect(pin(U.pi, U.sci, 'Four')).rejects.toThrow(/Rao Three already holds 3 priorities\. Withdraw one first\./);
  });

  it('two askers wanting the same day are both told', async () => {
    const n = await q<{ user_id: string }>(db,
      `SELECT user_id FROM notifications WHERE kind = 'work_priority' AND dedupe_key LIKE '%:clash:%' ORDER BY user_id`);
    expect(n.map(r => r.user_id)).toEqual([U.dir, U.hod].sort());
  });
});

describe('the person and the asker', () => {
  it('each sees only their own rows; nobody writes the table directly', async () => {
    expect((await call(U.sci, `SELECT id FROM work_priorities`)).length).toBe(3);
    expect((await call(U.hod, `SELECT id FROM work_priorities`)).length).toBe(1);
    expect(await call(U.other, `SELECT id FROM work_priorities`)).toEqual([]);
    await expect(call(U.sci, `UPDATE work_priorities SET status = 'DONE'`)).rejects.toThrow(/permission denied/);
  });

  it('a new date counts only when the asker accepts it', async () => {
    const id = (await q<{ id: string }>(db, `SELECT id FROM work_priorities WHERE title = 'Two'`))[0].id;
    await expect(call(U.sci, `SELECT priority_push_back($1, 'Tests not done yet', '2099-01-05')`, [id])).rejects.toThrow(/must be after/);
    await call(U.sci, `SELECT priority_push_back($1, 'Tests not done yet', '2099-01-20')`, [id]);
    expect((await q<{ w: string }>(db, `SELECT wanted_by::text w FROM work_priorities WHERE id = $1`, [id]))[0].w).toBe('2099-01-11');
    await expect(call(U.sci, `SELECT priority_answer($1, true)`, [id])).rejects.toThrow(/Not an open priority you asked/);
    await call(U.ro, `SELECT priority_answer($1, true)`, [id]);
    expect((await q<{ w: string; a: string }>(db, `SELECT wanted_by::text w, pushback_answer a FROM work_priorities WHERE id = $1`, [id]))[0])
      .toEqual({ w: '2099-01-20', a: 'ACCEPTED' });
    await expect(call(U.ro, `SELECT priority_answer($1, false)`, [id])).rejects.toThrow(/No new date is waiting/);
  });

  it('only the person marks seen or done; only the asker withdraws; then a slot is free', async () => {
    const id = (await q<{ id: string }>(db, `SELECT id FROM work_priorities WHERE title = 'One'`))[0].id;
    await expect(call(U.hod, `SELECT priority_done($1)`, [id])).rejects.toThrow(/Not an open priority of yours/);
    await call(U.sci, `SELECT priority_seen($1)`, [id]);
    await call(U.sci, `SELECT priority_done($1)`, [id]);
    const three = (await q<{ id: string }>(db, `SELECT id FROM work_priorities WHERE title = 'Three'`))[0].id;
    await expect(call(U.sci, `SELECT priority_withdraw($1)`, [three])).rejects.toThrow(/Not an open priority you asked/);
    await call(U.dir, `SELECT priority_withdraw($1)`, [three]);
    await pin(U.pi, U.sci, 'Four');
    const done = await q<{ n: number }>(db, `SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND dedupe_key = $2`, [U.hod, `priority:${id}:done`]);
    expect(done[0].n).toBe(1);
  });
});
