// @vitest-environment node
// Project lifecycle PL4 — monitoring: the generated review and report
// schedule, overdue reports nobody created, recording reviews, committee
// agenda link, minutes deadlines, call for review and the portfolio view.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `65000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), pme: u('02'), director: u('03'), other: u('04') } as const;
const ULIP = 'PRJ-M-ULIP';
const FTT = 'PRJ-M-FTT';
const PAST = 'PRJ-M-PAST';
const MEETING = '66000000-0000-0000-0000-000000000001';

let db: PGlite;
const one = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows[0];
const slots = async (p: string) => (await db.query<{ kind: string; period_label: string; due: string }>(
  `SELECT kind, period_label, due_date::text due FROM project_review_slots WHERE project_id = $1 ORDER BY due_date, kind`, [p])).rows;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@m.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL), ('${U.director}', 'Director', NULL), ('${U.other}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES ('M-PI', 'Dr PI', 'D1', '${U.pi}');
    INSERT INTO public.committees (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date)
      VALUES ('66000000-0000-0000-0000-0000000000c1', 'ULIP review committee', 'Standing', 'Review ULIP projects', 'M-PI', 'M-PI', 'Active', '2027-01-01');
    INSERT INTO public.meetings (id, committee_id, meeting_date, venue, title, summary, status)
      VALUES ('${MEETING}', '66000000-0000-0000-0000-0000000000c1', '2027-09-25', 'Board room', 'ULIP review, Sep 2027', '', 'Scheduled');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "StartDate", "CompletioDate", stage, track, pi_staff_id) VALUES
      ('${ULIP}', 'ULIP-M-1', 'Foam', '2027-04-01', '2028-03-31', 'SANCTIONED', 'ULIP', 'M-PI'),
      ('${FTT}',  'FTT040511', 'Coating', '2027-04-01', '2027-12-31', 'ACTIVE', 'HQ', 'M-PI'),
      ('${PAST}', 'ULIP-M-0', 'Old one', '2024-04-01', '2026-03-31', 'ACTIVE', 'ULIP', 'M-PI');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('the schedule a project owes', () => {
  it('ULIP: a half-yearly progress report (due 15 days after) and review committee', async () => {
    expect(await slots(ULIP)).toEqual([
      { kind: 'PROGRESS_REPORT', period_label: 'H1 2027-28', due: '2027-10-15' },
      { kind: 'REVIEW_COMMITTEE', period_label: 'H1 2027-28', due: '2027-09-30' },
      { kind: 'REVIEW_COMMITTEE', period_label: 'H2 2027-28', due: '2028-03-31' },
      { kind: 'PROGRESS_REPORT', period_label: 'H2 2027-28', due: '2028-04-15' },
    ].sort((a, b) => a.due.localeCompare(b.due) || a.kind.localeCompare(b.kind)));
  });

  it('HQ FTT: Research Council, quarterly Task Force and a stage-gate review, by the number\'s category', async () => {
    const kinds = (await slots(FTT)).reduce<Record<string, number>>((m, s) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }), {});
    // Apr–Dec 2027: one half-year closes (Sep), three quarters close (Jun, Sep,
    // Dec). The Oct–Dec stretch has no half-year end inside the project; the
    // completion report covers it.
    expect(kinds).toEqual({ PROGRESS_REPORT: 1, RESEARCH_COUNCIL: 1, TASK_FORCE: 3, STAGE_GATE: 1 });
  });

  it('moves with the end date, keeping what has been acted on', async () => {
    await db.exec(`UPDATE projects SET "CompletioDate" = '2027-09-30' WHERE "ProjectID" = '${ULIP}'`);
    expect((await slots(ULIP)).map(s => s.period_label)).toEqual(['H1 2027-28', 'H1 2027-28']);
    await db.exec(`UPDATE projects SET "CompletioDate" = '2028-03-31' WHERE "ProjectID" = '${ULIP}'`);
    expect(await slots(ULIP)).toHaveLength(4);
  });
});

