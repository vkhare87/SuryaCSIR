// @vitest-environment node
// The PMS appraisal state machine end to end, plus the negative/positive RLS
// suites, against every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, sqlFile, type Tx } from './pgliteHarness';

const U = {
  sci: '30000000-0000-0000-0000-000000000001',
  ro: '30000000-0000-0000-0000-000000000002',
  rvo: '30000000-0000-0000-0000-000000000003',
  ecm: '30000000-0000-0000-0000-000000000004',
  emp1: '30000000-0000-0000-0000-000000000005',
  emp2: '30000000-0000-0000-0000-000000000006',
  emp3: '30000000-0000-0000-0000-000000000007',
  chair: '30000000-0000-0000-0000-000000000008',
  admin: '30000000-0000-0000-0000-000000000009',
  sci2: '30000000-0000-0000-0000-00000000000a',
  globalEC: '30000000-0000-0000-0000-00000000000b', // EmpoweredCommittee role, no cycle seat
  sci3: '30000000-0000-0000-0000-00000000000c',
} as const;

const CYCLE = '40000000-0000-0000-0000-000000000001';
const COMMITTEE = '40000000-0000-0000-0000-000000000002';
const BARE_CYCLE = '40000000-0000-0000-0000-000000000003'; // no Empowered Committee configured
const R_EMP = '50000000-0000-0000-0000-000000000001';      // awaiting the Empowered Committee
const R_BARE = '50000000-0000-0000-0000-000000000002';     // same, in BARE_CYCLE
const R_OTHER = '50000000-0000-0000-0000-000000000003';    // under review by another panel
// End year next year: the May 15 submission deadline and the Nov 30 lock are
// always ahead of today, so the suite never ages out.
const Y = new Date().getFullYear() + 1;

const rpc = async (tx: Tx, fn: string, args: unknown[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await tx.query<Record<string, unknown>>(`SELECT * FROM public.${fn}(${ph})`, args)).rows;
};
const one = async (tx: Tx | PGlite, sql: string, args: unknown[] = []) =>
  (await tx.query<Record<string, unknown>>(sql, args)).rows[0];
const JUSTIFY = 'The committee weighed every part of the self-appraisal against the plan.';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@t.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    INSERT INTO public.user_roles (user_id, role) VALUES ('${U.admin}', 'HRAdmin'), ('${U.globalEC}', 'EmpoweredCommittee');
    INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
      VALUES ('${CYCLE}', 'PMS test', '${Y - 1}-04-01', '${Y}-03-31', 'OPEN');
    INSERT INTO public.pms_evaluation_committees (id, name, cycle_id, tier)
      VALUES ('${COMMITTEE}', 'Tier I', '${CYCLE}', 'I');
    INSERT INTO public.pms_evaluation_committee_members (committee_id, user_id, role) VALUES
      ('${COMMITTEE}', '${U.ro}', 'REPORTING_OFFICER'),
      ('${COMMITTEE}', '${U.rvo}', 'REVIEWING_OFFICER'),
      ('${COMMITTEE}', '${U.ecm}', 'EC_MEMBER');
    INSERT INTO public.pms_empowered_committee_members (cycle_id, user_id, is_chairman) VALUES
      ('${CYCLE}', '${U.emp1}', false), ('${CYCLE}', '${U.emp2}', false),
      ('${CYCLE}', '${U.emp3}', false), ('${CYCLE}', '${U.chair}', true);
    INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
      VALUES ('${BARE_CYCLE}', 'Bare', '${Y - 1}-04-01', '${Y}-03-31', 'CLOSED');
    INSERT INTO public.pms_reports (id, cycle_id, scientist_id, status) VALUES
      ('${R_EMP}', '${CYCLE}', '${U.rvo}', 'EMPOWERED_COMMITTEE_REVIEW'),
      ('${R_BARE}', '${BARE_CYCLE}', '${U.rvo}', 'EMPOWERED_COMMITTEE_REVIEW'),
      ('${R_OTHER}', '${CYCLE}', '${U.emp2}', 'UNDER_EVALUATION_COMMITTEE_REVIEW');
    INSERT INTO public.pms_report_sections (report_id, section_key, data)
      VALUES ('${R_OTHER}', 'part2', '{}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('SQL RLS suites', () => {
  for (const file of ['rls_negative.sql', 'rls_positive.sql']) {
    it(`runs supabase/tests/${file} green`, async () => {
      const fresh = await migratedDb();
      try { await expect(fresh.exec(sqlFile(`supabase/tests/${file}`))).resolves.toBeDefined(); }
      finally { await fresh.close(); }
    }, 180000);
  }
});

