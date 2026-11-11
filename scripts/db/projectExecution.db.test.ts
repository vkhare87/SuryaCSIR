// @vitest-environment node
// Project lifecycle PL3 — funds and execution: the receipts and expenditure
// ledger, reversals, milestones, the timeline and output links, against
// every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `63000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), pme: u('02'), pmeCopi: u('03'), hr: u('04'), other: u('05'), director: u('06') } as const;
const PRJ = 'PRJ-T-1';
const HQ = 'PRJ-T-HQ';
const LEGACY = 'P-OLD';

let db: PGlite;
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows[0];

const doc = (uid: string, project: string, type: string) => as(db, uid, async tx => (await one<{ id: string }>(tx,
  `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name) VALUES ($1, $2, $3, 'x.pdf') RETURNING id`,
  [project, type, `${project}/${type}/x.pdf`]))!.id);

const receipt = async (uid: string, project: string, on: string, amount: number, ifd: string | null = null) => {
  const d = await doc(U.pme, project, 'receipt_order');
  return as(db, uid, async tx => (await one<{ id: string }>(tx,
    `SELECT project_record_receipt($1, $2, $3, NULL, 'Director, CSIR-AMPRI', 'RO/1', $2, $4, $5, $6) AS id`,
    [project, on, amount, ifd, ifd ? on : null, d]))!.id);
};
const spend = async (uid: string, project: string, fy: string, head: string, amount: number) => {
  const d = await doc(U.pme, project, 'expenditure_statement');
  return as(db, uid, async tx => (await one<{ id: string }>(tx,
    `SELECT project_record_expenditure($1, $2, 'FY', $3, $4, $5) AS id`, [project, fy, head, amount, d]))!.id);
};
const stage = async (p: string) => (await one<{ s: string }>(db, `SELECT stage AS s FROM projects WHERE "ProjectID" = $1`, [p]))!.s;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@e.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL), ('${U.pmeCopi}', 'PME', NULL),
      ('${U.hr}', 'HRAdmin', NULL), ('${U.other}', 'Scientist', 'D1'), ('${U.director}', 'Director', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('E-PI', 'Dr PI', 'D1', '${U.pi}'), ('E-PC', 'Dr PME CoPI', 'D1', '${U.pmeCopi}');
    INSERT INTO public.proposals (id, title, pi_user_id, pi_name, created_by, status, track)
      VALUES ('64000000-0000-0000-0000-000000000001', 'Foam', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'ULIP'),
             ('64000000-0000-0000-0000-000000000002', 'HQ foam', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'HQ');
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name) VALUES ('64000000-0000-0000-0000-000000000001', 'E-PC', 'Dr PME CoPI');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "SanctionedCost", stage, track, pi_staff_id, proposal_id, sanction_ref) VALUES
      ('${PRJ}', 'ULIP-T-1', 'Foam', '1000000', 'SANCTIONED', 'ULIP', 'E-PI', '64000000-0000-0000-0000-000000000001', 'AMPRI/1'),
      ('${HQ}',  'FTT040511', 'HQ foam', '500000', 'SANCTIONED', 'HQ', 'E-PI', '64000000-0000-0000-0000-000000000002', 'OM/1'),
      ('${LEGACY}', 'OLP-2023-01', 'Old', '85.00', 'ACTIVE', NULL, NULL, NULL, NULL);
    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, amount) VALUES
      ('${PRJ}', '2027-28', 'EQUIPMENT', 600000), ('${PRJ}', '2027-28', 'CONSUMABLES', 100000),
      ('${PRJ}', '2028-29', 'CONSUMABLES', 300000);
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('receipts', () => {
  it('only PME records them, and not on a project where they are co-PI', async () => {
    await expect(receipt(U.pi, PRJ, '2027-05-10', 100)).rejects.toThrow(/Only PME/);
    await expect(receipt(U.hr, PRJ, '2027-05-10', 100)).rejects.toThrow(/Only PME/);
    await expect(receipt(U.pmeCopi, PRJ, '2027-05-10', 100)).rejects.toThrow(/Only PME/);
  });

  it('need the scanned release order', async () => {
    await expect(as(db, U.pme, tx => tx.query(
      `SELECT project_record_receipt($1, '2027-05-10', 100, NULL, 's', 'RO/1', NULL, NULL, NULL, NULL)`, [PRJ])))
      .rejects.toThrow(/signed scan/);
  });

  it('the first one starts the project, and its financial year comes from the date', async () => {
    expect(await stage(PRJ)).toBe('SANCTIONED');
    await receipt(U.pme, PRJ, '2027-05-10', 700000);
    expect(await stage(PRJ)).toBe('ACTIVE');
    expect((await one<{ fy: string }>(db, `SELECT fiscal_year AS fy FROM project_fund_receipts WHERE project_id = $1`, [PRJ]))!.fy).toBe('2027-28');
  });

  it('cannot take the total past the sanction', async () => {
    await expect(receipt(U.pme, PRJ, '2028-04-15', 400000)).rejects.toThrow(/against a sanction of 1000000/);
    await receipt(U.pme, PRJ, '2028-04-15', 300000);
  });

  it('on the HQ track need the IFD concurrence reference', async () => {
    await expect(receipt(U.pme, HQ, '2027-05-10', 1000)).rejects.toThrow(/IFD concurrence/);
    await receipt(U.pme, HQ, '2027-05-10', 1000, 'IFD/2027/77');
  });

  it('a legacy project with no sanction on record is not capped', async () => {
    await receipt(U.pme, LEGACY, '2027-05-10', 9000000);
  });
});

