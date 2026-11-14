// @vitest-environment node
// Project lifecycle PL6 — closure and memory: the completion report and its
// lessons, the compiled financial statement and annexures, the closure route,
// archive (read-only, published), lessons readable institute-wide, follow-on
// lineage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `69000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), copi: u('02'), pme: u('03'), finance: u('04'), director: u('05'), other: u('06'), pending: u('07') } as const;
const ULIP = 'PRJ-Z-ULIP';
const HQ = 'PRJ-Z-HQ';
const OLD = 'PRJ-Z-OLD';

let db: PGlite;
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows[0];
const doc = (uid: string, project: string, type: string) => as(db, uid, async tx => (await one<{ id: string }>(tx,
  `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name) VALUES ($1, $2, $3, 'x.pdf') RETURNING id`,
  [project, type, `${project}/${type}/x.pdf`]))!.id);
const save = (uid: string, project: string, fields: object) =>
  as(db, uid, tx => tx.query(`SELECT project_completion_save($1, $2::jsonb)`, [project, JSON.stringify(fields)]));
const submit = async (project: string) => {
  const d = await doc(U.pi, project, 'completion_report');
  await as(db, U.pi, tx => tx.query(`SELECT project_completion_submit($1, $2)`, [project, d]));
};
const steps = async (project: string) => (await db.query<{ id: string; kind: string; status: string }>(
  `SELECT s.id, s.kind, s.status FROM project_completion_steps s JOIN project_completion_reports r ON r.id = s.report_id AND s.round = r.round
    WHERE r.project_id = $1 ORDER BY s.seq`, [project])).rows;
