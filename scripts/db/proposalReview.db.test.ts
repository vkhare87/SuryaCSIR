// @vitest-environment node
// Project lifecycle PL2 — concept to sanction: budget lines, readiness rules,
// the review chain per track, section comments and the sanction that creates
// the project, against every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `62000000-0000-0000-0000-0000000000${n}`;
const U = {
  pi: u('01'), pme: u('02'), pmePi: u('03'), finance: u('04'), director: u('05'),
  leader: u('06'), hr: u('07'), master: u('08'), other: u('09'),
} as const;

let db: PGlite;

const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) =>
  (await tx.query<T>(sql, args)).rows[0];
const status = async (id: string) =>
  (await one<{ s: string }>(db, `SELECT status AS s FROM proposals WHERE id = $1`, [id]))!.s;

const COMPLETE = `abstract = 'a', problem_statement = 'p', domain_theme = 'Nano Materials', objectives = 'o',
  expected_outcomes = 'e', project_category = 'Basic Research', proposed_start_date = '2027-04-01',
  proposed_duration_months = 24, division_code = 'D1', fund_type = 'Internal', sponsor_type = 'CSIR-Internal',
  sponsor_name = 'CSIR-AMPRI'`;

async function draft(track: 'ULIP' | 'HQ', extra = ''): Promise<string> {
  const id = await as(db, U.pi, async tx => (await one<{ id: string }>(tx,
    `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status, track)
     VALUES ('Foam ${track}', $1, 'Dr PI', $1, 'DRAFT', $2) RETURNING id`, [U.pi, track]))!.id);
  const base = extra.includes('project_category') ? COMPLETE.replace("project_category = 'Basic Research', ", '') : COMPLETE;
  await as(db, U.pi, tx => tx.query(`UPDATE proposals SET ${base}${extra ? ', ' + extra : ''} WHERE id = $1`, [id]));
  await as(db, U.pi, tx => tx.query(
    `INSERT INTO proposal_budget_lines (proposal_id, fiscal_year, head, item, amount) VALUES
       ($1, '2027-28', 'CONSUMABLES', 'Al powder', 300000), ($1, '2027-28', 'MANPOWER', 'One PAT-I', 450000)`, [id]));
  return id;
}

const doc = (uid: string, id: string, type: string) => as(db, uid, async tx => (await one<{ id: string }>(tx,
  `INSERT INTO proposal_documents (proposal_id, doc_type, storage_path, file_name, uploaded_by)
   VALUES ($1, $2, $4, 'x.pdf', $3) RETURNING id`, [id, type, uid, `${id}/${type}/x.pdf`]))!.id);

const submit = async (id: string) => {
  await doc(U.pi, id, 'signed_proposal');
  await as(db, U.pi, tx => tx.query(`SELECT proposal_submit($1)`, [id]));
};

const pendingStep = async (id: string) => (await one<{ id: string; kind: string }>(db,
  `SELECT id, kind FROM proposal_review_steps WHERE proposal_id = $1 AND status = 'PENDING' ORDER BY round DESC, seq LIMIT 1`, [id]))!;

