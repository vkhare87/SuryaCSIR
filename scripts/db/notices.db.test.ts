// @vitest-environment node
// Lane 1 CD4 — notices and office orders (20261114120003).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c400000-0000-0000-0000-0000000000${n}`;
const U = { dir: u('01'), hod: u('02'), sci: u('03'), sci2: u('04'), other: u('05') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const issue = (who: string, title: string, divs: string[] | null, ack = false) =>
  call<{ id: string }>(who, `SELECT notice_issue('OFFICE_ORDER', $1, 'Body text', $2::text[], $3) id`, [title, divs, ack]).then(r => r[0].id);
let allId = '';
let d1Id = '';

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@n.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL), ('${U.hod}', 'HOD', 'D1'), ('${U.sci}', 'Scientist', 'D1'),
      ('${U.sci2}', 'Scientist', 'D1'), ('${U.other}', 'Scientist', 'D2');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('N-SCI', 'Asha Rao', 'D1', '${U.sci}'), ('N-SCI2', 'Bina Sen', 'D1', '${U.sci2}'), ('N-OTH', 'Chand Das', 'D2', '${U.other}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('who issues', () => {
  it('the Director issues to all; a head only to their own division; a scientist not at all', async () => {
    allId = await issue(U.dir, 'Tour claims', null, true);
    d1Id = await issue(U.hod, 'D1 lab safety', ['D1']);
    await expect(issue(U.hod, 'To everyone', null)).rejects.toThrow(/a head issues to their own division/);
    await expect(issue(U.hod, 'To D2', ['D2'])).rejects.toThrow(/a head issues to their own division/);
    await expect(issue(U.sci, 'Mine', ['D1'])).rejects.toThrow(/a head issues to their own division/);
    const nos = await q<{ notice_no: string }>(db, `SELECT notice_no FROM notices ORDER BY created_at`);
    expect(nos.map(n => n.notice_no.replace(/\/\d{4}\//, '/Y/'))).toEqual(['OO/Y/0001', 'OO/Y/0002']);
  });

  it('readers get one message each; the issuer gets none', async () => {
    const n = await q<{ user_id: string }>(db, `SELECT user_id FROM notifications WHERE dedupe_key = $1 ORDER BY user_id`, [`notice:${allId}`]);
    expect(n.map(r => r.user_id)).toEqual([U.hod, U.sci, U.sci2, U.other].sort());
  });
});

describe('who reads', () => {
  it('a division notice is invisible to another division', async () => {
    expect((await call<{ title: string }>(U.other, `SELECT title FROM notices`)).map(r => r.title)).toEqual(['Tour claims']);
    expect((await call(U.sci, `SELECT id FROM notices`)).length).toBe(2);
    await expect(call(U.other, `SELECT notice_mark_read($1)`, [d1Id])).rejects.toThrow(/not addressed to you/);
  });

  it('the issuer sees counts and who has not acknowledged; others do not', async () => {
    await call(U.sci, `SELECT notice_mark_read($1, true)`, [allId]);
    await call(U.sci2, `SELECT notice_mark_read($1)`, [allId]);
    const c = (await call<{ readers: number; read: number; acked: number; not_acked: string[] }>(U.dir, `SELECT * FROM notice_read_counts($1)`, [allId]))[0];
    expect(c).toMatchObject({ readers: 4, read: 2, acked: 1 });
    expect(c.not_acked).toContain('Bina Sen');
    expect(c.not_acked).not.toContain('Asha Rao');
    await expect(call(U.sci, `SELECT * FROM notice_read_counts($1)`, [allId])).rejects.toThrow(/Only the issuer/);
    expect((await call(U.sci2, `SELECT user_id FROM notice_reads`)).length).toBe(1);
  });

  it('a later read never removes an acknowledgement; nobody writes the tables directly', async () => {
    await call(U.sci, `SELECT notice_mark_read($1, false)`, [allId]);
    expect((await q<{ a: boolean }>(db, `SELECT acked_at IS NOT NULL a FROM notice_reads WHERE notice_id = $1 AND user_id = $2`, [allId, U.sci]))[0].a).toBe(true);
    await expect(call(U.sci, `INSERT INTO notice_reads (notice_id, user_id) VALUES ($1, $2)`, [d1Id, U.sci])).rejects.toThrow(/permission denied/);
  });

  it('a replacement marks the old notice', async () => {
    const id = (await call<{ id: string }>(U.dir, `SELECT notice_issue('OFFICE_ORDER', 'Tour claims (revised)', '', NULL, false, NULL, NULL, $1) id`, [allId]))[0].id;
    expect((await q<{ s: string }>(db, `SELECT superseded_by::text s FROM notices WHERE id = $1`, [allId]))[0].s).toBe(id);
    await expect(call(U.hod, `SELECT notice_issue('NOTICE', 'x', '', ARRAY['D1'], false, NULL, NULL, $1)`, [allId])).rejects.toThrow(/Only its issuer/);
  });
});