describe('expenditure and the ledger', () => {
  it('is recorded per year and head, and may exceed the year\'s sanction (flagged, not refused)', async () => {
    await spend(U.pme, PRJ, '2027-28', 'EQUIPMENT', 650000);
    await spend(U.pme, PRJ, '2027-28', 'CONSUMABLES', 40000);
    await expect(spend(U.pi, PRJ, '2027-28', 'CONSUMABLES', 1)).rejects.toThrow(/Only PME/);
  });

  it('cannot be edited or deleted by any client, PME included', async () => {
    await expect(as(db, U.pme, tx => tx.query(`UPDATE project_expenditure SET amount = 1 WHERE project_id = $1`, [PRJ])))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, U.pme, tx => tx.query(`DELETE FROM project_fund_receipts WHERE project_id = $1`, [PRJ])))
      .rejects.toThrow(/permission denied/);
  });

  it('a mistake is corrected by a reversal, once, which keeps the original', async () => {
    const wrong = await spend(U.pme, PRJ, '2027-28', 'CONSUMABLES', 5000);
    const rev = await as(db, U.pme, async tx => (await one<{ id: string }>(tx,
      `SELECT project_reverse_entry('expenditure', $1, 'Entered twice') AS id`, [wrong]))!.id);
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_reverse_entry('expenditure', $1, 'again')`, [wrong])))
      .rejects.toThrow(/already been reversed/);
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_reverse_entry('expenditure', $1, 'x')`, [rev])))
      .rejects.toThrow(/cannot itself be reversed/);
    const rows = (await db.query<{ amount: string }>(
      `SELECT amount::text FROM project_expenditure WHERE id IN ($1, $2) ORDER BY amount`, [wrong, rev])).rows.map(r => r.amount);
    expect(rows).toEqual(['-5000.00', '5000.00']);
  });

  it('worked example: sanctioned · received · spent · balance per year, and per head', async () => {
    const years = (await db.query<Record<string, string>>(`
      WITH s AS (SELECT fiscal_year fy, sum(amount) v FROM project_budget_lines WHERE project_id = $1 GROUP BY 1),
           r AS (SELECT fiscal_year fy, sum(amount) v FROM project_fund_receipts WHERE project_id = $1 GROUP BY 1),
           e AS (SELECT fiscal_year fy, sum(amount) v FROM project_expenditure WHERE project_id = $1 GROUP BY 1)
      SELECT fy, coalesce(s.v,0)::text sanctioned, coalesce(r.v,0)::text received, coalesce(e.v,0)::text spent,
             (coalesce(r.v,0) - coalesce(e.v,0))::text balance
        FROM s FULL JOIN r USING (fy) FULL JOIN e USING (fy) ORDER BY fy`, [PRJ])).rows;
    expect(years).toEqual([
      { fy: '2027-28', sanctioned: '700000.00', received: '700000.00', spent: '690000.00', balance: '10000.00' },
      { fy: '2028-29', sanctioned: '300000.00', received: '300000.00', spent: '0', balance: '300000.00' },
    ]);
    const over = (await db.query<{ head: string }>(`
      SELECT e.head FROM (SELECT head, sum(amount) v FROM project_expenditure WHERE project_id = $1 AND fiscal_year = '2027-28' GROUP BY 1) e
        JOIN project_budget_lines b ON b.project_id = $1 AND b.fiscal_year = '2027-28' AND b.head = e.head
       WHERE e.v > b.amount`, [PRJ])).rows.map(r => r.head);
    expect(over).toEqual(['EQUIPMENT']);
  });

  it('keeps UtilizedAmount equal to the ledger for a sanctioned project, and leaves a legacy one alone', async () => {
    expect((await one<{ u: string }>(db, `SELECT "UtilizedAmount" u FROM projects WHERE "ProjectID" = $1`, [PRJ]))!.u).toBe('690000.00');
    await spend(U.pme, LEGACY, '2027-28', 'OTHER', 10);
    expect((await one<{ u: string | null }>(db, `SELECT "UtilizedAmount" u FROM projects WHERE "ProjectID" = $1`, [LEGACY]))!.u).toBeNull();
  });

  it('is readable by the PI and the Director, not by an unrelated scientist', async () => {
    const n = (uid: string) => as(db, uid, async tx => Number((await one<{ n: number }>(tx,
      `SELECT count(*)::int n FROM project_expenditure WHERE project_id = $1`, [PRJ]))!.n));
    expect(await n(U.pi)).toBeGreaterThan(0);
    expect(await n(U.director)).toBeGreaterThan(0);
    expect(await n(U.other)).toBe(0);
  });
});

