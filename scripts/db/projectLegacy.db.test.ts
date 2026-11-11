// @vitest-environment node
// Project lifecycle PL7 — bringing pre-SURYA projects in: track inference,
// the legacy completion form with opening balances, lessons for projects
// closed before SURYA, and project records becoming PME's.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `6b000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), pme: u('02'), hr: u('03'), sys: u('04'), master: u('05'), other: u('06') } as const;
const RUN = 'P-L-RUN';
const DONE = 'P-L-DONE';
const NEW = 'PRJ-L-NEW';

let db: PGlite;
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows[0];
const doc = (uid: string, project: string, type: string) => as(db, uid, async tx => (await one<{ id: string }>(tx,
  `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name) VALUES ($1, $2, $3, 'x.pdf') RETURNING id`,
  [project, type, `${project}/${type}/x.pdf`]))!.id);
const LINES = [
  { fiscal_year: '2024-25', head: 'EQUIPMENT', amount: 500000 }, { fiscal_year: '2024-25', head: 'CONSUMABLES', amount: 100000 },
  { fiscal_year: '2025-26', head: 'CONSUMABLES', amount: 200000 },
];
const complete = async (uid: string, project: string, over: Partial<Record<string, unknown>> = {}) => {
  const d = await doc(U.pme, project, 'sanction_order');
  const a = { track: 'ULIP', category: null, start: '2024-04-01', end: '2027-03-31', ref: 'AMPRI/OLD/4', date: '2024-03-15', doc: d,
    lines: LINES, received: [{ fiscal_year: '2024-25', amount: 600000 }, { fiscal_year: '2025-26', amount: 150000 }],
    spent: [{ fiscal_year: '2024-25', head: 'EQUIPMENT', amount: 480000 }, { fiscal_year: '2025-26', head: 'CONSUMABLES', amount: 90000 }],
    asOf: '2026-10-31', ...over };
  await as(db, uid, tx => tx.query(`SELECT project_legacy_complete($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12)`,
    [project, a.track, a.category, a.start, a.end, a.ref, a.date, a.doc, JSON.stringify(a.lines), JSON.stringify(a.received),
     JSON.stringify(a.spent), a.asOf]));
};

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@l.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL), ('${U.hr}', 'HRAdmin', NULL),
      ('${U.sys}', 'SystemAdmin', NULL), ('${U.master}', 'MasterAdmin', NULL), ('${U.other}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES ('L-PI', 'Dr PI', 'D1', '${U.pi}');
    INSERT INTO public.proposals (id, title, pi_user_id, pi_name, created_by, status, track)
      VALUES ('6c000000-0000-0000-0000-000000000001', 'New', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'ULIP');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "ProjectStatus", "DivisionCode", pi_staff_id, proposal_id) VALUES
      ('${RUN}', 'OLP-2024-04', 'Red mud bricks', 'Sanctioned', 'D1', 'L-PI', NULL),
      ('${DONE}', 'OLP-2019-02', 'Old sensor', 'Completed', 'D1', 'L-PI', NULL),
      ('${NEW}', 'ULIP-L-1', 'Came through SURYA', 'Active', 'D1', 'L-PI', '6c000000-0000-0000-0000-000000000001');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('track for existing projects', () => {
  it('is read from the HQ project number or category, or an in-house marker; otherwise left for PME', async () => {
    const t = async (no: string, cat: string | null, fund: string | null) =>
      (await one<{ t: string | null }>(db, `SELECT project_infer_track($1, $2, $3) t`, [no, cat, fund]))!.t;
    expect(await t('FTT040511', null, null)).toBe('HQ');
    expect(await t('OLP-1', ' fbr ', null)).toBe('HQ');
    expect(await t('ULIP-2024-3', null, null)).toBe('ULIP');
    expect(await t('AMP-7', null, 'In-house')).toBe('ULIP');
    expect(await t('GAP-0123', 'Sponsored', 'DST')).toBeNull();
  });

  it('legacy projects still to bring in are listed', async () => {
    const rows = await as(db, U.pme, async tx => (await tx.query<{ project_id: string }>(`SELECT project_id FROM project_legacy_pending()`)).rows);
    expect(rows.map(r => r.project_id)).toEqual([RUN]);
  });
});

