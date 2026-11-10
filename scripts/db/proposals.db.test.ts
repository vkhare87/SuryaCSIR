// @vitest-environment node
// Project lifecycle PL1 — the scientist workspace: title-only drafts, the
// submit completeness check, private notes and versions, against every real
// migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';
import { REQUIRED_COLUMNS } from '../../src/lib/proposals/readiness';

const u = (n: string) => `61000000-0000-0000-0000-0000000000${n}`;
const U = {
  pi: u('01'), hod: u('02'), tech: u('03'), copi: u('04'), director: u('05'),
  pme: u('06'), master: u('07'), otherSci: u('08'),
} as const;

let db: PGlite;
let draftId: string;

const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) =>
  (await tx.query<T>(sql, args)).rows[0];
const count = (uid: string, sql: string, args: unknown[] = []) =>
  as(db, uid, async tx => Number((await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM ${sql}`, args))!.n));
const newDraft = (uid: string, title: string, extra = '') => as(db, uid, async tx =>
  (await one<{ id: string }>(tx,
    `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status ${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1, $2, 'Dr X', $2, 'DRAFT' ${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`, [title, uid]))!.id);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@w.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.hod}', 'HOD', 'D1'), ('${U.tech}', 'Technician', 'D1'),
      ('${U.copi}', 'Scientist', 'D2'), ('${U.director}', 'Director', NULL), ('${U.pme}', 'PME', NULL),
      ('${U.master}', 'MasterAdmin', NULL), ('${U.otherSci}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role =
      (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES ('W-CO', 'Dr Co', 'D2', '${U.copi}');
  `);
  draftId = await newDraft(U.pi, 'Aluminium foam');
  await db.exec(`INSERT INTO proposal_copis (proposal_id, staff_id, staff_name) VALUES ('${draftId}', 'W-CO', 'Dr Co')`);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('starting a draft', () => {
  it('needs a title and nothing else', async () => {
    const row = await one<{ abstract: string | null; d: string | null; code: string }>(db,
      `SELECT abstract, proposed_start_date::text AS d, proposal_code AS code FROM proposals WHERE id = $1`, [draftId]);
    expect(row).toMatchObject({ abstract: null, d: null });
    expect(row!.code).toMatch(/^PROP-\d{4}-\d{4}$/);
  });

  it('is open to HOD as well as Scientist, not to a Technician', async () => {
    // Also the regression test for proposal codes: the HOD cannot see the
    // scientist's draft, and must still be given the next number.
    const id = await newDraft(U.hod, 'By HOD');
    const codes = (await db.query<{ c: string }>(`SELECT proposal_code AS c FROM proposals ORDER BY 1`)).rows.map(r => r.c);
    expect(id).toBeTruthy();
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.at(-1)).toMatch(/-0002$/);
    await expect(newDraft(U.tech, 'By technician')).rejects.toThrow(/row-level security/);
  });

  it('cannot be created already past DRAFT', async () => {
    await expect(as(db, U.pi, tx => tx.query(
      `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status) VALUES ('x', $1, 'Dr X', $1, 'APPROVED')`, [U.pi])))
      .rejects.toThrow(/row-level security/);
  });
});

describe('submit', () => {
  it('asks the database for the same fields the readiness meter lists', async () => {
    const row = await one<{ m: string[] }>(db,
      `SELECT public.proposal_missing_fields(p) AS m FROM proposals p WHERE id = $1`, [draftId]);
    // The draft has a title and a PI name; everything else is still missing.
    expect(row!.m).toEqual(REQUIRED_COLUMNS.filter(c => c !== 'title' && c !== 'pi_name'));
  });

  it('is refused while anything is missing, naming what', async () => {
    await expect(as(db, U.pi, tx => tx.query(`SELECT public.proposal_submit($1)`, [draftId])))
      .rejects.toThrow(/Still needed: track, abstract, problem statement/);
  });

  it('goes through once complete and signed, and records the submitted version', async () => {
    await as(db, U.pi, tx => tx.query(`
      UPDATE proposals SET track = 'ULIP', abstract = 'a', problem_statement = 'p', domain_theme = 'Nano Materials',
        objectives = 'o', expected_outcomes = 'e', project_category = 'Basic Research',
        proposed_start_date = '2027-04-01', proposed_duration_months = 24, division_code = 'D1',
        requested_budget = 50, fund_type = 'Internal', sponsor_type = 'CSIR-Internal', sponsor_name = 'CSIR-AMPRI'
      WHERE id = $1`, [draftId]));
    await expect(as(db, U.pi, tx => tx.query(`SELECT public.proposal_submit($1)`, [draftId])))
      .rejects.toThrow(/signed_proposal_required/);
    await db.exec(`INSERT INTO proposal_documents (proposal_id, doc_type, storage_path, file_name, uploaded_by)
                   VALUES ('${draftId}', 'signed_proposal', '${draftId}/signed_proposal/s.pdf', 's.pdf', '${U.pi}')`);
    await as(db, U.pi, tx => tx.query(`SELECT public.proposal_submit($1)`, [draftId]));
    const row = await one<{ status: string; kind: string; label: string }>(db,
      `SELECT p.status, v.kind, v.label FROM proposals p JOIN proposal_versions v ON v.id = p.submitted_version_id WHERE p.id = $1`, [draftId]);
    expect(row).toEqual({ status: 'SUBMITTED', kind: 'submitted', label: 'Submitted' });
  });
});

describe('private notes', () => {
  let noteDraft: string;

  beforeAll(async () => {
    noteDraft = await newDraft(U.pi, 'Notes draft');
    await db.exec(`INSERT INTO proposal_copis (proposal_id, staff_id, staff_name) VALUES ('${noteDraft}', 'W-CO', 'Dr Co')`);
    await as(db, U.pi, tx => tx.query(
      `INSERT INTO proposal_notes (proposal_id, body) VALUES ($1, 'try a stir-casting route')`, [noteDraft]));
  });

  it('are the author\'s alone — not the co-PI\'s, Director\'s, PME\'s or an admin\'s', async () => {
    expect(await count(U.pi, 'proposal_notes WHERE proposal_id = $1', [noteDraft])).toBe(1);
    for (const who of [U.copi, U.director, U.pme, U.master, U.hod]) {
      expect(await count(who, 'proposal_notes WHERE proposal_id = $1', [noteDraft]), who).toBe(0);
    }
    // The co-PI does read the draft itself.
    expect(await count(U.copi, 'proposals WHERE id = $1', [noteDraft])).toBe(1);
  });

  it('cannot be written onto someone else\'s proposal', async () => {
    await expect(as(db, U.copi, tx => tx.query(
      `INSERT INTO proposal_notes (proposal_id, body) VALUES ($1, 'planted')`, [noteDraft])))
      .rejects.toThrow(/row-level security/);
  });

  it('can be marked as moved into a section, and only a real section', async () => {
    await as(db, U.pi, tx => tx.query(
      `UPDATE proposal_notes SET used_in = 'objectives', used_at = now() WHERE proposal_id = $1`, [noteDraft]));
    expect((await one<{ used_in: string }>(db, `SELECT used_in FROM proposal_notes WHERE proposal_id = $1`, [noteDraft]))!.used_in).toBe('objectives');
    await expect(as(db, U.pi, tx => tx.query(
      `UPDATE proposal_notes SET used_in = 'title' WHERE proposal_id = $1`, [noteDraft]))).rejects.toThrow();
  });
});

describe('versions', () => {
  let vDraft: string;

  beforeAll(async () => {
    vDraft = await newDraft(U.pi, 'Version one title');
    await db.exec(`INSERT INTO proposal_copis (proposal_id, staff_id, staff_name) VALUES ('${vDraft}', 'W-CO', 'Dr Co')`);
  });

  it('only the author can mark one', async () => {
    await as(db, U.pi, tx => tx.query(`SELECT public.proposal_save_version($1, 'after talking to HOD')`, [vDraft]));
    await expect(as(db, U.copi, tx => tx.query(`SELECT public.proposal_save_version($1, 'x')`, [vDraft])))
      .rejects.toThrow(/Only the proposal's author/);
    await expect(as(db, U.pi, tx => tx.query(
      `INSERT INTO proposal_versions (proposal_id, version_no, label, snapshot, created_by) VALUES ($1, 9, 'x', '{}', $2)`, [vDraft, U.pi])))
      .rejects.toThrow(/permission denied/);
  });

  it('restoring puts the content and co-PIs back, and keeps what was replaced', async () => {
    await as(db, U.pi, tx => tx.query(`UPDATE proposals SET title = 'Changed title', objectives = 'new' WHERE id = $1`, [vDraft]));
    await db.exec(`DELETE FROM proposal_copis WHERE proposal_id = '${vDraft}'`);
    const v1 = (await one<{ id: string }>(db, `SELECT id FROM proposal_versions WHERE proposal_id = $1 AND version_no = 1`, [vDraft]))!.id;
    await as(db, U.pi, tx => tx.query(`SELECT public.proposal_restore_version($1)`, [v1]));

    const row = await one<{ title: string; objectives: string | null; status: string; copis: number }>(db,
      `SELECT title, objectives, status, (SELECT count(*)::int FROM proposal_copis c WHERE c.proposal_id = p.id) AS copis
         FROM proposals p WHERE id = $1`, [vDraft]);
    expect(row).toEqual({ title: 'Version one title', objectives: null, status: 'DRAFT', copis: 1 });

    const versions = (await db.query<{ n: number; label: string; t: string }>(
      `SELECT version_no AS n, label, snapshot -> 'proposal' ->> 'title' AS t FROM proposal_versions WHERE proposal_id = $1 ORDER BY 1`, [vDraft])).rows;
    expect(versions).toEqual([
      { n: 1, label: 'after talking to HOD', t: 'Version one title' },
      { n: 2, label: 'Before restoring version 1', t: 'Changed title' },
    ]);
  });

  it('drafting history stays with the author; reviewers see only what was submitted', async () => {
    // draftId (from the submit suite) is SUBMITTED with one 'submitted' version.
    await db.exec(`INSERT INTO proposal_versions (proposal_id, version_no, label, kind, snapshot, created_by)
                   VALUES ('${draftId}', 99, 'private working copy', 'manual', '{}', '${U.pi}')`);
    expect(await count(U.pi, 'proposal_versions WHERE proposal_id = $1', [draftId])).toBe(2);
    expect(await count(U.director, 'proposal_versions WHERE proposal_id = $1', [draftId])).toBe(1);
    expect(await count(U.pme, 'proposal_versions WHERE proposal_id = $1', [draftId])).toBe(1);
    expect(await count(U.otherSci, 'proposal_versions WHERE proposal_id = $1', [draftId])).toBe(0);
    expect(await count(U.director, 'proposal_versions WHERE proposal_id = $1', [vDraft])).toBe(0);
  });

  it('a submitted proposal can no longer be versioned or restored', async () => {
    await expect(as(db, U.pi, tx => tx.query(`SELECT public.proposal_save_version($1, 'late')`, [draftId])))
      .rejects.toThrow(/only while the proposal is being drafted/);
  });
});
