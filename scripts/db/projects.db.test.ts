// @vitest-environment node
// Project lifecycle PL0 (docs/roadmap/sources/PROJECT-LIFECYCLE-PLAN.md):
// the PME role, project stage / typed columns, project_id resolution and
// private drafts, against every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `60000000-0000-0000-0000-0000000000${n}`;
const U = {
  master: u('01'), sysadmin: u('02'), pme: u('03'), pi: u('04'), copi: u('05'),
  director: u('06'), hod: u('07'), otherSci: u('08'), leader: u('09'), pending: u('0a'),
} as const;

const P_DRAFT = '70000000-0000-0000-0000-000000000001';
const P_SUBMITTED = '70000000-0000-0000-0000-000000000002';

let db: PGlite;

const count = (uid: string, sql: string, args: unknown[] = []) =>
  as(db, uid, async tx => Number((await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, args)).rows[0].n));
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) =>
  (await tx.query<T>(sql, args)).rows[0];

const proposalRow = (id: string, status: string, track: string | null) => `
  ('${id}', 'Aluminium foam ${status}', 'Materials', 'CSIR', 'Government', 'CSIR', 'In-house',
   '2027-04-01', 24, 100, '${U.pi}', 'Dr PI', 'D1', 'a', 'p', 'o', 'e', '${status}', '${U.pi}',
   ${track ? `'${track}'` : 'NULL'})`;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@t.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles WHERE user_id <> '${U.pending}';
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.master}', 'MasterAdmin', NULL), ('${U.sysadmin}', 'SystemAdmin', NULL),
      ('${U.pme}', 'PME', NULL), ('${U.pi}', 'Scientist', 'D1'), ('${U.copi}', 'Scientist', 'D2'),
      ('${U.director}', 'Director', NULL), ('${U.hod}', 'HOD', 'D1'),
      ('${U.otherSci}', 'Scientist', 'D1'), ('${U.leader}', 'Scientist', 'D3');
    UPDATE public.user_profiles p SET active_role =
      (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'One'), ('D2', 'Two'), ('D3', 'Three');
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('S-PI', 'Dr PI', 'D1', '${U.pi}'), ('S-CO', 'Dr Co', 'D2', '${U.copi}');
    UPDATE public.project_schemes SET leader_user_id = '${U.leader}' WHERE code = 'ULIP';
    INSERT INTO public.proposals
      (id, title, domain_theme, fund_type, sponsor_type, sponsor_name, project_category,
       proposed_start_date, proposed_duration_months, requested_budget, pi_user_id, pi_name,
       division_code, abstract, problem_statement, objectives, expected_outcomes, status, created_by, track)
    VALUES ${proposalRow(P_DRAFT, 'DRAFT', 'ULIP')}, ${proposalRow(P_SUBMITTED, 'SUBMITTED', 'ULIP')};
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name) VALUES
      ('${P_DRAFT}', 'S-CO', 'Dr Co');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('PME role', () => {
  it('can be granted through admin_set_user_roles; an unknown role still cannot', async () => {
    await as(db, U.master, tx => tx.query(
      `SELECT public.admin_set_user_roles($1, ARRAY['Scientist','PME'], 'Scientist', 'D1')`, [U.otherSci]));
    expect((await one<{ n: number }>(db,
      `SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1 AND role = 'PME'`, [U.otherSci]))!.n).toBe(1);
    await as(db, U.master, tx => tx.query(
      `SELECT public.admin_set_user_roles($1, ARRAY['Scientist'], 'Scientist', 'D1')`, [U.otherSci]));
    await expect(as(db, U.master, tx => tx.query(
      `SELECT public.admin_set_user_roles($1, ARRAY['Wizard'], 'Wizard', NULL)`, [U.otherSci])))
      .rejects.toThrow(/invalid role/);
  });

  it('is not an admin: no appraisal reports, no other staff, no role writes', async () => {
    const flags = await as(db, U.pme, tx => one<{ pme: boolean; admin: boolean; pms: boolean }>(tx,
      `SELECT public.caller_is_pme() AS pme, public.caller_is_admin() AS admin, public.pms_is_admin() AS pms`));
    expect(flags).toEqual({ pme: true, admin: false, pms: false });
    expect(await count(U.pme, 'staff')).toBe(0);
    await expect(as(db, U.pme, tx => tx.query(
      `SELECT public.admin_set_user_roles($1, ARRAY['MasterAdmin'], 'MasterAdmin', NULL)`, [U.pme])))
      .rejects.toThrow(/not authorized/);
  });

  it('writes the project domain; a Scientist does not', async () => {
    await as(db, U.pme, tx => tx.query(
      `INSERT INTO projects ("ProjectID", "ProjectNo", "ProjectName", "ProjectStatus") VALUES ('PX1', 'OLP-1', 'By PME', 'Ongoing')`));
    await expect(as(db, U.pi, tx => tx.query(
      `INSERT INTO projects ("ProjectID", "ProjectNo", "ProjectName") VALUES ('PX2', 'OLP-2', 'By PI')`)))
      .rejects.toThrow(/row-level security/);
    await as(db, U.pme, tx => tx.query(
      `INSERT INTO mous (partner_name, partner_type, purpose, status) VALUES ('Acme', 'Industry', 'x', 'Active')`));
  });
});