describe('a report nobody wrote', () => {
  it('shows as overdue on the portfolio without anyone creating a record', async () => {
    const row = await as(db, U.director, tx => one<{ overdue: number; next_due: string | null }>(tx,
      `SELECT overdue::int, next_due::text FROM project_portfolio WHERE project_id = $1`, [PAST]));
    expect(row!.overdue).toBeGreaterThan(0);
    const mine = await as(db, U.pi, tx => tx.query<{ project_no: string }>(`SELECT project_no FROM my_due_project_slots()`));
    expect(mine.rows.map(r => r.project_no)).toContain('ULIP-M-0');
    const theirs = await as(db, U.other, tx => tx.query(`SELECT * FROM my_due_project_slots()`));
    expect(theirs.rows).toHaveLength(0);
  });

  it('is answered once the PI submits a report on that project', async () => {
    const first = (await one<{ id: string }>(db,
      `SELECT id FROM project_review_slots WHERE project_id = $1 AND kind = 'PROGRESS_REPORT' ORDER BY due_date LIMIT 1`, [PAST]))!.id;
    const report = await as(db, U.pi, async tx => (await one<{ id: string; slot_id: string }>(tx,
      `INSERT INTO project_reports (project_no, project_name, period_label, submitted_by) VALUES ('ULIP-M-0', 'Old one', 'H1', $1)
       RETURNING id, slot_id`, [U.pi]))!);
    expect(report.slot_id).toBe(first);
    expect((await one<{ s: string }>(db, `SELECT status s FROM project_review_slots WHERE id = $1`, [first]))!.s).toBe('PENDING');
    await db.exec(`UPDATE project_reports SET status = 'SUBMITTED', submitted_at = now() WHERE id = '${report.id}'`);
    expect((await one<{ s: string }>(db, `SELECT status s FROM project_review_slots WHERE id = $1`, [first]))!.s).toBe('DONE');
  });
});

describe('reviews', () => {
  const reviewSlot = async (p: string, kind: string) => (await one<{ id: string }>(db,
    `SELECT id FROM project_review_slots WHERE project_id = $1 AND kind = $2 AND status = 'PENDING' ORDER BY due_date LIMIT 1`, [p, kind]))!.id;

  it('PME places a review on a committee meeting\'s agenda', async () => {
    const id = await reviewSlot(ULIP, 'REVIEW_COMMITTEE');
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_slot_schedule($1, $2)`, [id, MEETING]))).rejects.toThrow(/Only PME/);
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_schedule($1, $2)`, [id, MEETING]));
    const item = await one<{ description: string; subject_id: string }>(db,
      `SELECT description, subject_id FROM agenda_items WHERE meeting_id = $1`, [MEETING]);
    expect(item).toEqual({ description: 'ULIP review committee — ULIP-M-1 Foam (H1 2027-28)', subject_id: id });
  });

  it('records the decision; HOLD puts the project on hold and a go-ahead takes it off', async () => {
    await db.exec(`UPDATE projects SET stage = 'ACTIVE' WHERE "ProjectID" = '${ULIP}'`);
    const id = await reviewSlot(ULIP, 'REVIEW_COMMITTEE');
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2027-09-25', 'GO', '', NULL)`, [id])))
      .rejects.toThrow(/does not apply/);
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2027-09-25', 'HOLD', 'Furnace not installed', NULL)`, [id]));
    expect((await one<{ s: string }>(db, `SELECT stage s FROM projects WHERE "ProjectID" = $1`, [ULIP]))!.s).toBe('ON_HOLD');
    const next = await reviewSlot(ULIP, 'REVIEW_COMMITTEE');
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2028-03-20', 'CONTINUE', '', NULL)`, [next]));
    expect((await one<{ s: string }>(db, `SELECT stage s FROM projects WHERE "ProjectID" = $1`, [ULIP]))!.s).toBe('ACTIVE');
  });

  it('a Task Force review owes its minutes within 7 days, until they are filed', async () => {
    const id = await reviewSlot(FTT, 'TASK_FORCE');
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2027-06-28', 'CONTINUE', '', NULL)`, [id]));
    expect((await one<{ d: string }>(db, `SELECT minutes_due::text d FROM project_review_slots WHERE id = $1`, [id]))!.d).toBe('2027-07-05');
    const minutes = await as(db, U.pme, async tx => (await one<{ id: string }>(tx,
      `INSERT INTO project_documents (project_id, doc_type, storage_path, file_name) VALUES ($1, 'minutes', 'x', 'm.pdf') RETURNING id`, [FTT]))!.id);
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_add_minutes($1, $2)`, [id, minutes]));
    expect((await one<{ d: string | null }>(db, `SELECT minutes_due::text d FROM project_review_slots WHERE id = $1`, [id]))!.d).toBeNull();
  });

  it('a stage-gate takes GO / CONDITIONAL_GO / HOLD / KILL / RECYCLE', async () => {
    const id = await reviewSlot(FTT, 'STAGE_GATE');
    await expect(as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2027-09-20', 'CONTINUE', '', NULL)`, [id])))
      .rejects.toThrow(/does not apply/);
    await as(db, U.pme, tx => tx.query(`SELECT project_slot_record($1, '2027-09-20', 'CONDITIONAL_GO', 'Validate at pilot scale', NULL)`, [id]));
  });
});