const OWNER: Record<string, string> = { FINANCE: U.finance, DIRECTOR_APPROVAL: U.director };
const record = async (uid: string, project: string, stepId: string, decision: string, notes = '') => {
  const d = await doc(uid, project, 'closure_order');
  await as(db, uid, tx => tx.query(`SELECT project_completion_record_step($1, $2, $3, $4)`, [stepId, decision, notes, d]));
};
const approveAll = async (project: string) => {
  for (const s of await steps(project)) if (s.status === 'PENDING') await record(OWNER[s.kind] ?? U.pme, project, s.id, 'APPROVE');
};
const stage = async (p: string) => (await one<{ s: string }>(db, `SELECT stage s FROM projects WHERE "ProjectID" = $1`, [p]))!.s;
const LESSONS = {
  summary: 'Made closed-cell aluminium foam at pilot scale.', objectives_status: 'PARTLY_MET',
  objectives_reason: 'Density target 0.25 reached only in small batches.',
  what_worked: 'Calcium thickening before the foaming agent.', what_did_not: 'TiH2 pre-oxidation was inconsistent; buy it pre-treated.',
  reusable_assets: 'Furnace F-3 in Lab 12; process sheets on the shared drive.', trl_target: 5, trl_reached: 4,
  recommendations: 'Fund a pre-oxidation study before scale-up.', follow_on_ideas: 'Foam-filled crash boxes',
};

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@z.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.copi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL),
      ('${U.finance}', 'FinanceAdmin', NULL), ('${U.director}', 'Director', NULL), ('${U.other}', 'Scientist', 'D7'),
      ('${U.pending}', 'DefaultUser', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('Z-PI', 'Dr PI', 'D1', '${U.pi}'), ('Z-CO', 'Dr CoPI', 'D1', '${U.copi}'), ('Z-OT', 'Dr Other', 'D7', '${U.other}');
    INSERT INTO public.proposals (id, title, pi_user_id, pi_name, created_by, status, track) VALUES
      ('6a000000-0000-0000-0000-000000000001', 'Foam', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'ULIP'),
      ('6a000000-0000-0000-0000-000000000002', 'Coating', '${U.pi}', 'Dr PI', '${U.pi}', 'LINKED', 'HQ');
    INSERT INTO public.proposal_copis (proposal_id, staff_id, staff_name) VALUES ('6a000000-0000-0000-0000-000000000001', 'Z-CO', 'Dr CoPI');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "StartDate", "CompletioDate", "DivisionCode",
                                 stage, track, pi_staff_id, proposal_id, sanction_ref, sanction_date) VALUES
      ('${ULIP}', 'ULIP-Z-1', 'Foam', '2024-04-01', '2026-03-31', 'D1', 'ACTIVE', 'ULIP', 'Z-PI', '6a000000-0000-0000-0000-000000000001', 'AMPRI/7', '2024-03-20'),
      ('${HQ}', 'FTT040599', 'Coating', '2027-04-01', '2029-03-31', 'D1', 'ACTIVE', 'HQ', 'Z-PI', '6a000000-0000-0000-0000-000000000002', 'OM/9', '2027-03-01'),
      ('${OLD}', 'OLP-2019-01', 'Old one', '2019-04-01', '2021-03-31', 'D1', 'CLOSED', NULL, NULL, NULL, NULL, NULL);
    INSERT INTO public.project_budget_lines (project_id, fiscal_year, head, amount) VALUES
      ('${ULIP}', '2024-25', 'EQUIPMENT', 600000), ('${ULIP}', '2025-26', 'CONSUMABLES', 200000);
    INSERT INTO public.project_fund_receipts (project_id, received_on, fiscal_year, amount, order_no, recorded_by) VALUES
      ('${ULIP}', '2024-05-01', '2024-25', 800000, 'RO/1', '${U.pme}');
    INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, recorded_by) VALUES
      ('${ULIP}', '2024-25', 'FY', 'EQUIPMENT', 590000, '${U.pme}'), ('${ULIP}', '2025-26', 'FY', 'CONSUMABLES', 150000, '${U.pme}');
    INSERT INTO public.project_change_requests (project_id, kind, status, round, justification, created_by, order_no, order_date, decided_at)
      VALUES ('${ULIP}', 'TIME_OVERRUN', 'APPROVED', 1, 'x', '${U.pi}', 'AMPRI/TO/3', '2025-12-01', now());
    UPDATE public.project_review_slots SET status = 'DONE', held_on = due_date, decision = 'CONTINUE'
     WHERE project_id = '${ULIP}' AND kind = 'REVIEW_COMMITTEE' AND period_label = 'H1 2024-25';
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('the completion report', () => {
  it('only the PI writes it — not a co-PI, PME or anyone else', async () => {
    for (const uid of [U.copi, U.pme, U.other]) await expect(save(uid, ULIP, { summary: 'x' })).rejects.toThrow(/Only the PI/);
  });

  it('the first save moves the project to closing, on the timeline', async () => {
    await save(U.pi, ULIP, { summary: LESSONS.summary });
    expect(await stage(ULIP)).toBe('CLOSING');
    const ev = await one<{ summary: string }>(db, `SELECT summary FROM project_events WHERE project_id = $1 AND kind = 'closure'`, [ULIP]);
    expect(ev?.summary).toBe('Completion report started');
  });

  it('co-PIs read along; nobody writes it directly', async () => {
    const n = await as(db, U.copi, async tx => (await tx.query(`SELECT 1 FROM project_completion_reports WHERE project_id = $1`, [ULIP])).rows.length);
    expect(n).toBe(1);
    await expect(as(db, U.pi, tx => tx.query(`UPDATE project_completion_reports SET summary = 'x'`))).rejects.toThrow(/permission denied/);
  });

  it('cannot be submitted without the lessons, a reason when objectives fell short, and the signed report', async () => {
    await save(U.pi, ULIP, { objectives_status: 'PARTLY_MET' });
    const d = await doc(U.pi, ULIP, 'completion_report');
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_completion_submit($1, $2)`, [ULIP, d])))
      .rejects.toThrow(/still needs: objectives_reason, what_worked, what_did_not, recommendations/);
    await save(U.pi, ULIP, LESSONS);
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_completion_submit($1, NULL)`, [ULIP]))).rejects.toThrow(/signed scan/);
  });

  it('on submission the financial statement and annexures are compiled from the file (§8.3)', async () => {
    await submit(ULIP);
    const r = await one<{ fs: any; ax: any }>(db, `SELECT financial_statement fs, annexures ax FROM project_completion_reports WHERE project_id = $1`, [ULIP]);
    expect(r!.fs).toMatchObject({ sanctioned: 800000, received_total: 800000, spent_total: 740000 });
    expect(r!.fs.heads).toEqual([
      { fiscal_year: '2024-25', head: 'EQUIPMENT', sanctioned: 600000, spent: 590000 },
      { fiscal_year: '2025-26', head: 'CONSUMABLES', sanctioned: 200000, spent: 150000 },
    ]);
    const labels = r!.ax.map((a: any) => [a.label, a.missing]);
    expect(labels).toContainEqual(['Sanction order AMPRI/7', false]);
    expect(labels).toContainEqual(['Time Overrun order AMPRI/TO/3', false]);
    expect(labels).toContainEqual(['ULIP review committee (H1 2024-25) minutes', true]);
    await expect(save(U.pi, ULIP, { summary: 'late edit' })).rejects.toThrow(/cannot be edited/);
  });
});

