// @vitest-environment node
// Enterprise P3 — declarations (20261112000013), fund packs and Checklist B
// (…14), CPD half-yearly report (…15), stage gates (…16), logbook (…17).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7a100000-0000-0000-0000-0000000000${n}`;
const U = { chair: u('01'), sec: u('02'), m1: u('03'), m2: u('04'), out: u('05'), pi: u('06'), pme: u('07'), owner: u('08') } as const;
const COMMITTEE = '7a200000-0000-0000-0000-000000000001';
const MEETING = '7a200000-0000-0000-0000-000000000002';
const CR = '7a200000-0000-0000-0000-000000000003';

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;

// Runs fn on a pinned IST day, then rolls back.
async function onDay<T>(day: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    out = await fn(tx);
    await tx.rollback();
  });
  return out as T;
}

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@c.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.chair}', 'Scientist', 'D1'), ('${U.sec}', 'Scientist', 'D1'), ('${U.m1}', 'Scientist', 'D1'),
      ('${U.m2}', 'Scientist', 'D1'), ('${U.out}', 'Scientist', 'D1'), ('${U.pi}', 'Scientist', 'D1'),
      ('${U.pme}', 'PME', NULL), ('${U.owner}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('C-CHAIR', 'Chair', 'D1', '${U.chair}'), ('C-SEC', 'Convener', 'D1', '${U.sec}'), ('C-M1', 'Member One', 'D1', '${U.m1}'),
      ('C-M2', 'Member Two', 'D1', '${U.m2}'), ('C-OUT', 'Outsider', 'D1', '${U.out}'), ('C-PI', 'Dr PI', 'D1', '${U.pi}'),
      ('C-OWN', 'In Charge', 'D1', '${U.owner}');
    INSERT INTO public.committees (id, name, committee_type, chairperson_id, secretary_id)
      VALUES ('${COMMITTEE}', 'Purchase Committee', 'Standing', 'C-CHAIR', 'C-SEC');
    INSERT INTO public.committee_members (committee_id, staff_id) VALUES ('${COMMITTEE}', 'C-M1'), ('${COMMITTEE}', 'C-M2');
    INSERT INTO public.meetings (id, committee_id, meeting_date, title) VALUES ('${MEETING}', '${COMMITTEE}', current_date, 'Q3 purchases');

    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", "ProjectCategory", pi_staff_id) VALUES
      ('C-HQ', 'FTT0101', 'Red mud tiles', 'D1', 'FTT', 'C-PI'),
      ('C-UL', 'ULIP-9', 'In-house rig', 'D1', 'In-house', 'C-PI');
    UPDATE public.projects SET track = 'HQ', stage = 'ACTIVE', start_date = '2025-04-01', end_date = '2028-03-31' WHERE "ProjectID" = 'C-HQ';
    UPDATE public.projects SET track = 'ULIP', stage = 'ACTIVE', start_date = '2025-04-01', end_date = '2027-03-31' WHERE "ProjectID" = 'C-UL';
    DELETE FROM public.project_review_slots WHERE project_id IN ('C-HQ', 'C-UL');
    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, amount) VALUES
      ('C-HQ', '2025-26', 'EQUIPMENT', 500000), ('C-HQ', '2025-26', 'CONSUMABLES', 100000),
      ('C-HQ', '2026-27', 'CONSUMABLES', 200000), ('C-HQ', '2026-27', 'MANPOWER', 100000);
    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, order_no, recorded_by)
      VALUES ('C-HQ', '2025-05-10', '2025-26', 600000, 'OM/101', '${U.pme}');
    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, recorded_by) VALUES
      ('C-HQ', '2025-26', 'FY', 'EQUIPMENT', 450000, '${U.pme}'), ('C-HQ', '2025-26', 'FY', 'CONSUMABLES', 80000, '${U.pme}');
    INSERT INTO public.project_change_requests (id, project_id, kind, status, justification, payload, created_by)
      VALUES ('${CR}', 'C-HQ', 'REPHASING', 'DRAFT', 'Delay in tendering',
              '{"moves": [{"head": "MANPOWER", "from_year": "2025-26", "to_year": "2026-27", "amount": 10000}]}', '${U.pi}');
    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date, status, held_on) VALUES
      ('C-HQ', 'RESEARCH_COUNCIL', 'Research Council', 'RC 1', '2025-11-30', '2025-11-30', 'DONE', '2025-11-28'),
      ('C-HQ', 'MONITORING_COMMITTEE', 'Monitoring Committee', 'MC 1', '2026-02-28', '2026-02-28', 'PENDING', NULL);
    INSERT INTO public.tech_transfers (technology_title, licensee, project_id) VALUES ('Tile process', 'Acme Tiles', 'C-HQ');
    INSERT INTO public.equipment ("UInsID", "Name", "Division", project_id, purchase_cost, owner_user_id) VALUES
      ('EQ-BIG', 'XRD', 'D1', 'C-HQ', 2500000, '${U.owner}'),
      ('EQ-SMALL', 'Balance', 'D1', 'C-HQ', 40000, '${U.owner}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('conflict-of-interest declarations', () => {
  const declare = (uid: string, format: string, note: string | null = null) =>
    as(db, uid, tx => tx.query(`SELECT coi_declare($1, $2, $3)`, [MEETING, format, note]));
  const seen = (uid: string) => as(db, uid, tx => q<{ member_user_id: string }>(tx, `SELECT member_user_id FROM coi_declarations ORDER BY 1`));

  it('members declare; a non-member cannot; Format 2 needs the conflict described', async () => {
    await expect(declare(U.out, 'F1')).rejects.toThrow(/Only a member/);
    await expect(declare(U.m2, 'F2')).rejects.toThrow(/Describe the conflict/);
    await declare(U.m1, 'F1');
    await declare(U.m2, 'F2', 'My brother bids for the tender');
    await declare(U.chair, 'F2', 'Chair consulted for a bidder');
  });

  it('is confidential: the member sees their own; chair and convener see all; others none', async () => {
    expect((await seen(U.m1)).map(r => r.member_user_id)).toEqual([U.m1]);
    expect(await seen(U.chair)).toHaveLength(3);
    expect(await seen(U.sec)).toHaveLength(3);
    expect(await seen(U.out)).toEqual([]);
  });

  it('the chair decides on a Format 2, never on their own; then the member cannot change it', async () => {
    const id = (await q<{ id: string }>(db, `SELECT id FROM coi_declarations WHERE member_user_id = $1`, [U.m2]))[0].id;
    const own = (await q<{ id: string }>(db, `SELECT id FROM coi_declarations WHERE member_user_id = $1`, [U.chair]))[0].id;
    await expect(as(db, U.sec, tx => tx.query(`SELECT coi_chair_decide($1, 'RECUSE')`, [id]))).rejects.toThrow(/Only the chair/);
    await expect(as(db, U.chair, tx => tx.query(`SELECT coi_chair_decide($1, 'CONTINUE')`, [own]))).rejects.toThrow(/own declaration/);
    await as(db, U.chair, tx => tx.query(`SELECT coi_chair_decide($1, 'RECUSE')`, [id]));
    await expect(declare(U.m2, 'F1')).rejects.toThrow(/already decided/);
  });

  it('Annexure 3 lists exactly the recused and Format 2 members', async () => {
    const rows = await as(db, U.sec, tx => q<{ member_user_id: string; chair_decision: string | null }>(tx,
      `SELECT member_user_id, chair_decision FROM coi_declarations
        WHERE meeting_id = $1 AND (format = 'F2' OR chair_decision = 'RECUSE') ORDER BY member_user_id`, [MEETING]));
    expect(rows).toEqual([{ member_user_id: U.chair, chair_decision: null }, { member_user_id: U.m2, chair_decision: 'RECUSE' }]);
  });

  it('cannot be written directly', async () => {
    await expect(as(db, U.chair, tx => tx.query(`UPDATE coi_declarations SET format = 'F1'`))).rejects.toThrow(/permission denied/);
  });
});

