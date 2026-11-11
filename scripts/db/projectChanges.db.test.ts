// @vitest-environment node
// Project lifecycle PL5 — change requests: every prohibition in the
// guidelines (§6.4, §7.2) refused by the RPC, the route per kind and track,
// who may act, and each approved change's effect on the project.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `67000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), copi: u('02'), pme: u('03'), finance: u('04'), director: u('05'), other: u('06') } as const;
const ULIP = 'PRJ-C-ULIP';
const HQ = 'PRJ-C-HQ';

let db: PGlite;
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows[0];

const doc = (uid: string, project: string, type: string) => as(db, uid, async tx => (await one<{ id: string }>(tx,
  `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name) VALUES ($1, $2, $3, 'x.pdf') RETURNING id`,
  [project, type, `${project}/${type}/x.pdf`]))!.id);

const draft = (uid: string, project: string, kind: string, payload: object, why = 'Furnace delivery slipped') =>
  as(db, uid, async tx => (await one<{ id: string }>(tx,
    `SELECT project_change_save(NULL, $1, $2, $3, $4::jsonb) AS id`, [project, kind, why, JSON.stringify(payload)]))!.id);

const submit = async (uid: string, project: string, id: string) => {
  const d = await doc(uid, project, 'change_request');
  await as(db, uid, tx => tx.query(`SELECT project_change_submit($1, $2)`, [id, d]));
};

const raise = async (project: string, kind: string, payload: object) => {
  const id = await draft(U.pi, project, kind, payload);
  await submit(U.pi, project, id);
  return id;
};

const steps = async (id: string) => (await db.query<{ id: string; kind: string; status: string }>(
  `SELECT s.id, s.kind, s.status FROM project_change_steps s JOIN project_change_requests r ON r.id = s.change_id AND s.round = r.round
    WHERE s.change_id = $1 ORDER BY s.seq`, [id])).rows;

const OWNER: Record<string, string> = { FINANCE: U.finance, DIRECTOR_APPROVAL: U.director, DIRECTOR_FORWARD: U.director };
const record = async (uid: string, project: string, stepId: string, decision: string, notes = '',
                      order: [string, string, string | null, string | null] | null = null) => {
  const d = await doc(uid, project, 'change_order');
  await as(db, uid, tx => tx.query(
    `SELECT project_change_record_step($1, $2, $3, $4, NULL, $5, $6, $7, $8)`,
    [stepId, decision, notes, d, order?.[0] ?? null, order?.[1] ?? null, order?.[2] ?? null, order?.[3] ?? null]));
};
const approveAll = async (project: string, id: string, order: [string, string, string, string] | null = null) => {
  for (const s of await steps(id)) {
    if (s.status !== 'PENDING') continue;
    await record(OWNER[s.kind] ?? U.pme, project, s.id, 'APPROVE', '', order);
  }
};
const status = async (id: string) => (await one<{ s: string }>(db, `SELECT status s FROM project_change_requests WHERE id = $1`, [id]))!.s;
const cell = async (project: string, fy: string, head: string) => Number((await one<{ n: string }>(db,
  `SELECT coalesce(sum(amount), 0) n FROM project_budget_lines WHERE project_id = $1 AND fiscal_year = $2 AND head = $3`,
  [project, fy, head]))!.n);