describe('call for review', () => {
  it('the Director calls one; the PI is notified and it is on the timeline', async () => {
    await expect(as(db, U.pi, tx => tx.query(`SELECT project_call_review($1, current_date + 7, 'x')`, [ULIP])))
      .rejects.toThrow(/Only the Director or PME/);
    await as(db, U.director, tx => tx.query(`SELECT project_call_review($1, current_date + 7, 'Explain the furnace delay')`, [ULIP]));
    const n = await one<{ title: string; link: string }>(db, `SELECT title, link FROM notifications WHERE user_id = $1 AND kind = 'project_review_called'`, [U.pi]);
    expect(n).toEqual({ title: 'Review called: ULIP-M-1', link: `/projects/${ULIP}?tab=monitoring` });
    const ev = await one<{ summary: string }>(db, `SELECT summary FROM project_events WHERE project_id = $1 AND kind = 'review' ORDER BY id DESC LIMIT 1`, [ULIP]);
    expect(ev!.summary).toMatch(/^Review called by the Director for .*: Explain the furnace delay$/);
  });

  it('a called review survives the schedule being regenerated', async () => {
    await db.exec(`UPDATE projects SET "CompletioDate" = '2028-06-30' WHERE "ProjectID" = '${ULIP}'`);
    expect((await one<{ n: number }>(db, `SELECT count(*)::int n FROM project_review_slots WHERE project_id = $1 AND kind = 'CALLED_REVIEW'`, [ULIP]))!.n).toBe(1);
  });
});

describe('timeline catches imports', () => {
  it('a stage change made by writing the status text is logged', async () => {
    await db.exec(`UPDATE projects SET "ProjectStatus" = 'On Hold' WHERE "ProjectID" = '${PAST}'`);
    const ev = await one<{ summary: string }>(db, `SELECT summary FROM project_events WHERE project_id = $1 AND kind = 'stage' ORDER BY id DESC LIMIT 1`, [PAST]);
    expect(ev!.summary).toBe('Stage: Active → On Hold');
  });
});

describe('portfolio', () => {
  it('shows a scientist only their own projects, and is not writable', async () => {
    const pi = await as(db, U.pi, tx => tx.query<{ project_id: string }>(`SELECT project_id FROM project_portfolio ORDER BY 1`));
    expect(pi.rows.map(r => r.project_id)).toEqual([FTT, ULIP, PAST].sort());
    const other = await as(db, U.other, tx => tx.query(`SELECT * FROM project_portfolio`));
    expect(other.rows).toHaveLength(0);
    await expect(as(db, U.pme, tx => tx.query(`INSERT INTO project_review_slots (project_id, kind, body, period_label, period_end, due_date) VALUES ($1, 'TASK_FORCE', 'x', 'x', '2030-01-01', '2030-01-01')`, [ULIP])))
      .rejects.toThrow(/permission denied/);
  });
});
