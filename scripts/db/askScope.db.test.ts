// @vitest-environment node
// Ask SURYA scope guard: strike sweep + query_log column grants (20261115000001).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb, as } from './pgliteHarness';

const PROBER = '71000000-0000-0000-0000-000000000001';
const HR1 = '71000000-0000-0000-0000-000000000002';
const HR2 = '71000000-0000-0000-0000-000000000003';
const DAY = '2026-11-15';
const YESTERDAY_NOON = '2026-11-14 12:00+05:30';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${PROBER}', 'prober@t.local'), ('${HR1}', 'hr1@t.local'), ('${HR2}', 'hr2@t.local');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${HR1}', 'HRAdmin'), ('${HR2}', 'HRAdmin');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

type Strike = { n: number; reason?: string; at?: string; question?: string };

// Seeds strikes, runs the sweep on a pinned IST day, returns the notices, rolls back.
async function sweep(strikes: Strike[], runs = 1) {
  let rows: { user_id: string; title: string; body: string; dedupe_key: string }[] = [];
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${DAY}'::date $$`);
    for (const s of strikes) {
      await tx.query(
        `INSERT INTO public.query_log (user_id, question, mode, answer, refusal_reason, created_at)
         SELECT $1, $2, 'document', 'x', $3, $4::timestamptz FROM generate_series(1, $5)`,
        [PROBER, s.question ?? 'x', s.reason ?? 'out_of_scope', s.at ?? YESTERDAY_NOON, s.n]);
    }
    for (let i = 0; i < runs; i++) await tx.query(`SELECT public.ask_scope_sweep()`);
    rows = (await tx.query<{ user_id: string; title: string; body: string; dedupe_key: string }>(
      `SELECT user_id, title, body, dedupe_key FROM notifications WHERE kind = 'ask-scope' ORDER BY user_id`)).rows;
    await tx.rollback();
  });
  return rows;
}

describe('ask_scope_sweep', () => {
  it('6 strikes yesterday → one notice per HRAdmin', async () => {
    const rows = await sweep([{ n: 6 }]);
    expect(rows.map(r => r.user_id)).toEqual([HR1, HR2]);
    for (const r of rows) {
      expect(r.dedupe_key).toBe(`ask-scope:${PROBER}:2026-11-14`);
      expect(r.body).toContain('6 refused requests on 14 Nov 2026');
      expect(r.body).toContain('prober@t.local');
    }
  });

  it('5 strikes → no notice', async () => {
    expect(await sweep([{ n: 5 }])).toEqual([]);
  });

  it("'totals_only' and 'no_grounded_answer' rows are not strikes", async () => {
    expect(await sweep([{ n: 9, reason: 'totals_only' }, { n: 9, reason: 'no_grounded_answer' }])).toEqual([]);
  });

  it('strikes are counted per IST day', async () => {
    expect(await sweep([{ n: 3, at: '2026-11-13 23:00+05:30' }, { n: 3, at: '2026-11-14 01:00+05:30' }])).toEqual([]);
  });

  it('a second sweep the same day adds nothing', async () => {
    expect(await sweep([{ n: 6 }], 2)).toHaveLength(2);
  });

  it('the notice does not contain the question text', async () => {
    const rows = await sweep([{ n: 6, question: 'SECRET-PROBE-TEXT' }]);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.title + r.body).not.toContain('SECRET-PROBE-TEXT');
  });
});

describe('query_log grants', () => {
  const canUpdate = async (col: string) => (await db.query<{ ok: boolean }>(
    `SELECT has_column_privilege('authenticated', 'public.query_log', $1, 'UPDATE') AS ok`, [col])).rows[0].ok;

  it('authenticated can update feedback and pinned, nothing else', async () => {
    expect(await canUpdate('feedback')).toBe(true);
    expect(await canUpdate('pinned')).toBe(true);
    for (const col of ['refusal_reason', 'question', 'answer', 'user_id', 'created_at']) {
      expect(await canUpdate(col)).toBe(false);
    }
  });

  it('authenticated cannot execute the sweep', async () => {
    const r = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('authenticated', 'public.ask_scope_sweep()', 'EXECUTE') AS ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});

describe('caller_roles', () => {
  it('returns only the roles of the caller', async () => {
    const rows = await as(db, HR1, async tx =>
      (await tx.query<{ role: string }>(`SELECT role FROM public.caller_roles() ORDER BY role`)).rows);
    // Every new user also gets DefaultUser from the auto-register trigger.
    expect(rows).toEqual([{ role: 'DefaultUser' }, { role: 'HRAdmin' }]);
  });

  it('never returns the roles of another user', async () => {
    const rows = await as(db, PROBER, async tx =>
      (await tx.query<{ role: string }>(`SELECT role FROM public.caller_roles()`)).rows);
    expect(rows).toEqual([{ role: 'DefaultUser' }]);
  });
});
