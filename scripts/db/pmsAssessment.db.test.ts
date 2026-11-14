// @vitest-environment node
// Enterprise P4 — Annexure-B timeline (20261112000018), Part I (…19), the
// 2026 proforma and panel (…20), report items from the profile (…21) and
// score history (…22). One 2026 report walks the whole path.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7b100000-0000-0000-0000-0000000000${n}`;
const U = {
  sciE: u('01'), sciC: u('02'), ro: u('03'), rvo: u('04'), ecm: u('05'), hod: u('06'), dir: u('07'), hr: u('08'),
  chair: u('09'), e1: u('10'), e2: u('11'), e3: u('12'), grc: u('13'),
} as const;
const CYCLE = '7b200000-0000-0000-0000-000000000001';
const TIER1 = '7b200000-0000-0000-0000-000000000002';
const TIER2 = '7b200000-0000-0000-0000-000000000003';
const Y = new Date().getFullYear() + 1;   // reporting year ends 31 Mar Y; lock is 30 Nov Y

let db: PGlite;
let reportE = '';
let reportC = '';
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = (uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q(tx, sql, args));

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
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@a.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.sciE}', 'Scientist', 'D1'), ('${U.sciC}', 'Scientist', 'D1'), ('${U.ro}', 'Scientist', 'D1'),
      ('${U.rvo}', 'Scientist', 'D1'), ('${U.ecm}', 'Scientist', 'D1'), ('${U.hod}', 'HOD', 'D1'),
      ('${U.dir}', 'Director', NULL), ('${U.hr}', 'HRAdmin', NULL), ('${U.chair}', 'Scientist', 'D1'),
      ('${U.e1}', 'Scientist', 'D1'), ('${U.e2}', 'Scientist', 'D1'), ('${U.e3}', 'Scientist', 'D1'), ('${U.grc}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", "Designation", user_id, "DOJ") VALUES
      ('A-E', 'Asha Verma', 'D1', 'Scientist - E', '${U.sciE}', '01/07/2012'),
      ('A-C', 'Ravi Kant', 'D1', 'Scientist-C', '${U.sciC}', '01/07/2020'),
      ('A-RO', 'Reporting Officer', 'D1', 'Scientist-G', '${U.ro}', NULL);
    INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
      VALUES ('${CYCLE}', '${Y - 1}-${String(Y).slice(2)}', '${Y - 1}-04-01', '${Y}-03-31', 'OPEN');
    INSERT INTO public.pms_evaluation_committees (id, name, cycle_id, tier) VALUES
      ('${TIER1}', 'Tier I panel', '${CYCLE}', 'I'), ('${TIER2}', 'Tier II panel', '${CYCLE}', 'II');
    INSERT INTO public.pms_evaluation_committee_members (committee_id, user_id, role) VALUES
      ('${TIER1}', '${U.ro}', 'REPORTING_OFFICER'), ('${TIER1}', '${U.rvo}', 'REVIEWING_OFFICER'), ('${TIER1}', '${U.ecm}', 'EC_MEMBER'),
      ('${TIER2}', '${U.ro}', 'REPORTING_OFFICER'), ('${TIER2}', '${U.rvo}', 'REVIEWING_OFFICER'), ('${TIER2}', '${U.ecm}', 'EC_MEMBER');
    INSERT INTO public.pms_empowered_committee_members (cycle_id, user_id, is_chairman) VALUES
      ('${CYCLE}', '${U.chair}', true), ('${CYCLE}', '${U.e1}', false), ('${CYCLE}', '${U.e2}', false), ('${CYCLE}', '${U.e3}', false);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('A-P1', 'OLP-77', 'Geopolymer bricks', 'D1', 'A-E');
    UPDATE public.projects SET start_date = '${Y - 2}-04-01', end_date = '${Y + 1}-03-31' WHERE "ProjectID" = 'A-P1';
    INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code) VALUES
      ('A-O1', 'Red mud geopolymer', ARRAY['Asha Verma'], 'J Mat', ${Y - 1}, 'D1');
  `);
  // Scientists create their own reports in the app: that makes them 2026 reports.
  reportE = (await call(U.sciE, `INSERT INTO pms_reports (cycle_id, scientist_id) VALUES ($1, $2) RETURNING id`, [CYCLE, U.sciE]) as { id: string }[])[0].id;
  reportC = (await call(U.sciC, `INSERT INTO pms_reports (cycle_id, scientist_id) VALUES ($1, $2) RETURNING id`, [CYCLE, U.sciC]) as { id: string }[])[0].id;
}, 180000);

afterAll(async () => { await db?.close(); });

describe('2026 proforma', () => {
  it('a new report is 2026; Questionnaire B for Scientist E (Pay Level 13), not for Scientist C', async () => {
    const rows = await q<{ id: string; proforma_version: string; questionnaire_b: boolean }>(db,
      `SELECT id, proforma_version, questionnaire_b FROM pms_reports ORDER BY questionnaire_b DESC`);
    expect(rows).toEqual([
      { id: reportE, proforma_version: '2026', questionnaire_b: true },
      { id: reportC, proforma_version: '2026', questionnaire_b: false },
    ]);
  });

  it('Scientist-G and above keep the senior track; the 2026 rules stop at Scientist-F', async () => {
    const r = (await call(U.ro, `INSERT INTO pms_reports (cycle_id, scientist_id) VALUES ($1, $2) RETURNING track, proforma_version`, [CYCLE, U.ro]) as
      { track: string; proforma_version: string }[])[0];
    expect(r).toEqual({ track: 'ANNEXURE_I', proforma_version: 'LEGACY' });
    await db.query(`DELETE FROM pms_reports WHERE scientist_id = $1`, [U.ro]);
  });

  it('the scientist cannot change the proforma or committee', async () => {
    await expect(call(U.sciE, `UPDATE pms_reports SET proforma_version = 'LEGACY' WHERE id = $1`, [reportE])).rejects.toThrow(/written only by the PMS workflow/);
  });
});

describe('Part I', () => {
  it('Establishment pre-fills from the staff record; the scientist reports a discrepancy; Establishment verifies', async () => {
    await expect(call(U.sciE, `SELECT pms_part1_prefill($1)`, [CYCLE])).rejects.toThrow(/Only Establishment/);
    await call(U.hr, `SELECT pms_part1_prefill($1)`, [CYCLE]);
    const part = (await call(U.sciE, `SELECT data FROM pms_part1 WHERE report_id = $1`, [reportE]) as { data: Record<string, string> }[])[0];
    expect(part.data).toMatchObject({ name: 'Asha Verma', employeeId: 'A-E', dateOfJoining: '2012-07-01' });
    await expect(call(U.sciC, `SELECT pms_part1_report_discrepancy($1, 'not mine')`, [reportE])).rejects.toThrow(/Only the scientist/);
    await call(U.sciE, `SELECT pms_part1_report_discrepancy($1, 'Date of joining CSIR is 2011, not 2012')`, [reportE]);
    await call(U.hr, `SELECT pms_part1_verify($1, $2::jsonb)`, [reportE, JSON.stringify({ ...part.data, dateOfJoining: '2011-07-01' })]);
    const after = (await q<{ d: string; v: boolean }>(db,
      `SELECT data->>'dateOfJoining' d, verified_at IS NOT NULL v FROM pms_part1 WHERE report_id = $1`, [reportE]))[0];
    expect(after).toEqual({ d: '2011-07-01', v: true });
  });
});

describe('self-appraisal from records', () => {
  const items = (uid: string) => call(uid, `SELECT id, section, text, state, link FROM pms_report_items WHERE report_id = $1 ORDER BY section`, [reportE]) as
    Promise<{ id: string; section: string; text: string; state: string; link: string | null }[]>;

  it('opens with the year\'s projects and papers, each linked; only the owner may pre-fill', async () => {
    await expect(call(U.sciC, `SELECT pms_prefill_from_profile($1)`, [reportE])).rejects.toThrow(/own report/);
    await call(U.sciE, `SELECT pms_prefill_from_profile($1)`, [reportE]);
    const rows = await items(U.sciE);
    expect(rows.map(r => [r.section, r.state, r.link])).toEqual([
      ['OUTPUT', 'PREFILLED', '/intelligence'],
      ['PROJECT', 'PREFILLED', '/projects/A-P1'],
    ]);
  });

  it('confirming makes a claim; a re-run never touches it', async () => {
    const [paper, project] = await items(U.sciE);
    await call(U.sciE, `SELECT pms_report_item_set($1, 'EDITED', 'Red mud geopolymer (with industry partner)')`, [paper.id]);
    await call(U.sciE, `SELECT pms_report_item_set($1, 'CONFIRMED')`, [project.id]);
    await call(U.sciE, `SELECT pms_report_item_add($1, 'OTHER', 'Invited talk at ICMAT')`, [reportE]);
    await call(U.sciE, `SELECT pms_prefill_from_profile($1)`, [reportE]);
    expect((await items(U.sciE)).map(r => r.state).sort()).toEqual(['ADDED', 'CONFIRMED', 'EDITED']);
    expect((await items(U.sciE)).find(r => r.section === 'OUTPUT')?.text).toBe('Red mud geopolymer (with industry partner)');
  });
});

describe('panel and Empowered Committee', () => {
  it('goes only to the committee of the scientist\'s grade', async () => {
    await db.exec(`UPDATE pms_reports SET status = 'SUBMITTED', submitted_at = now() WHERE id IN ('${reportE}', '${reportC}')`);
    await expect(call(U.hr, `SELECT pms_assign_evaluators($1, $2)`, [reportE, TIER1])).rejects.toThrow(/tier II committee/);
    await call(U.hr, `SELECT pms_assign_evaluators($1, $2)`, [reportE, TIER2]);
    expect((await q<{ c: string }>(db, `SELECT committee_id c FROM pms_reports WHERE id = $1`, [reportE]))[0].c).toBe(TIER2);
  });

  it('the committee sees claims, not unconfirmed suggestions', async () => {
    const seen = await call(U.ro, `SELECT state FROM pms_report_items WHERE report_id = $1 ORDER BY state`, [reportE]) as { state: string }[];
    expect(seen.map(r => r.state)).toEqual(['ADDED', 'CONFIRMED', 'EDITED']);
  });

  it('one panel score: members cannot file their own; the RO records it with quorum', async () => {
    await expect(call(U.ecm, `UPDATE pms_evaluations SET total_score = 80 WHERE report_id = $1 AND evaluator_id = $2`, [reportE, U.ecm]))
      .rejects.toThrow(/one panel score/);
    const items = (await q<{ item_key: string }>(db, `SELECT item_key FROM pms_pen_picture_items`)).map(r => r.item_key);
    expect(items).toHaveLength(15);
    const full = { ratings: Object.fromEntries(items.map(k => [k, 'Very Good'])) };
    const record = (uid: string, quorum: number, pen: object = full, integrity = 'Nothing has come to notice against integrity') => call(uid,
      `SELECT pms_record_panel_score($1, 82, NULL, NULL, NULL, $2::jsonb, $3, NULL, 'Steady output', 'Well-rounded year', $4)`,
      [reportE, JSON.stringify(pen), integrity, quorum]);
    await expect(record(U.rvo, 3)).rejects.toThrow(/Reporting Officer/);
    await expect(record(U.ro, 2, { ratings: { personality: 'Good' } })).rejects.toThrow(/Rate every pen-picture item/);
    await expect(record(U.ro, 2, full, '  ')).rejects.toThrow(/integrity/);
    await expect(record(U.ro, 1)).rejects.toThrow(/Quorum/);
    await record(U.ro, 2);
    expect((await q<{ s: string }>(db, `SELECT status s FROM pms_reports WHERE id = $1`, [reportE]))[0].s).toBe('EMPOWERED_COMMITTEE_REVIEW');
    await expect(record(U.ro, 3)).rejects.toThrow(/not with the Evaluation Committee/);
    expect((await q<{ n: number }>(db, `SELECT count(*)::int n FROM pms_panel_scores WHERE report_id = $1`, [reportE]))[0].n).toBe(1);
  });

  it('the Empowered Committee concurs, upgrades or downgrades — with quorum — and the old finalize refuses', async () => {
    await expect(call(U.e1, `SELECT pms_finalize_report($1, 82, $2)`, [reportE, 'x'.repeat(60)])).rejects.toThrow(/pms_finalize_report_2026/);
    const fin = (action: string, score: number | null, quorum: number) => call(U.e1,
      `SELECT pms_finalize_report_2026($1, $2, $3, 'The panel underrated the transfer work', 'Publish more', NULL, NULL, $4)`,
      [reportE, action, score, quorum]);
    await expect(fin('UPGRADE', 80, 3)).rejects.toThrow(/higher than the panel/);
    await expect(fin('CONCUR', null, 2)).rejects.toThrow(/Quorum/);
    await fin('CONCUR', null, 3);
    const d = (await q<{ final_score: number; ec_action: string; panel_score: number }>(db,
      `SELECT final_score, ec_action, panel_score FROM pms_committee_decisions WHERE report_id = $1`, [reportE]))[0];
    expect(d).toEqual({ final_score: 82, ec_action: 'CONCUR', panel_score: 82 });
  });
});

describe('score history', () => {
  const history = (uid: string) => call(uid, `SELECT score, grade FROM pms_score_history('A-E')`) as Promise<{ score: number; grade: string }[]>;

  it('the scientist, the Director and the RO see it; a HoD who is not the RO gets no rows', async () => {
    expect(await history(U.sciE)).toEqual([{ score: 82, grade: 'Very Good' }]);
    expect(await history(U.dir)).toHaveLength(1);
    expect(await history(U.ro)).toHaveLength(1);
    expect(await history(U.hod)).toEqual([]);
    expect(await history(U.sciC)).toEqual([]);
  });
});

describe('Annexure-B timeline', () => {
  it('a representation not disposed in one month shows overdue, and the sweep tells the grievance committee with nobody logged in', async () => {
    await db.exec(`
      INSERT INTO pms_grievance_members (cycle_id, user_id) VALUES ('${CYCLE}', '${U.grc}');
      UPDATE pms_reports SET status = 'UNDER_GRIEVANCE_REVIEW' WHERE id = '${reportE}';
      INSERT INTO pms_representations (report_id, scientist_id, grounds, submitted_at)
        VALUES ('${reportE}', '${U.sciE}', 'The transfer to industry was not weighed', '${Y}-08-05 10:00+05:30');
    `);
    const out = await onDay(`${Y}-09-10`, async tx => {
      await tx.exec(`SET LOCAL ROLE authenticated`);
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.hr, role: 'authenticated' })]);
      const step7 = (await q<{ overdue: number }>(tx, `SELECT overdue FROM pms_timeline_status($1) WHERE step = 7`, [CYCLE]))[0];
      const late = await q<{ step: number }>(tx, `SELECT step FROM pms_delay_report($1)`, [CYCLE]);
      await tx.exec(`RESET ROLE`);
      await tx.query(`SELECT set_config('request.jwt.claims', '', true)`);
      await tx.query(`SELECT pms_timeline_sweep()`);
      const told = await q<{ user_id: string }>(tx, `SELECT user_id FROM notifications WHERE kind = 'pms-representation-overdue' ORDER BY user_id`);
      return { step7, late, told };
    });
    expect(out.step7.overdue).toBe(1);
    expect(out.late.map(l => l.step)).toContain(7);
    expect(out.told.map(t => t.user_id)).toEqual([U.hr, U.grc].sort());
  });

  it('a score not contested in 15 days is deemed accepted by the sweep', async () => {
    await db.exec(`UPDATE pms_reports SET status = 'FINALIZED', score_communicated_at = '${Y}-08-01 10:00+05:30' WHERE id = '${reportC}'`);
    const deemed = await onDay(`${Y}-08-20`, async tx => {
      await tx.query(`SELECT pms_timeline_sweep()`);
      return (await q<{ d: boolean }>(tx, `SELECT deemed_accepted_at IS NOT NULL d FROM pms_reports WHERE id = $1`, [reportC]))[0].d;
    });
    expect(deemed).toBe(true);
  });

  it('is for PMS administrators and the Director only', async () => {
    await expect(call(U.sciE, `SELECT * FROM pms_timeline_status($1)`, [CYCLE])).rejects.toThrow(/not authorized/);
  });
});