describe('bringing a running project in', () => {
  it('is PME\'s, with the sanction scan, and only for a project that predates SURYA', async () => {
    await expect(complete(U.pi, RUN)).rejects.toThrow(/Only PME/);
    await expect(complete(U.hr, RUN)).rejects.toThrow(/Only PME/);
    await expect(complete(U.pme, NEW)).rejects.toThrow(/came through SURYA/);
    await expect(complete(U.pme, RUN, { doc: null })).rejects.toThrow(/signed scan/);
    await expect(complete(U.pme, RUN, { track: 'HQ' })).rejects.toThrow(/HQ category/);
    await expect(complete(U.pme, RUN, { spent: [{ fiscal_year: '2024-25', head: 'TRAVEL', amount: 1 }] })).rejects.toThrow(/head/);
  });

  it('records the sanction by head and money to date as marked opening balances', async () => {
    await complete(U.pme, RUN);
    const p = await one<{ track: string; stage: string; s: string; e: string; cost: string; used: string; ref: string }>(db,
      `SELECT track, stage, start_date::text s, end_date::text e, sanctioned_cost::text cost, "UtilizedAmount" used, sanction_ref ref
         FROM projects WHERE "ProjectID" = $1`, [RUN]);
    expect(p).toEqual({ track: 'ULIP', stage: 'ACTIVE', s: '2024-04-01', e: '2027-03-31', cost: '800000', used: '570000', ref: 'AMPRI/OLD/4' });
    const lines = (await db.query<{ source: string }>(`SELECT DISTINCT source FROM project_budget_lines WHERE project_id = $1`, [RUN])).rows;
    expect(lines).toEqual([{ source: 'LEGACY' }]);
    const r = (await db.query<{ received_on: string; opening_balance: boolean }>(
      `SELECT received_on::text, opening_balance FROM project_fund_receipts WHERE project_id = $1 ORDER BY received_on`, [RUN])).rows;
    expect(r).toEqual([{ received_on: '2025-03-31', opening_balance: true }, { received_on: '2026-03-31', opening_balance: true }]);
    expect(Number((await one<{ n: string }>(db, `SELECT count(*) n FROM project_expenditure WHERE project_id = $1 AND opening_balance`, [RUN]))!.n)).toBe(2);
  });

  it('reviews that fell due before then are not overdue; later ones are scheduled', async () => {
    const s = (await db.query<{ status: string; n: string }>(
      `SELECT status, count(*)::text n FROM project_review_slots WHERE project_id = $1 GROUP BY status ORDER BY status`, [RUN])).rows;
    // Apr 2024 – Oct 2026: five half-years closed, each owing a progress
    // report and a review committee.
    expect(s.find(x => x.status === 'CANCELLED')?.n).toBe('10');
    expect(Number(s.find(x => x.status === 'PENDING')?.n)).toBeGreaterThan(0);
    const late = await one<{ n: string }>(db,
      `SELECT count(*) n FROM project_review_slots WHERE project_id = $1 AND status = 'PENDING' AND due_date < '2026-10-31'`, [RUN]);
    expect(Number(late!.n)).toBe(0);
  });

  it('happens once, and leaves a line on the timeline', async () => {
    await expect(complete(U.pme, RUN)).rejects.toThrow(/already been brought in/);
    const ev = await one<{ summary: string }>(db, `SELECT summary FROM project_events WHERE project_id = $1 AND kind = 'legacy'`, [RUN]);
    expect(ev?.summary).toMatch(/^Brought into SURYA: sanction ₹8,00,000 by head, money to 31 Oct 2026/);
    const pending = await as(db, U.pme, async tx => (await tx.query(`SELECT 1 FROM project_legacy_pending()`)).rows.length);
    expect(pending).toBe(0);
  });
});

describe('lessons of a project closed before SURYA', () => {
  it('are recorded without an approval chain and join the institute\'s lessons', async () => {
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_legacy_lessons($1, '{"summary": "Sensor"}')`, [DONE])))
      .rejects.toThrow(/at least one lesson/);
    await as(db, U.pi, tx => tx.query(`SELECT project_legacy_lessons($1, $2::jsonb)`, [DONE,
      JSON.stringify({ summary: 'A gas sensor prototype.', objectives_status: 'MET', what_did_not: 'Humidity drift was never solved.' })]));
    const seen = await as(db, U.other, async tx => (await tx.query<{ what_did_not: string }>(
      `SELECT what_did_not FROM project_lessons WHERE project_id = $1`, [DONE])).rows);
    expect(seen).toEqual([{ what_did_not: 'Humidity drift was never solved.' }]);
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_legacy_lessons($1, '{"summary": "x", "what_worked": "y"}')`, [DONE])))
      .rejects.toThrow(/already on record/);
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_legacy_lessons($1, '{"summary": "x", "what_worked": "y"}')`, [NEW])))
      .rejects.toThrow(/closed before SURYA/);
  });
});

describe('project records are PME\'s', () => {
  const rename = (uid: string) => as(db, uid, async tx => (await tx.query(
    `UPDATE projects SET "ProjectName" = 'Renamed' WHERE "ProjectID" = $1 RETURNING 1`, [NEW])).rows.length);

  it('HRAdmin and SystemAdmin can no longer change a project; PME and MasterAdmin can', async () => {
    expect(await rename(U.hr)).toBe(0);
    expect(await rename(U.sys)).toBe(0);
    expect(await rename(U.pme)).toBe(1);
    expect(await rename(U.master)).toBe(1);
  });
});