describe('client writes to pms_reports (BUG-01)', () => {
  it('the owner cannot insert a report that is already FINALIZED', async () => {
    await expect(as(db, U.sci2, tx => tx.query(
      `INSERT INTO pms_reports (cycle_id, scientist_id, status) VALUES ($1, $2, 'FINALIZED')`,
      [CYCLE, U.sci2]))).rejects.toThrow();
  });

  it('the owner can still edit the basic info of a DRAFT', async () => {
    const id = await as(db, U.sci2, async tx => {
      const r = await one(tx, `INSERT INTO pms_reports (cycle_id, scientist_id) VALUES ($1, $2) RETURNING id`, [CYCLE, U.sci2]);
      await tx.query(`UPDATE pms_reports SET self_score = 80, period_from = $2, period_to = $3 WHERE id = $1`,
        [r.id, `${Y - 1}-04-01`, `${Y}-03-31`]);
      return r.id;
    });
    const row = await one(db, `SELECT status, self_score FROM pms_reports WHERE id = $1`, [id]);
    expect(row).toEqual({ status: 'DRAFT', self_score: 80 });
  });
});

describe('one full appraisal: draft → submit → assign → evaluate → finalize', () => {
  let reportId: string;
  const status = async () => (await one(db, `SELECT status FROM pms_reports WHERE id = $1`, [reportId])).status;

  it('scientist creates and submits a DRAFT (T24: the definer path still works)', async () => {
    reportId = await as(db, U.sci, async tx => {
      const r = await one(tx, `INSERT INTO pms_reports (cycle_id, scientist_id, period_from, period_to)
                               VALUES ($1, $2, $3, $4) RETURNING id`, [CYCLE, U.sci, `${Y - 1}-04-01`, `${Y}-03-31`]);
      await rpc(tx, 'pms_submit_report', [r.id]);
      return r.id as string;
    });
    expect(await status()).toBe('SUBMITTED');
  });

  it('the owner cannot touch the report once it is SUBMITTED', async () => {
    await as(db, U.sci, tx => tx.query(`UPDATE pms_reports SET self_score = 1 WHERE id = $1`, [reportId]));
    expect((await one(db, `SELECT self_score FROM pms_reports WHERE id = $1`, [reportId])).self_score).toBeNull();
  });

  it('admin assigns the Evaluation Committee', async () => {
    await as(db, U.admin, tx => rpc(tx, 'pms_assign_evaluators', [reportId, COMMITTEE]));
    expect(await status()).toBe('UNDER_EVALUATION_COMMITTEE_REVIEW');
  });

  it('evaluators save and complete their own rows; the last one auto-advances the report', async () => {
    for (const ev of [U.ro, U.rvo, U.ecm]) {
      await as(db, ev, async tx => {
        await tx.query(`UPDATE pms_evaluations SET status = 'IN_PROGRESS', total_score = 82 WHERE evaluator_id = $1`, [ev]);
        await tx.query(`UPDATE pms_evaluations SET status = 'COMPLETED' WHERE evaluator_id = $1`, [ev]);
      });
    }
    expect(await status()).toBe('EMPOWERED_COMMITTEE_REVIEW');
  });

  it('an Empowered Committee member of the cycle finalizes it', async () => {
    await as(db, U.emp1, tx => rpc(tx, 'pms_finalize_report', [reportId, 82, JUSTIFY, null, null, null]));
    const row = await one(db, `SELECT status, score_communicated_at FROM pms_reports WHERE id = $1`, [reportId]);
    expect(row.status).toBe('FINALIZED');
    expect(row.score_communicated_at).not.toBeNull();
  });
});