describe('fund packs', () => {
  it('the next-year release matches the ledger to the rupee and names the four signatories', async () => {
    const pack = await onDay('2025-12-01', async tx => (await q<{ p: Record<string, any> }>(tx,
      `SELECT project_pack('C-HQ', 'NEXT_YEAR_RELEASE') p`))[0].p);
    // Received 6,00,000; spent 4,50,000 + 80,000 → 70,000 in hand.
    // 2026-27 sanction 3,00,000 − 70,000 = 2,30,000.
    expect(pack.release).toMatchObject({ fiscal_year: '2026-27', sanctioned_for_year: 300000, unspent_cash: 70000, demand: 230000 });
    expect(pack.totals).toMatchObject({ sanctioned: 900000, received: 600000, spent: 530000, unspent_cash: 70000 });
    expect(pack.signatories.map((s: { role: string }) => s.role)).toEqual(['Principal Investigator', 'Head, PME', 'F&AO / CoFA', 'Director']);
    expect(pack.signatories[0].name).toBe('Dr PI');
    expect(pack.orders).toHaveLength(1);
  });

  it('the first release asks for the first year\'s sanction', async () => {
    const pack = (await q<{ p: Record<string, any> }>(db, `SELECT project_pack('C-HQ', 'FIRST_RELEASE') p`))[0].p;
    expect(pack.release).toMatchObject({ fiscal_year: '2025-26', demand: 600000 });
  });

  it('Checklist B fails a rephasing that moves manpower, and the pack carries it', async () => {
    const items = await q<{ item: string; ok: boolean }>(db, `SELECT item, ok FROM project_checklist_b($1)`, [CR]);
    expect(items.find(i => i.item === 'travel_manpower')?.ok).toBe(false);
    expect(items.find(i => i.item === 'rules')?.ok).toBe(false);
    expect(items.find(i => i.item === 'signed_request')?.ok).toBe(false);
    const pack = (await q<{ p: Record<string, any> }>(db, `SELECT project_pack('C-HQ', 'REPHASING', $1) p`, [CR]))[0].p;
    expect(pack.checklist_b.some((c: { ok: boolean }) => !c.ok)).toBe(true);
  });

  it('a project the reader cannot see gives no pack', async () => {
    await expect(as(db, U.out, tx => tx.query(`SELECT project_pack('C-HQ', 'FIRST_RELEASE')`))).rejects.toThrow(/not found/);
  });
});