describe('milestones', () => {
  it('PI proposes, PME accepts, PI reports with evidence, PME confirms', async () => {
    const id = await as(db, U.pi, async tx => (await one<{ id: string }>(tx,
      `SELECT project_milestone_add($1, 'Foam at 0.25 density', '2027-12-31') AS id`, [PRJ]))!.id);
    const st = async () => (await one<{ s: string }>(db, `SELECT status s FROM project_milestones WHERE id = $1`, [id]))!.s;
    expect(await st()).toBe('PROPOSED');
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_milestone_decide($1, 'ACCEPT', '')`, [id]))).rejects.toThrow(/Only PME/);
    await as(db, U.pme, tx => tx.query(`SELECT project_milestone_decide($1, 'ACCEPT', '')`, [id]));
    expect(await st()).toBe('PLANNED');

    const evidence = await doc(U.pi, PRJ, 'milestone_evidence');
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_milestone_report($1, '2027-12-20', '', $2)`, [id, evidence])))
      .rejects.toThrow(/Only the project's PI/);
    await as(db, U.pi, tx => tx.query(`SELECT project_milestone_report($1, '2027-12-20', 'Done', $2)`, [id, evidence]));
    expect(await st()).toBe('REPORTED');
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_milestone_decide($1, 'RETURN', '')`, [id]))).rejects.toThrow(/Say why/);
    await as(db, U.pme, tx => tx.query(`SELECT project_milestone_decide($1, 'CONFIRM', '')`, [id]));
    expect(await st()).toBe('ACHIEVED');
  });

  it('a PI cannot file a money document, only milestone evidence', async () => {
    await expect(doc(U.pi, PRJ, 'receipt_order')).rejects.toThrow(/row-level security/);
  });
});

describe('timeline', () => {
  it('records every receipt, expenditure, reversal, milestone change and stage change, and is read-only', async () => {
    const kinds = (await db.query<{ kind: string; summary: string }>(
      `SELECT kind, summary FROM project_events WHERE project_id = $1 ORDER BY id`, [PRJ])).rows;
    expect(kinds.map(k => k.kind)).toEqual(expect.arrayContaining(['receipt', 'stage', 'expenditure', 'milestone', 'document']));
    expect(kinds.find(k => k.kind === 'stage')!.summary).toBe('Stage: Sanctioned → Active');
    expect(kinds.some(k => k.summary === 'Received ₹7,00,000 (RO/1)')).toBe(true);
    expect(kinds.some(k => /reversed$/.test(k.summary))).toBe(true);
    await expect(as(db, U.pme, tx => tx.query(`DELETE FROM project_events WHERE project_id = $1`, [PRJ]))).rejects.toThrow(/permission denied/);
  });
});

describe('outputs', () => {
  it('the PI links a publication to their project; an unrelated scientist cannot', async () => {
    await db.exec(`INSERT INTO scientific_outputs (id, title, journal, year, division_code) VALUES ('SO-1', 'Al foam paper', 'J. Mat.', 2028, 'D1')`);
    await expect(as(db, U.other, tx => tx.query(`SELECT project_link_output('publication', 'SO-1', $1)`, [PRJ])))
      .rejects.toThrow(/Only PME or the project's PI/);
    await as(db, U.pi, tx => tx.query(`SELECT project_link_output('publication', 'SO-1', $1)`, [PRJ]));
    expect((await one<{ p: string }>(db, `SELECT project_id p FROM scientific_outputs WHERE id = 'SO-1'`))!.p).toBe(PRJ);
    await as(db, U.pi, tx => tx.query(`SELECT project_link_output('publication', 'SO-1', NULL)`));
    expect((await one<{ p: string | null }>(db, `SELECT project_id p FROM scientific_outputs WHERE id = 'SO-1'`))!.p).toBeNull();
  });
});