describe('who may finalize and read (BUG-03)', () => {
  const finalize = (uid: string, report: string) =>
    as(db, uid, tx => rpc(tx, 'pms_finalize_report', [report, 82, JUSTIFY, null, null, null]));
  const visible = (uid: string, sql: string, id: string) =>
    as(db, uid, async tx => (await one(tx, sql, [id])).n);

  it('a global EmpoweredCommittee role without a seat on the cycle cannot finalize', async () => {
    await expect(finalize(U.globalEC, R_EMP)).rejects.toThrow(/Only Empowered Committee members/);
  });

  it('nor read the report', async () => {
    expect(await visible(U.globalEC, `SELECT count(*)::int AS n FROM pms_reports WHERE id = $1`, R_EMP)).toBe(0);
  });

  it('a cycle with no Empowered Committee configured cannot be finalized, even by an admin', async () => {
    await expect(finalize(U.admin, R_BARE)).rejects.toThrow(/configuration is invalid/);
  });

  it('a panel member reads only the reports their panel was assigned, sections included', async () => {
    expect(await visible(U.ro, `SELECT count(*)::int AS n FROM pms_reports WHERE id = $1`, R_OTHER)).toBe(0);
    expect(await visible(U.ro, `SELECT count(*)::int AS n FROM pms_report_sections WHERE report_id = $1`, R_OTHER)).toBe(0);
  });

  it('an Empowered Committee member of the cycle reads the report and its sections', async () => {
    expect(await visible(U.emp1, `SELECT count(*)::int AS n FROM pms_reports WHERE id = $1`, R_OTHER)).toBe(1);
    expect(await visible(U.emp1, `SELECT count(*)::int AS n FROM pms_report_sections WHERE report_id = $1`, R_OTHER)).toBe(1);
  });
});

// Pins the institute's day for one rolled-back transaction, then runs fn as uid.
async function onDay<T>(day: string, uid: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  let err: unknown;
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    try { out = await fn(tx); } catch (e) { err = e; }
    await tx.rollback();
  });
  if (err) throw err;
  return out as T;
}

describe('one clock: the IST day (BUG-05)', () => {
  it('ist_today() is the date in Asia/Kolkata', async () => {
    const r = await one(db, `SELECT public.ist_today() = (now() AT TIME ZONE 'Asia/Kolkata')::date AS ok`);
    expect(r.ok).toBe(true);
  });

  it('30 Nov IST: the server accepts writes; 1 Dec IST: it rejects them', async () => {
    await expect(onDay(`${Y}-11-30`, U.admin, tx => rpc(tx, 'pms_set_duty_days', [R_OTHER, 200]))).resolves.toBeDefined();
    await expect(onDay(`${Y}-12-01`, U.admin, tx => rpc(tx, 'pms_set_duty_days', [R_OTHER, 200]))).rejects.toThrow(/locked/);
  });

  it('the May 15 submission deadline is the IST day', async () => {
    const id = await as(db, U.sci3, async tx => (await one(tx,
      `INSERT INTO pms_reports (cycle_id, scientist_id, period_from, period_to) VALUES ($1, $2, $3, $4) RETURNING id`,
      [CYCLE, U.sci3, `${Y - 1}-04-01`, `${Y}-03-31`])).id as string);
    await expect(onDay(`${Y}-05-15`, U.sci3, tx => rpc(tx, 'pms_submit_report', [id]))).resolves.toBeDefined();
    await expect(onDay(`${Y}-05-16`, U.sci3, tx => rpc(tx, 'pms_submit_report', [id]))).rejects.toThrow(/deadline/);
  });

  it('after the lock no evaluation or AWP write goes through', async () => {
    await expect(onDay(`${Y}-12-01`, U.ro, tx => tx.query(
      `UPDATE pms_evaluations SET comments = 'late' WHERE evaluator_id = $1`, [U.ro]))).rejects.toThrow(/locked/);
    const draft = (await one(db, `SELECT id FROM pms_reports WHERE scientist_id = $1`, [U.sci3])).id;
    await expect(onDay(`${Y}-12-01`, U.sci3, tx => tx.query(
      `INSERT INTO pms_awp_activities (report_id, nature_of_activity, role, time_committed_percentage)
       VALUES ($1, 'R&D', 'lead', 50)`, [draft]))).rejects.toThrow(/locked/);
  });
});