const total = async (project: string) => Number((await one<{ n: string }>(db,
  `SELECT coalesce(sum(amount), 0) n FROM project_budget_lines WHERE project_id = $1`, [project]))!.n);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@c.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.copi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL),
      ('${U.finance}', 'FinanceAdmin', NULL), ('${U.director}', 'Director', NULL), ('${U.other}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('C-PI', 'Dr PI', 'D1', '${U.pi}'), ('C-CO', 'Dr CoPI', 'D1', '${U.copi}');
    INSERT INTO public.proposals (id, title, pi_user_id, pi_name, created_by, status, track) VALUES
      ('68000000-0000-0000-0000-000000000001', 'Foam', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'ULIP'),
      ('68000000-0000-0000-0000-000000000002', 'Coating', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'HQ');
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name) VALUES
      ('68000000-0000-0000-0000-000000000001', 'C-CO', 'Dr CoPI'), ('68000000-0000-0000-0000-000000000002', 'C-CO', 'Dr CoPI');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "StartDate", "CompletioDate", "SanctionedCost", "DivisionCode",
                                 stage, track, pi_staff_id, proposal_id, sanction_ref) VALUES
      ('${ULIP}', 'ULIP-C-1', 'Foam', '2027-04-01', '2029-03-31', '1250000', 'D1', 'ACTIVE', 'ULIP', 'C-PI', '68000000-0000-0000-0000-000000000001', 'AMPRI/1'),
      ('${HQ}', 'FTT040512', 'Coating', '2027-04-01', '2029-03-31', '1000000', 'D1', 'ACTIVE', 'HQ', 'C-PI', '68000000-0000-0000-0000-000000000002', 'OM/1');
    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, amount) VALUES
      ('${ULIP}', '2027-28', 'EQUIPMENT', 600000), ('${ULIP}', '2027-28', 'CONSUMABLES', 100000),
      ('${ULIP}', '2027-28', 'TA_INDIA', 50000),   ('${ULIP}', '2027-28', 'MANPOWER', 200000),
      ('${ULIP}', '2028-29', 'CONSUMABLES', 300000),
      ('${HQ}', '2027-28', 'EQUIPMENT', 600000), ('${HQ}', '2027-28', 'CONSUMABLES', 200000),
      ('${HQ}', '2028-29', 'CONSUMABLES', 200000);
    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, recorded_by) VALUES
      ('${ULIP}', '2027-28', 'FY', 'EQUIPMENT', 500000, '${U.pme}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('every prohibition in the guidelines is refused by the RPC', () => {
  const refused = (project: string, kind: string, payload: object, msg: RegExp) =>
    expect(raise(project, kind, payload)).rejects.toThrow(msg);

  it('unspent travel cannot be rephased (§7.2)', () =>
    refused(ULIP, 'REPHASING', { moves: [{ head: 'TA_INDIA', from_year: '2027-28', to_year: '2028-29', amount: 10000 }] }, /travel and project manpower/));
  it('unspent project manpower cannot be rephased (§7.2)', () =>
    refused(ULIP, 'REPHASING', { moves: [{ head: 'MANPOWER', from_year: '2027-28', to_year: '2028-29', amount: 10000 }] }, /travel and project manpower/));
  it('rephasing only carries money forward', () =>
    refused(ULIP, 'REPHASING', { moves: [{ head: 'CONSUMABLES', from_year: '2028-29', to_year: '2027-28', amount: 10000 }] }, /later year/));
  it('Capital cannot be re-appropriated to Revenue (§7.2)', () =>
    refused(ULIP, 'REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'EQUIPMENT', to_head: 'CONSUMABLES', amount: 10000 }] }, /Capital cannot be re-appropriated/));
  it('nor Revenue to Capital (§7.2)', () =>
    refused(ULIP, 'REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'CONSUMABLES', to_head: 'WORKS', amount: 10000 }] }, /Capital cannot be re-appropriated/));
  it('the travel provision cannot be augmented (§7.2)', () =>
    refused(ULIP, 'REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'CONSUMABLES', to_head: 'TA_ABROAD', amount: 10000 }] }, /travel provision cannot be augmented/));
  it('only unspent money moves: ₹1,00,000 of equipment is unspent, not ₹2,00,000', () =>
    refused(ULIP, 'REPHASING', { moves: [{ head: 'EQUIPMENT', from_year: '2027-28', to_year: '2028-29', amount: 200000 }] }, /Only unspent money can move: equipment in 2027-28/));
  it('reallocation is between laboratories of an HQ project', () =>
    refused(ULIP, 'REALLOCATION', { lab: 'CSIR-NML', direction: 'IN', lines: [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 1 }] }, /participating laboratories/));
  it('reallocated money only for items approved under the project (§7.2)', () =>
    refused(HQ, 'REALLOCATION', { lab: 'CSIR-NML', direction: 'IN', lines: [{ fiscal_year: '2027-28', head: 'WORKS', amount: 50000 }] }, /items approved under the project/));
  it('a revised cost estimate must raise the cost', () =>
    refused(HQ, 'RCE', { lines: [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 900000 }] }, /raises the cost/));
  it('a time overrun moves the end date later', () =>
    refused(HQ, 'TIME_OVERRUN', { new_end_date: '2028-12-31' }, /after the current one/));
  it('a foreclosure needs a cost-benefit analysis (§6.4)', () =>
    refused(HQ, 'FORECLOSURE', { effective_date: '2028-06-30', cost_benefit: ' ' }, /cost-benefit/));
});

describe('who raises and who sees', () => {
  it('the PI or PME raises; a co-PI or another scientist cannot', async () => {
    await expect(draft(U.copi, ULIP, 'TIME_OVERRUN', {})).rejects.toThrow(/Only the PI or PME/);
    await expect(draft(U.other, ULIP, 'TIME_OVERRUN', {})).rejects.toThrow(/Only the PI or PME/);
    await expect(doc(U.copi, ULIP, 'change_request')).rejects.toThrow(/row-level security/);
  });

  it('a co-PI can open the project file (read-only), whatever their division role', async () => {
    const n = await as(db, U.copi, async tx => (await tx.query(`SELECT 1 FROM projects WHERE "ProjectID" = $1`, [ULIP])).rows.length);
    expect(n).toBe(1);
    const other = await as(db, U.other, async tx => (await tx.query(`SELECT 1 FROM projects WHERE "ProjectID" = $1`, [ULIP])).rows.length);
    expect(other).toBe(0);
  });

  it('a draft is private to its author; once submitted the project office sees it', async () => {
    const id = await draft(U.pi, ULIP, 'TIME_OVERRUN', { new_end_date: '2029-09-30' });
    const seen = (uid: string) => as(db, uid, async tx => (await tx.query(`SELECT 1 FROM project_change_requests WHERE id = $1`, [id])).rows.length);
    expect(await seen(U.pme)).toBe(0);
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_change_submit($1, NULL)`, [id]))).rejects.toThrow(/signed scan/);
    await submit(U.pi, ULIP, id);
    expect(await seen(U.pme)).toBe(1);
    expect(await seen(U.copi)).toBe(1);
    await as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [id]));
    expect(await status(id)).toBe('WITHDRAWN');
  });

  it('one request in review at a time', async () => {
    const a = await raise(ULIP, 'TIME_OVERRUN', { new_end_date: '2029-09-30' });
    await expect(raise(ULIP, 'TIME_OVERRUN', { new_end_date: '2029-12-31' })).rejects.toThrow(/one at a time/);
    await as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [a]));
  });

  it('clients cannot write requests, steps or the sanction directly', async () => {
    await expect(as(db, U.pme, tx => tx.query(
      `INSERT INTO project_budget_lines (project_id, fiscal_year, head, amount) VALUES ($1, '2027-28', 'OTHER', 1)`, [ULIP])))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, U.pme, tx => tx.query(`UPDATE project_change_requests SET status = 'APPROVED'`)))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_change_apply(gen_random_uuid())`)))
      .rejects.toThrow(/permission denied/);
  });
});