describe('CPD half-yearly report', () => {
  it('lists every HQ project with reviews held and missed, and no in-house project', async () => {
    const rows = await onDay('2026-04-10', tx => q<{ project_id: string; reviews_due: number; reviews_held: number; reviews_missed: number }>(tx,
      `SELECT project_id, reviews_due, reviews_held, reviews_missed FROM project_cpd_halfyearly('2026-03-31')`));
    expect(rows).toEqual([{ project_id: 'C-HQ', reviews_due: 2, reviews_held: 1, reviews_missed: 1 }]);
  });
});

describe('stage gates', () => {
  const doc = async (key: string) => (await q<{ id: string }>(db,
    `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name, uploaded_by)
     VALUES ('C-HQ', 'stage_deliverable', $1, 'x.pdf', $2) RETURNING id`, [`C-HQ/${key}.pdf`, U.pi]))[0].id;
  const record = async (uid: string, project: string, key: string) => {
    const d = await doc(key);
    return as(db, uid, tx => tx.query(`SELECT project_stage_deliverable_record($1, $2, $3)`, [project, key, d]));
  };

  it('a transfer without the stage-VI papers is flagged until all four are on file', async () => {
    const gaps = async () => as(db, U.pme, tx => q<{ missing: string[] }>(tx, `SELECT missing FROM project_transfer_gaps()`));
    expect((await gaps())[0].missing).toHaveLength(4);
    await expect(record(U.out, 'C-HQ', 'bill_of_materials')).rejects.toThrow(/Only the PI or PME/);
    for (const k of ['bill_of_materials', 'standard_of_preparation', 'supply_chain_plan']) await record(U.pi, 'C-HQ', k);
    expect((await gaps())[0].missing).toEqual(['Logistics documents']);
    await record(U.pme, 'C-HQ', 'logistics_plan');
    expect(await gaps()).toEqual([]);
  });

  it('reads the HQ code from the project number when the category field is words (live data)', async () => {
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo", "ProjectCategory") VALUES
      ('C-MM', 'MMP045201-WP-3', 'Mission Mode '), ('C-RD', 'HCP0054', 'R&D '), ('C-X', 'GAP-0123', 'Sponsored')`);
    const r = await q<{ a: string; b: string; c: string | null }>(db,
      `SELECT project_category('C-MM') a, project_category('C-RD') b, project_category('C-X') c`);
    expect(r[0]).toEqual({ a: 'MMP', b: 'HCP', c: null });
  });

  it('applies to FTT, FTC and MMP only', async () => {
    await expect(record(U.pme, 'C-UL', 'concept_note')).rejects.toThrow(/FTT, FTC and MMP/);
  });
});

describe('equipment logbook', () => {
  it('is required only for a project instrument above the major-equipment threshold', async () => {
    const r = await q<{ big: boolean; small: boolean }>(db,
      `SELECT equipment_logbook_required('EQ-BIG') big, equipment_logbook_required('EQ-SMALL') small`);
    expect(r[0]).toEqual({ big: true, small: false });
  });

  it('the scientist-in-charge logs use; others cannot; entries are never changed', async () => {
    const log = (uid: string) => as(db, uid, tx => tx.query(
      `SELECT equipment_log_usage('EQ-BIG', current_date - 1, 3.5, 'C-PI', 'Phase analysis')`));
    await expect(log(U.out)).rejects.toThrow(/scientist-in-charge/);
    await log(U.owner);
    await expect(as(db, U.owner, tx => tx.query(`UPDATE equipment_usage_log SET hours = 1`))).rejects.toThrow(/permission denied/);
  });

  it('the PME desk counts what is waiting, without reading declarations', async () => {
    const c = await as(db, U.pme, tx => q<Record<string, number>>(tx, `SELECT * FROM pme_compliance_counts()`));
    // The convener never declared. The tile transfer is now complete. EQ-BIG was used yesterday.
    expect(c[0]).toEqual({ declarations_missing: 1, transfers_missing_docs: 0, logbooks_idle: 0 });
    await expect(as(db, U.out, tx => tx.query(`SELECT * FROM pme_compliance_counts()`))).rejects.toThrow(/not authorized/);
    expect(await as(db, U.pme, tx => q(tx, `SELECT 1 FROM coi_declarations`))).toEqual([]);
  });
});
