// @vitest-environment node
// Schema-wide invariants, checked against every real migration
// (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

let db: PGlite;

beforeAll(async () => { db = await migratedDb(); }, 180000);
afterAll(async () => { await db?.close(); });

describe('SECURITY DEFINER hardening (BUG-07)', () => {
  it('every SECURITY DEFINER function in public pins search_path', async () => {
    const r = await db.query<{ fn: string }>(`
      SELECT p.oid::regprocedure::text AS fn
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                          WHERE c LIKE 'search_path=%')
       ORDER BY 1`);
    expect(r.rows.map(x => x.fn)).toEqual([]);
  });
});

describe('schema integrity (BUG-32)', () => {
  const fails = (sql: string) =>
    expect(db.transaction(async tx => { await tx.exec(sql); })).rejects.toThrow();

  it('a ProjectNo is unique', async () => {
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('P-1', 'OLP-0101')`);
    await fails(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('P-2', 'OLP-0101')`);
  });

  it('only one appraisal cycle can be OPEN, and a cycle ends after it starts', async () => {
    await db.exec(`INSERT INTO appraisal_cycles (name, start_date, end_date, status) VALUES ('A', '2030-04-01', '2031-03-31', 'OPEN')`);
    await fails(`INSERT INTO appraisal_cycles (name, start_date, end_date, status) VALUES ('B', '2031-04-01', '2032-03-31', 'OPEN')`);
    await fails(`INSERT INTO appraisal_cycles (name, start_date, end_date, status) VALUES ('C', '2032-04-01', '2032-03-31', 'CLOSED')`);
  });
});

describe('RLS policies call auth.uid() once per statement (WO-6d)', () => {
  it('no policy evaluates a bare auth.uid() per row', async () => {
    const r = await db.query<{ p: string }>(`
      SELECT tablename || '.' || policyname AS p FROM pg_policies
       WHERE schemaname = 'public'
         AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.uid\(\)'
       ORDER BY 1`);
    expect(r.rows.map(x => x.p)).toEqual([]);
  });
});

describe('grant residues (BUG-33)', () => {
  it('clients cannot TRUNCATE, add triggers to, or reference application tables', async () => {
    const r = await db.query<{ t: string }>(`
      SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
           OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
           OR has_table_privilege('authenticated', c.oid, 'REFERENCES'))`);
    expect(r.rows).toEqual([]);
  });

  it('a table created later by the migration login gets read/write grants and no TRUNCATE', async () => {
    await db.exec(`CREATE TABLE public.zz_later (id int)`);
    const r = await db.query<{ sel: boolean; trunc: boolean }>(`
      SELECT has_table_privilege('authenticated', 'public.zz_later', 'SELECT') AS sel,
             has_table_privilege('authenticated', 'public.zz_later', 'TRUNCATE') AS trunc`);
    expect(r.rows[0]).toEqual({ sel: true, trunc: false });
  });
});

describe('pms_resolve_representation (BUG-32 / 6f)', () => {
  const ADMIN = '80000000-0000-0000-0000-000000000001';
  const SCI = '80000000-0000-0000-0000-000000000002';
  const CYCLE = '80000000-0000-0000-0000-000000000003';
  const R_NO_SCORE = '80000000-0000-0000-0000-000000000004';
  const R_DONE = '80000000-0000-0000-0000-000000000005';
  const Y = new Date().getFullYear() + 1;
  const resolve = (report: string, score: number | null) => as(db, ADMIN, tx => tx.query(
    `SELECT public.pms_resolve_representation($1, 'Grounds examined in full by the committee', $2, 'Outstanding', null, null)`,
    [report, score]));

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'a@t.local'), ('${SCI}', 's@t.local');
      INSERT INTO user_roles (user_id, role) VALUES ('${ADMIN}', 'HRAdmin');
      INSERT INTO appraisal_cycles (id, name, start_date, end_date, status)
        VALUES ('${CYCLE}', 'Grievance', '${Y - 1}-04-01', '${Y}-03-31', 'CLOSED');
      INSERT INTO pms_reports (id, cycle_id, scientist_id, status) VALUES
        ('${R_NO_SCORE}', '${CYCLE}', '${SCI}', 'UNDER_GRIEVANCE_REVIEW'),
        ('${R_DONE}', '${CYCLE}', '${ADMIN}', 'UNDER_GRIEVANCE_REVIEW');
      INSERT INTO pms_representations (report_id, scientist_id, grounds, status) VALUES
        ('${R_NO_SCORE}', '${SCI}', 'The evaluation ignored two patents.', 'PENDING'),
        ('${R_DONE}', '${ADMIN}', 'The evaluation ignored two patents.', 'RESOLVED');
    `);
  });

  it('raises instead of logging a revised score that has no decision row to land on', async () => {
    await expect(resolve(R_NO_SCORE, 95)).rejects.toThrow(/no committee score to revise/);
    const row = await db.query<{ status: string }>(`SELECT status FROM pms_reports WHERE id = $1`, [R_NO_SCORE]);
    expect(row.rows[0].status).toBe('UNDER_GRIEVANCE_REVIEW');
  });

  it('will not resolve a representation that is no longer pending', async () => {
    await expect(resolve(R_DONE, null)).rejects.toThrow(/no pending representation/);
  });

  it('still resolves a pending representation without a revised score', async () => {
    await resolve(R_NO_SCORE, null);
    const row = await db.query<{ status: string }>(`SELECT status FROM pms_reports WHERE id = $1`, [R_NO_SCORE]);
    expect(row.rows[0].status).toBe('FINALIZED');
  });
});