describe('the route per kind and track', () => {
  it('ULIP: PME, the review committee, the Director', async () => {
    const id = await raise(ULIP, 'TIME_OVERRUN', { new_end_date: '2029-09-30' });
    expect((await steps(id)).map(s => s.kind)).toEqual(['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']);
    await as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [id]));
  });

  it('HQ RCE up to 20%: Finance, Director, the competent authority', async () => {
    const id = await raise(HQ, 'RCE', { lines: [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 700000 },
      { fiscal_year: '2027-28', head: 'CONSUMABLES', amount: 200000 }, { fiscal_year: '2028-29', head: 'CONSUMABLES', amount: 200000 }] });
    expect(Number((await one<{ p: string }>(db, `SELECT increase_pct p FROM project_change_requests WHERE id = $1`, [id]))!.p)).toBe(10);
    expect((await steps(id)).map(s => s.kind)).toEqual(['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']);
    await as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [id]));
  });

  it('HQ RCE beyond 20%: adds the Monitoring Committee and the Revised Cost Committee (§6.4)', async () => {
    const id = await raise(HQ, 'RCE', { lines: [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 900000 },
      { fiscal_year: '2027-28', head: 'CONSUMABLES', amount: 200000 }, { fiscal_year: '2028-29', head: 'CONSUMABLES', amount: 200000 }] });
    expect((await steps(id)).map(s => s.kind)).toEqual(
      ['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'MONITORING_COMMITTEE', 'REVISED_COST_COMMITTEE', 'COMPETENT_AUTHORITY']);
    await as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [id]));
  });

  it('each step by its owner, in order, never by a party', async () => {
    const id = await raise(HQ, 'REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'CONSUMABLES', to_head: 'OUTSOURCING', amount: 50000 }] });
    const [pme, fin] = await steps(id);
    await expect(record(U.director, HQ, fin.id, 'APPROVE')).rejects.toThrow(/cannot record this step/);
    await expect(record(U.finance, HQ, fin.id, 'APPROVE')).rejects.toThrow(/earlier step is still pending/);
    await expect(record(U.pi, HQ, pme.id, 'APPROVE')).rejects.toThrow(/row-level security|cannot record/);
    await record(U.pme, HQ, pme.id, 'APPROVE');
    expect(await status(id)).toBe('UNDER_REVIEW');
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_change_withdraw($1)`, [id]))).rejects.toThrow(/Review has started/);
    expect((await as(db, U.finance, tx => tx.query<{ step_kind: string }>(`SELECT step_kind FROM my_change_steps()`))).rows)
      .toEqual([{ step_kind: 'FINANCE' }]);
  });

  it('on HQ the last order must carry the IFD concurrence reference (§7.2); then the money moves', async () => {
    const id = (await one<{ id: string }>(db, `SELECT id FROM project_change_requests WHERE project_id = $1 AND status = 'UNDER_REVIEW'`, [HQ]))!.id;
    const rest = (await steps(id)).filter(s => s.status === 'PENDING');
    for (const s of rest.slice(0, -1)) await record(OWNER[s.kind] ?? U.pme, HQ, s.id, 'APPROVE');
    const last = rest.at(-1)!;
    await expect(record(U.pme, HQ, last.id, 'APPROVE', '', ['OM/2', '2027-11-01', null, null])).rejects.toThrow(/IFD concurrence/);
    await record(U.pme, HQ, last.id, 'APPROVE', '', ['OM/2', '2027-11-01', 'IFD/77', '2027-10-28']);
    expect(await status(id)).toBe('APPROVED');
    expect(await cell(HQ, '2027-28', 'CONSUMABLES')).toBe(150000);
    expect(await cell(HQ, '2027-28', 'OUTSOURCING')).toBe(50000);
    expect(await total(HQ)).toBe(1000000);
  });
});

describe('effects of an approved change', () => {
  it('rephasing carries unspent equipment money forward, as signed lines naming the change', async () => {
    const id = await raise(ULIP, 'REPHASING', { moves: [{ head: 'EQUIPMENT', from_year: '2027-28', to_year: '2028-29', amount: 100000 }] });
    await approveAll(ULIP, id);
    expect(await status(id)).toBe('APPROVED');
    expect(await cell(ULIP, '2027-28', 'EQUIPMENT')).toBe(500000);
    expect(await cell(ULIP, '2028-29', 'EQUIPMENT')).toBe(100000);
    expect(await total(ULIP)).toBe(1250000);
    expect((await db.query(`SELECT 1 FROM project_budget_lines WHERE change_request_id = $1`, [id])).rows.length).toBe(2);
    const ev = await one<{ summary: string }>(db, `SELECT summary FROM project_events WHERE ref_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
    expect(ev?.summary).toMatch(/Change request \(rephasing\) approved/);
    const n = await one<{ title: string }>(db, `SELECT title FROM notifications WHERE user_id = $1 AND kind = 'project_change_decided'`, [U.pi]);
    expect(n?.title).toMatch(/approved: ULIP-C-1/);
  });

  it('the rules are checked again at approval: spending since submission can make a move impossible', async () => {
    const id = await raise(ULIP, 'REAPPROPRIATION', { moves: [{ fiscal_year: '2027-28', from_head: 'CONSUMABLES', to_head: 'OTHER', amount: 80000 }] });
    await db.query(`INSERT INTO project_expenditure (project_id, fiscal_year, period, head, amount, recorded_by)
                    VALUES ($1, '2027-28', 'Q3', 'CONSUMABLES', 50000, $2)`, [ULIP, U.pme]);
    await expect(approveAll(ULIP, id)).rejects.toThrow(/Only unspent money can move: consumables/);
    expect(await cell(ULIP, '2027-28', 'OTHER')).toBe(0);
    const last = (await steps(id)).at(-1)!;
    await record(U.director, ULIP, last.id, 'REJECT', 'Consumables now committed');
    expect(await status(id)).toBe('REJECTED');
  });

  it('returned to the PI, revised and resubmitted as a new round', async () => {
    const id = await raise(ULIP, 'TIME_OVERRUN', { new_end_date: '2029-09-30' });
    const [pme] = await steps(id);
    await expect(record(U.pme, ULIP, pme.id, 'RETURN')).rejects.toThrow(/what needs to change/);
    await record(U.pme, ULIP, pme.id, 'RETURN', 'Attach the vendor letter');
    expect(await status(id)).toBe('RETURNED');
    await as(db, U.pi, tx => tx.query(`SELECT project_change_save($1, $2, 'TIME_OVERRUN', 'Vendor letter attached', '{"new_end_date":"2029-09-30"}')`, [id, ULIP]));
    await submit(U.pi, ULIP, id);
    expect((await one<{ round: number }>(db, `SELECT round FROM project_change_requests WHERE id = $1`, [id]))!.round).toBe(2);
    await approveAll(ULIP, id);
    expect((await one<{ e: string; t: string }>(db, `SELECT end_date::text e, "CompletioDate" t FROM projects WHERE "ProjectID" = $1`, [ULIP])))
      .toEqual({ e: '2029-09-30', t: '2029-09-30' });
    expect((await db.query(`SELECT 1 FROM project_review_slots WHERE project_id = $1 AND period_label = 'H1 2029-30'`, [ULIP])).rows.length)
      .toBeGreaterThan(0);
  });

  it('a revised cost estimate raises the sanction, so more money can be received', async () => {
    const id = await raise(HQ, 'RCE', { lines: [{ fiscal_year: '2027-28', head: 'EQUIPMENT', amount: 700000 },
      { fiscal_year: '2027-28', head: 'CONSUMABLES', amount: 150000 }, { fiscal_year: '2027-28', head: 'OUTSOURCING', amount: 50000 },
      { fiscal_year: '2028-29', head: 'CONSUMABLES', amount: 200000 }] });
    await approveAll(HQ, id, ['OM/3', '2028-01-10', 'IFD/80', '2028-01-05']);
    expect(await total(HQ)).toBe(1100000);
    expect(Number((await one<{ c: string }>(db, `SELECT sanctioned_cost c FROM projects WHERE "ProjectID" = $1`, [HQ]))!.c)).toBe(1100000);
  });

  it('foreclosure closes the project and cancels the reviews it no longer owes', async () => {
    const id = await raise(HQ, 'FORECLOSURE', { effective_date: '2028-06-30', cost_benefit: 'Market moved to a cheaper process' });
    expect((await steps(id)).map(s => s.kind)).toEqual(['PME_VETTING', 'MONITORING_COMMITTEE', 'RESEARCH_COUNCIL']);
    await approveAll(HQ, id);
    expect((await one<{ s: string; e: string }>(db, `SELECT stage s, end_date::text e FROM projects WHERE "ProjectID" = $1`, [HQ])))
      .toEqual({ s: 'FORECLOSED', e: '2028-06-30' });
    expect((await db.query(`SELECT 1 FROM project_review_slots WHERE project_id = $1 AND status = 'PENDING'`, [HQ])).rows.length).toBe(0);
    await expect(raise(HQ, 'TIME_OVERRUN', { new_end_date: '2030-01-01' })).rejects.toThrow(/running project/);
  });
});