describe('the closure route', () => {
  it('ULIP: PME, the review committee, the Director', async () => {
    expect((await steps(ULIP)).map(s => s.kind)).toEqual(['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']);
  });

  it('is approved or returned, never rejected; returned goes back to the PI for a new round', async () => {
    const [pme] = await steps(ULIP);
    await expect(record(U.pme, ULIP, pme.id, 'REJECT', 'no')).rejects.toThrow(/approved or returned/);
    await expect(record(U.director, ULIP, (await steps(ULIP))[2].id, 'APPROVE')).rejects.toThrow(/earlier step/);
    await record(U.pme, ULIP, pme.id, 'RETURN', 'Attach the furnace log');
    await save(U.pi, ULIP, { reusable_assets: LESSONS.reusable_assets + ' Furnace log annexed.' });
    await submit(ULIP);
    expect((await one<{ round: number }>(db, `SELECT round FROM project_completion_reports WHERE project_id = $1`, [ULIP]))!.round).toBe(2);
  });

  it('the last approval closes the project and tells the PI', async () => {
    await approveAll(ULIP);
    expect(await stage(ULIP)).toBe('CLOSED');
    const n = await one<{ title: string }>(db, `SELECT title FROM notifications WHERE user_id = $1 AND kind = 'project_completion_decided' ORDER BY created_at DESC LIMIT 1`, [U.pi]);
    expect(n?.title).toBe('Completion report approved: ULIP-Z-1');
  });

  it('HQ (§8): PME, Finance, RC in-principle, Monitoring Committee, DG', async () => {
    await save(U.pi, HQ, { ...LESSONS, objectives_status: 'MET' });
    await submit(HQ);
    expect((await steps(HQ)).map(s => s.kind))
      .toEqual(['PME_VETTING', 'FINANCE', 'RESEARCH_COUNCIL', 'MONITORING_COMMITTEE', 'COMPETENT_AUTHORITY']);
    await record(U.pme, HQ, (await steps(HQ))[0].id, 'APPROVE');
    const fin = await as(db, U.finance, async tx => (await tx.query<{ item: string; step_kind: string }>(`SELECT item, step_kind FROM my_closure_items()`)).rows);
    expect(fin).toEqual([{ item: 'step', step_kind: 'FINANCE' }]);
  });
});

describe('institutional memory', () => {
  it('an approved report\'s lessons are readable by verified users, even without access to the project, but hidden from unverified accounts', async () => {
    const seen = await as(db, U.other, async tx => ({
      project: (await tx.query(`SELECT 1 FROM projects WHERE "ProjectID" = $1`, [ULIP])).rows.length,
      lessons: (await tx.query<{ what_did_not: string }>(`SELECT what_did_not FROM project_lessons`)).rows,
    }));
    expect(seen.project).toBe(0);
    expect(seen.lessons).toEqual([{ what_did_not: LESSONS.what_did_not }]);

    const unverified = await as(db, U.pending, async tx =>
      (await tx.query<{ what_did_not: string }>(`SELECT what_did_not FROM project_lessons`)).rows);
    expect(unverified).toEqual([]);
  });

  it('archiving needs the published report; then the project is read-only', async () => {
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_archive($1, NULL)`, [ULIP]))).rejects.toThrow(/Publish the completion report/);
    const pub = await as(db, U.pme, async tx => (await one<{ id: string }>(tx, `INSERT INTO documents (entity_type, entity_id, doc_type, title,
      storage_bucket, storage_path, file_name, owner_id, access_tier)
      VALUES ('project', $1, 'completion_report', 'Completion report', 'documents', $2, 'pcr.pdf', $3, 'owner') RETURNING id`,
      [ULIP, `${U.pme}/project/${ULIP}/pcr.pdf`, U.pme]))!.id);
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_archive($1, $2)`, [ULIP, pub]))).rejects.toThrow(/Only PME/);
    await as(db, U.pme, tx => tx.query(`SELECT project_archive($1, $2)`, [ULIP, pub]));
    expect(await stage(ULIP)).toBe('ARCHIVED');
    const d = await one<{ t: string; s: string }>(db, `SELECT access_tier t, ingest_status s FROM documents WHERE id = $1`, [pub]);
    expect(d).toEqual({ t: 'institute', s: 'pending' });
    expect((await as(db, U.pme, tx => one<{ d: string }>(tx, `SELECT published_document_id d FROM project_lessons WHERE project_id = $1`, [ULIP])))!.d).toBe(pub);
    await expect(as(db, U.pme, tx => tx.query(`UPDATE projects SET "ProjectName" = 'renamed' WHERE "ProjectID" = $1`, [ULIP])))
      .rejects.toThrow(/archived and read-only/);
  });

  it('a legacy project closed before SURYA is archived without a report', async () => {
    await as(db, U.pme, tx => tx.query(`SELECT project_archive($1, NULL)`, [OLD]));
    expect(await stage(OLD)).toBe('ARCHIVED');
  });

  it('a follow-on idea links back to the project it came from', async () => {
    const id = await as(db, U.pi, async tx => (await one<{ id: string }>(tx,
      `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status, parent_project_id) VALUES ('Foam-filled crash boxes', $1, 'Dr PI', $1, 'DRAFT', $2) RETURNING id`,
      [U.pi, ULIP]))!.id);
    expect((await one<{ p: string }>(db, `SELECT parent_project_id p FROM proposals WHERE id = $1`, [id]))!.p).toBe(ULIP);
  });

  it('a PI is told when a completion report is due', async () => {
    await db.query(`UPDATE projects SET "CompletioDate" = '2026-01-31' WHERE "ProjectID" = $1`, [HQ]);
    await db.query(`DELETE FROM project_completion_reports WHERE project_id = $1`, [HQ]);
    const due = await as(db, U.pi, async tx => (await tx.query<{ item: string; project_no: string }>(
      `SELECT item, project_no FROM my_closure_items() ORDER BY project_no`)).rows);
    expect(due).toEqual([{ item: 'due', project_no: 'FTT040599' }]);
  });
});