describe('project stage and typed columns', () => {
  const row = (id: string) => one<{
    stage: string | null; status: string | null; cost: string | null; s: string | null; e: string | null;
  }>(db, `SELECT stage, "ProjectStatus" AS status, sanctioned_cost::text AS cost,
                 start_date::text AS s, end_date::text AS e FROM projects WHERE "ProjectID" = $1`, [id]);

  it('derives the stage from whatever the importer wrote, and leaves the text alone', async () => {
    await db.exec(`
      INSERT INTO projects ("ProjectID", "ProjectNo", "ProjectStatus", "SanctionedCost", "StartDate", "CompletioDate") VALUES
        ('S1', 'N1', 'Ongoing',   '₹ 1,250.50 L', '01.04.2025', '2027-03-31'),
        ('S2', 'N2', 'Completed', 'not known',    '45000',      ''),
        ('S3', 'N3', 'Submitted', '85.00',        NULL,         NULL);`);
    expect(await row('S1')).toEqual({ stage: 'ACTIVE', status: 'Ongoing', cost: '1250.50', s: '2025-04-01', e: '2027-03-31' });
    expect(await row('S2')).toEqual({ stage: 'CLOSED', status: 'Completed', cost: null, s: null, e: null });
    expect(await row('S3')).toMatchObject({ stage: null, status: 'Submitted', cost: '85.00' });
  });

  it('follows a later edit in either direction', async () => {
    await db.exec(`UPDATE projects SET "ProjectStatus" = 'On Hold', "SanctionedCost" = '90' WHERE "ProjectID" = 'S1'`);
    expect(await row('S1')).toMatchObject({ stage: 'ON_HOLD', status: 'On Hold', cost: '90' });
    await db.exec(`UPDATE projects SET stage = 'CLOSED' WHERE "ProjectID" = 'S1'`);
    expect(await row('S1')).toMatchObject({ stage: 'CLOSED', status: 'Completed' });
  });

  it('refuses a stage outside the list', async () => {
    await expect(db.exec(`UPDATE projects SET stage = 'DONE' WHERE "ProjectID" = 'S1'`)).rejects.toThrow(/projects_stage_check/);
  });

  it('sets a track only where the project number is unambiguous', async () => {
    // The backfill rule, re-run on rows inserted after the migration.
    await db.exec(`
      INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('T1', 'FTT040511'), ('T2', 'ULIP-07'), ('T3', 'GAP-0123');
      UPDATE projects SET track = CASE
        WHEN "ProjectNo" ~* '^(FIR|FBR|NCP|FTT|FTC|MMP|FCP|HCP|IST)[0-9]' THEN 'HQ'
        WHEN "ProjectNo" ~* '^ULIP' THEN 'ULIP' END
      WHERE "ProjectID" IN ('T1', 'T2', 'T3');`);
    const rows = (await db.query<{ id: string; track: string | null }>(
      `SELECT "ProjectID" AS id, track FROM projects WHERE "ProjectID" IN ('T1','T2','T3') ORDER BY 1`)).rows;
    expect(rows).toEqual([{ id: 'T1', track: 'HQ' }, { id: 'T2', track: 'ULIP' }, { id: 'T3', track: null }]);
    await expect(db.exec(`UPDATE projects SET track = 'EXTERNAL' WHERE "ProjectID" = 'T3'`)).rejects.toThrow();
  });
});

describe('project_id beside a project number', () => {
  it('links a number carried by one project and leaves a shared umbrella number unlinked', async () => {
    await db.exec(`
      INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('K1', 'UNIQ-1'), ('K2', 'HCP0054'), ('K3', 'HCP0054');
      INSERT INTO mous (id, partner_name, partner_type, purpose, status, linked_project_no) VALUES
        ('71000000-0000-0000-0000-000000000001', 'A', 'Industry', 'x', 'Active', 'UNIQ-1'),
        ('71000000-0000-0000-0000-000000000002', 'B', 'Industry', 'x', 'Active', 'HCP0054'),
        ('71000000-0000-0000-0000-000000000003', 'C', 'Industry', 'x', 'Active', 'NO-SUCH');`);
    const rows = (await db.query<{ p: string | null }>(
      `SELECT project_id AS p FROM mous WHERE id::text LIKE '71000000%' ORDER BY id`)).rows.map(r => r.p);
    expect(rows).toEqual(['K1', null, null]);
  });

  it('re-resolves when the number is corrected, and resolves past the writer\'s own RLS view', async () => {
    await db.exec(`UPDATE mous SET linked_project_no = 'UNIQ-1' WHERE id = '71000000-0000-0000-0000-000000000003'`);
    expect((await one<{ p: string }>(db, `SELECT project_id AS p FROM mous WHERE id = '71000000-0000-0000-0000-000000000003'`))!.p).toBe('K1');
    // The PI sees neither HCP0054 row, so an invoker lookup would find zero —
    // and one visible sibling out of two would look "unique".
    await as(db, U.pi, tx => tx.query(
      `INSERT INTO project_reports (project_no, project_name, period_label, submitted_by) VALUES ('HCP0054', 'n', 'Q1', $1)`, [U.pi]));
    expect((await one<{ p: string | null }>(db, `SELECT project_id AS p FROM project_reports WHERE project_no = 'HCP0054'`))!.p).toBeNull();
  });
});