const approve = async (uid: string, id: string) => {
  const step = await pendingStep(id);
  const scan = await doc(uid, id, 'step_scan');
  await as(db, uid, tx => tx.query(`SELECT proposal_record_step($1, 'APPROVE', 'ok', $2)`, [step.id, scan]));
  return step.kind;
};

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@r.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL), ('${U.pmePi}', 'PME', NULL),
      ('${U.pmePi}', 'Scientist', 'D1'), ('${U.finance}', 'FinanceAdmin', NULL), ('${U.director}', 'Director', NULL),
      ('${U.leader}', 'Scientist', 'D2'), ('${U.hr}', 'HRAdmin', NULL), ('${U.master}', 'MasterAdmin', NULL),
      ('${U.other}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role =
      (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES ('R-PI', 'Dr PI', 'D1', '${U.pi}');
    UPDATE public.project_schemes SET leader_user_id = '${U.leader}' WHERE code = 'ULIP';
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('budget lines', () => {
  it('set the requested total, and only the author writes them while drafting', async () => {
    const id = await draft('ULIP');
    expect(Number((await one<{ b: string }>(db, `SELECT requested_budget AS b FROM proposals WHERE id = $1`, [id]))!.b)).toBe(750000);
    await expect(as(db, U.other, tx => tx.query(
      `INSERT INTO proposal_budget_lines (proposal_id, fiscal_year, head, amount) VALUES ($1, '2027-28', 'OTHER', 1)`, [id])))
      .rejects.toThrow(/row-level security/);
    await expect(as(db, U.pi, tx => tx.query(
      `INSERT INTO proposal_budget_lines (proposal_id, fiscal_year, head, amount) VALUES ($1, '2027', 'OTHER', 1)`, [id])))
      .rejects.toThrow(/check constraint/);
  });
});

describe('readiness rules beyond the fields', () => {
  it('equipment of ₹5 lakh or more needs a quotation', async () => {
    const id = await draft('ULIP');
    await as(db, U.pi, tx => tx.query(
      `INSERT INTO proposal_budget_lines (proposal_id, fiscal_year, head, item, amount) VALUES ($1, '2027-28', 'EQUIPMENT', 'Furnace', 650000)`, [id]));
    expect((await one<{ r: string[] }>(db, `SELECT proposal_readiness($1) AS r`, [id]))!.r).toEqual(['equipment_quotation']);
    await doc(U.pi, id, 'quotation');
    expect((await one<{ r: string[] }>(db, `SELECT proposal_readiness($1) AS r`, [id]))!.r).toEqual([]);
  });

  it('an HQ proposal needs its category, and Works & Services only in MMP or FCP', async () => {
    const id = await draft('HQ');
    expect((await one<{ r: string[] }>(db, `SELECT proposal_readiness($1) AS r`, [id]))!.r).toEqual(['category_code']);
    await as(db, U.pi, tx => tx.query(`UPDATE proposals SET category_code = 'FTT', project_category = NULL WHERE id = $1`, [id]));
    await as(db, U.pi, tx => tx.query(
      `INSERT INTO proposal_budget_lines (proposal_id, fiscal_year, head, amount) VALUES ($1, '2027-28', 'WORKS', 100000)`, [id]));
    expect((await one<{ r: string[] }>(db, `SELECT proposal_readiness($1) AS r`, [id]))!.r).toEqual(['works_not_allowed']);
    await as(db, U.pi, tx => tx.query(`UPDATE proposals SET category_code = 'MMP' WHERE id = $1`, [id]));
    expect((await one<{ r: string[] }>(db, `SELECT proposal_readiness($1) AS r`, [id]))!.r).toEqual([]);
  });

  it('submit refuses on a rule, not only on a field', async () => {
    const id = await draft('HQ');
    await doc(U.pi, id, 'signed_proposal');
    await expect(as(db, U.pi, tx => tx.query(`SELECT proposal_submit($1)`, [id]))).rejects.toThrow(/Still needed: category code/);
  });
});

describe('ULIP, draft to project', () => {
  let id: string;

  it('submitting opens PME vetting → review committee → Director approval', async () => {
    id = await draft('ULIP');
    await submit(id);
    const kinds = (await db.query<{ kind: string; status: string }>(
      `SELECT kind, status FROM proposal_review_steps WHERE proposal_id = $1 ORDER BY seq`, [id])).rows;
    expect(kinds).toEqual([
      { kind: 'PME_VETTING', status: 'PENDING' },
      { kind: 'REVIEW_COMMITTEE', status: 'PENDING' },
      { kind: 'DIRECTOR_APPROVAL', status: 'PENDING' },
    ]);
  });

  it('a step needs the right person and the signed scan, and goes in order', async () => {
    const step = await pendingStep(id);
    await expect(as(db, U.hr, tx => tx.query(`SELECT proposal_record_step($1, 'APPROVE', '', NULL)`, [step.id])))
      .rejects.toThrow(/cannot record this step/);
    await expect(as(db, U.pme, tx => tx.query(`SELECT proposal_record_step($1, 'APPROVE', '', NULL)`, [step.id])))
      .rejects.toThrow(/signed scan/);
    const later = (await one<{ id: string }>(db,
      `SELECT id FROM proposal_review_steps WHERE proposal_id = $1 AND kind = 'DIRECTOR_APPROVAL'`, [id]))!.id;
    await expect(as(db, U.director, tx => tx.query(`SELECT proposal_record_step($1, 'APPROVE', '', NULL)`, [later])))
      .rejects.toThrow(/earlier step is still pending/);
  });

  it('PME vets, the scheme leader records the committee, the Director approves', async () => {
    expect(await approve(U.pme, id)).toBe('PME_VETTING');
    expect(await status(id)).toBe('UNDER_REVIEW');
    expect(await approve(U.leader, id)).toBe('REVIEW_COMMITTEE');
    expect(await status(id)).toBe('RECOMMENDED');
    expect(await approve(U.director, id)).toBe('DIRECTOR_APPROVAL');
    expect(await status(id)).toBe('APPROVED');
  });

  it('the old admin transitions cannot skip the chain', async () => {
    await expect(as(db, U.hr, tx => tx.query(`SELECT proposal_approve($1, 1, '2027-01-01')`, [id])))
      .rejects.toThrow(/permission denied/);
  });

  it('PME sanctions it: the project exists, with the budget, linked both ways', async () => {
    const order = await doc(U.pme, id, 'sanction_order');
    const pid = (await as(db, U.pme, tx => one<{ p: string }>(tx,
      `SELECT proposal_sanction($1, 'ULIP-2027-01', 'AMPRI/RPBD/2027/14', '2027-03-20', 750000, $2) AS p`, [id, order])))!.p;
    const project = await one<Record<string, unknown>>(db,
      `SELECT "ProjectNo", "ProjectStatus", stage, track, start_date::text AS s, end_date::text AS e,
              sanctioned_cost::text AS cost, pi_staff_id, proposal_id FROM projects WHERE "ProjectID" = $1`, [pid]);
    expect(project).toEqual({
      ProjectNo: 'ULIP-2027-01', ProjectStatus: 'Sanctioned', stage: 'SANCTIONED', track: 'ULIP',
      s: '2027-04-01', e: '2029-03-31', cost: '750000', pi_staff_id: 'R-PI', proposal_id: id,
    });
    expect((await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM project_budget_lines WHERE project_id = $1`, [pid]))!.n).toBe(2);
    const prop = await one<{ status: string; project_id: string }>(db, `SELECT status, project_id FROM proposals WHERE id = $1`, [id]);
    expect(prop).toEqual({ status: 'LINKED', project_id: pid });
  });

  it('a second work package taking the number does not unlink a sanctioned proposal', async () => {
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('WP-2', 'ULIP-2027-01')`);
    expect((await one<{ p: string }>(db, `SELECT project_id AS p FROM proposals WHERE id = $1`, [id]))!.p).not.toBeNull();
  });
});

describe('HQ, draft to project', () => {
  it('runs PME → Finance → Director forward → two HQ screenings → competent authority, then sanctions', async () => {
    const id = await draft('HQ', `category_code = 'FTT', project_category = NULL`);
    await submit(id);
    expect(await approve(U.pme, id)).toBe('PME_VETTING');
    await expect(approve(U.pme, id)).rejects.toThrow(/cannot record this step/); // Finance's step
    expect(await approve(U.finance, id)).toBe('FINANCE');
    expect(await approve(U.director, id)).toBe('DIRECTOR_FORWARD');
    expect(await status(id)).toBe('RECOMMENDED');
    expect(await approve(U.pme, id)).toBe('HQ_SCREENING');
    expect(await approve(U.pme, id)).toBe('HQ_EXPERT');
    expect(await approve(U.pme, id)).toBe('COMPETENT_AUTHORITY');
    expect(await status(id)).toBe('APPROVED');

    const order = await doc(U.pme, id, 'sanction_order');
    await expect(as(db, U.pme, tx => tx.query(
      `SELECT proposal_sanction($1, 'FTT-2027', 'OM 1', '2027-03-01', 1, $2)`, [id, order]))).rejects.toThrow(/FTT followed by six digits/);
    await as(db, U.pme, tx => tx.query(
      `SELECT proposal_sanction($1, 'FTT040511', 'CSIR/TMD/OM/1', '2027-03-01', 750000, $2)`, [id, order]));
    expect(await status(id)).toBe('LINKED');
  });
});

describe('return, comments and resubmission', () => {
  it('a reviewer comments on a section and returns it; the PI ticks it and resubmits into a new round', async () => {
    const id = await draft('ULIP');
    await submit(id);
    await as(db, U.pme, tx => tx.query(
      `INSERT INTO proposal_review_comments (proposal_id, section, body) VALUES ($1, 'budget', 'Split manpower by year')`, [id]));
    await expect(as(db, U.other, tx => tx.query(
      `INSERT INTO proposal_review_comments (proposal_id, section, body) VALUES ($1, 'idea', 'drive-by')`, [id])))
      .rejects.toThrow(/row-level security/);

    const step = await pendingStep(id);
    await as(db, U.pme, tx => tx.query(`SELECT proposal_record_step($1, 'RETURN', '', NULL)`, [step.id]));
    expect(await status(id)).toBe('REVISION_REQUESTED');

    // The PI may tick the comment, not rewrite it.
    await as(db, U.pi, tx => tx.query(`UPDATE proposal_review_comments SET resolved_at = now() WHERE proposal_id = $1`, [id]));
    await expect(as(db, U.pi, tx => tx.query(`UPDATE proposal_review_comments SET body = 'x' WHERE proposal_id = $1`, [id])))
      .rejects.toThrow(/permission denied/);

    await as(db, U.pi, tx => tx.query(`SELECT proposal_submit($1)`, [id]));
    const rounds = (await db.query<{ round: number; status: string }>(
      `SELECT round, status FROM proposal_review_steps WHERE proposal_id = $1 AND seq = 1 ORDER BY round`, [id])).rows;
    expect(rounds).toEqual([{ round: 1, status: 'RETURNED' }, { round: 2, status: 'PENDING' }]);
  });

  it('a return needs a note or an open comment; a rejection needs a reason', async () => {
    const id = await draft('ULIP');
    await submit(id);
    const step = await pendingStep(id);
    await expect(as(db, U.pme, tx => tx.query(`SELECT proposal_record_step($1, 'RETURN', ' ', NULL)`, [step.id])))
      .rejects.toThrow(/Say what needs to change/);
    await expect(as(db, U.pme, tx => tx.query(`SELECT proposal_record_step($1, 'REJECT', '', NULL)`, [step.id])))
      .rejects.toThrow(/reason for rejection/);
    await as(db, U.pme, tx => tx.query(`SELECT proposal_record_step($1, 'REJECT', 'Duplicates ULIP-2025-03', NULL)`, [step.id]));
    expect(await status(id)).toBe('REJECTED');
  });
});

describe('no self-dealing', () => {
  it('a PME officer who is co-PI cannot vet the proposal; another PME officer can', async () => {
    await db.exec(`INSERT INTO staff ("ID", "Name", "Division", user_id) VALUES ('R-PP', 'Dr PME', 'D1', '${U.pmePi}')`);
    const id = await draft('ULIP');
    await as(db, U.pi, tx => tx.query(`INSERT INTO proposal_copis (proposal_id, staff_id, staff_name) VALUES ($1, 'R-PP', 'Dr PME')`, [id]));
    await submit(id);
    await expect(approve(U.pmePi, id)).rejects.toThrow(/row-level security|cannot record this step/);
    expect(await approve(U.pme, id)).toBe('PME_VETTING');
  });
});

describe('legacy proposals', () => {
  it('PME sets the track of one already mid-review; steps it has passed are skipped', async () => {
    const id = await as(db, U.pi, async tx => (await one<{ id: string }>(tx,
      `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status) VALUES ('Old', $1, 'Dr PI', $1, 'DRAFT') RETURNING id`, [U.pi]))!.id);
    await db.exec(`UPDATE proposals SET status = 'UNDER_REVIEW' WHERE id = '${id}'`);
    await expect(as(db, U.pi, tx => tx.query(`SELECT proposal_set_track($1, 'ULIP')`, [id]))).rejects.toThrow(/Only PME/);
    await as(db, U.pme, tx => tx.query(`SELECT proposal_set_track($1, 'ULIP')`, [id]));
    const steps = (await db.query<{ kind: string; status: string }>(
      `SELECT kind, status FROM proposal_review_steps WHERE proposal_id = $1 ORDER BY seq`, [id])).rows;
    expect(steps.map(s => s.status)).toEqual(['SKIPPED', 'PENDING', 'PENDING']);
  });
});
