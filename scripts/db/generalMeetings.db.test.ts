// @vitest-environment node
// Lane 1 CD10 — ordinary meetings (20261114120006).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c700000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), a: u('02'), b: u('03'), out: u('04') } as const;
const START = '2099-03-02T05:00:00Z';
const END = '2099-03-02T06:00:00Z';

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const create = (who: string, invitees: string[], title = 'Team review', link: string | null = null) =>
  call<{ id: string }>(who, `SELECT general_meeting_create($1, $2, $3, 'Room 12', $4, 'Results', $5::uuid[]) id`, [title, START, END, link, invitees])
    .then(r => r[0].id);
let id = '';

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(x => `('${x}', '${x.slice(-2)}@g.local')`).join(', ');
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ${users};`);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('general meetings', () => {
  it('anyone with a login calls a meeting; bad times and links are refused', async () => {
    await expect(call(U.pi, `SELECT general_meeting_create('x', $1, $1, '', NULL, '', $2::uuid[])`, [START, [U.a]])).rejects.toThrow(/end after it starts/);
    await expect(create(U.pi, [U.a], 'x', 'javascript:alert(1)')).rejects.toThrow(/https:\/\//);
    await expect(create(U.pi, [])).rejects.toThrow(/at least one person/);
    id = await create(U.pi, [U.a, U.b, U.pi]);
    expect((await q<{ n: number }>(db, `SELECT count(*)::int n FROM general_meeting_invitees WHERE meeting_id = $1`, [id]))[0].n).toBe(2);
    expect((await q<{ n: number }>(db, `SELECT count(*)::int n FROM notifications WHERE dedupe_key = $1`, [`gmeeting:${id}`]))[0].n).toBe(2);
  });

  it('only the organiser and the invitees read it', async () => {
    expect((await call(U.a, `SELECT id FROM general_meetings`)).length).toBe(1);
    expect((await call(U.a, `SELECT user_id FROM general_meeting_invitees`)).length).toBe(2);
    expect(await call(U.out, `SELECT id FROM general_meetings`)).toEqual([]);
    expect(await call(U.out, `SELECT user_id FROM general_meeting_invitees`)).toEqual([]);
  });

  it('an invitee replies; others cannot reply for them', async () => {
    await call(U.a, `SELECT general_meeting_reply($1, 'NO')`, [id]);
    await expect(call(U.out, `SELECT general_meeting_reply($1, 'YES')`, [id])).rejects.toThrow(/not invited/);
  });

  it('busy times show who is in a meeting, without the title; a no reply frees the person', async () => {
    const busy = await call<{ user_id: string }>(U.out, `SELECT user_id FROM general_meeting_busy($1::uuid[], $2, $3) ORDER BY user_id`,
      [[U.a, U.b, U.pi], '2099-03-02T00:00:00Z', '2099-03-03T00:00:00Z']);
    expect(busy.map(r => r.user_id)).toEqual([U.pi, U.b].sort());
  });

  it('names the organiser in the message, and limits how many meetings one person calls in an hour', async () => {
    const t = await q<{ title: string }>(db, `SELECT title FROM notifications WHERE dedupe_key = $1 LIMIT 1`, [`gmeeting:${id}`]);
    expect(t[0].title).toBe('Meeting called by 01@g.local: Team review');
    for (let i = 0; i < 20; i += 1) await create(U.out, [U.a], `Spam ${i}`);
    await expect(create(U.out, [U.a], 'Spam 21')).rejects.toThrow(/20 meetings in the last hour/); // the 21st
  });

  it('only the organiser cancels', async () => {
    await expect(call(U.a, `SELECT general_meeting_cancel($1)`, [id])).rejects.toThrow(/Only the organiser/);
    await call(U.pi, `SELECT general_meeting_cancel($1)`, [id]);
    expect(await call(U.out, `SELECT * FROM general_meeting_busy($1::uuid[], $2, $3)`, [[U.b], '2099-03-02T00:00:00Z', '2099-03-03T00:00:00Z'])).toEqual([]);
    await expect(call(U.pi, `UPDATE general_meetings SET title = 'x'`)).rejects.toThrow(/permission denied/);
  });
});