describe('project_id follows the project set, not the upload order', () => {
  const link = async (id: string) =>
    (await one<{ p: string | null }>(db, `SELECT project_id AS p FROM mous WHERE id = $1`, [id]))!.p;
  const M = '72000000-0000-0000-0000-000000000001';

  it('a child filed before its project exists is linked when the project arrives', async () => {
    await db.exec(`INSERT INTO mous (id, partner_name, partner_type, purpose, status, linked_project_no)
                   VALUES ('${M}', 'Early', 'Industry', 'x', 'Active', 'UMB-9')`);
    expect(await link(M)).toBeNull();
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('W1', 'UMB-9')`);
    expect(await link(M)).toBe('W1');
  });

  it('and unlinked again when a second work package takes the same number', async () => {
    await db.exec(`INSERT INTO phd_students ("EnrollmentNo", "StudentName", "ProjectNo") VALUES ('E-9', 'Scholar', 'UMB-9')`);
    expect((await one<{ p: string }>(db, `SELECT project_id AS p FROM phd_students WHERE "EnrollmentNo" = 'E-9'`))!.p).toBe('W1');
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('W2', 'UMB-9')`);
    expect(await link(M)).toBeNull();
    expect((await one<{ p: string | null }>(db, `SELECT project_id AS p FROM phd_students WHERE "EnrollmentNo" = 'E-9'`))!.p).toBeNull();
  });

  it('a link someone set between work packages survives a third arriving', async () => {
    await db.exec(`UPDATE mous SET project_id = 'W2' WHERE id = '${M}'`);
    await db.exec(`INSERT INTO projects ("ProjectID", "ProjectNo") VALUES ('W3', 'UMB-9')`);
    expect(await link(M)).toBe('W2');
  });
});

describe('private drafts', () => {
  const sees = (uid: string, id: string) => count(uid, 'proposals WHERE id = $1', [id]).then(n => n === 1);

  it('a DRAFT is readable by its PI and its co-PI only', async () => {
    expect(await sees(U.pi, P_DRAFT)).toBe(true);
    expect(await sees(U.copi, P_DRAFT)).toBe(true);
    for (const who of [U.director, U.hod, U.master, U.sysadmin, U.pme, U.leader, U.otherSci]) {
      expect(await sees(who, P_DRAFT), who).toBe(false);
    }
  });

  it('the co-PI can read the draft but not change it', async () => {
    const changed = await as(db, U.copi, async tx =>
      (await tx.query(`UPDATE proposals SET title = 'hijack' WHERE id = $1`, [P_DRAFT])).affectedRows);
    expect(changed).toBe(0);
  });

  it('once submitted, the division, Director, admins, PME and the scheme leader can read it', async () => {
    for (const who of [U.pi, U.director, U.hod, U.master, U.pme, U.leader]) {
      expect(await sees(who, P_SUBMITTED), who).toBe(true);
    }
    expect(await sees(U.otherSci, P_SUBMITTED)).toBe(false);
    expect(await sees(U.copi, P_SUBMITTED)).toBe(false); // not named on this one
  });

  it('the co-PI list of a draft follows the same rule (no policy recursion)', async () => {
    expect(await count(U.copi, 'proposal_copis WHERE proposal_id = $1', [P_DRAFT])).toBe(1);
    expect(await count(U.director, 'proposal_copis WHERE proposal_id = $1', [P_DRAFT])).toBe(0);
  });
});

describe('project_schemes', () => {
  it('ships ULIP and HQ; verified users read, only MasterAdmin writes', async () => {
    expect(await count(U.pi, 'project_schemes')).toBe(2);
    expect(await count(U.pending, 'project_schemes')).toBe(0);
    const byPme = await as(db, U.pme, async tx =>
      (await tx.query(`UPDATE project_schemes SET name = 'x' WHERE code = 'ULIP'`)).affectedRows);
    expect(byPme).toBe(0);
    const byMaster = await as(db, U.master, async tx =>
      (await tx.query(`UPDATE project_schemes SET leader_user_id = $1 WHERE code = 'HQ'`, [U.leader])).affectedRows);
    expect(byMaster).toBe(1);
  });
});
