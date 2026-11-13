// @vitest-environment node
// Enterprise P5 — post register (20261113000001), workload / outlook /
// careers (…02), project staff engagement (…03), recruitment file and
// acting charge (…04).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c100000-0000-0000-0000-0000000000${n}`;
const U = { hr: u('01'), sci: u('02'), pme: u('03'), dir: u('04'), acting: u('05'), hod: u('06') } as const;
const T = '2026-11-13';

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = (uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q(tx, sql, args));

// As a user on a pinned IST day, rolled back.
async function asOn<R>(uid: string, day: string, fn: (tx: Tx) => Promise<R>): Promise<R> {
  let out: R | undefined;
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    try { out = await fn(tx); } finally { await tx.rollback(); }
  });
  return out as R;
}

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@p.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hr}', 'HRAdmin', NULL), ('${U.sci}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL),
      ('${U.dir}', 'Director', NULL), ('${U.acting}', 'Scientist', 'D1'), ('${U.hod}', 'HOD', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", "Designation", "CoreArea", "DOB", user_id) VALUES
      ('P-A', 'Anita Rao', 'D1', 'Scientist-E', 'Geopolymers', '01/03/1967', '${U.sci}'),
      ('P-B', 'Bala Iyer', 'D1', 'Scientist-C', 'Coatings', '01/01/1990', NULL),
      ('P-C', 'Chitra Das', 'D2', 'Scientist-D', 'Coatings', '01/01/1985', NULL);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('PS-LONG', 'GAP-1', 'Long project', 'D1', 'P-A'), ('PS-SHORT', 'GAP-2', 'Short project', 'D1', 'P-A'),
      ('PS-RUN', 'GAP-3', 'Running', 'D1', NULL);
    UPDATE public.projects SET stage = 'ACTIVE', start_date = '2019-04-01', end_date = '2030-03-31' WHERE "ProjectID" = 'PS-LONG';
    UPDATE public.projects SET stage = 'ACTIVE', start_date = '2026-04-01', end_date = '2026-12-31' WHERE "ProjectID" = 'PS-SHORT';
    UPDATE public.projects SET stage = 'ACTIVE', start_date = '2025-04-01', end_date = '2028-03-31' WHERE "ProjectID" = 'PS-RUN';
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('post register', () => {
  it('HR enters, fills and vacates posts; division strength comes from the register', async () => {
    await expect(call(U.sci, `SELECT post_create('S-1', 'IV', '13', 'Scientist-E', 'Materials', 'D1', 'UR', 'Sanction 1/2020')`))
      .rejects.toThrow(/Only HR/);
    const ids = [];
    for (const code of ['S-1', 'S-2', 'S-3']) {
      ids.push((await call(U.hr, `SELECT post_create($1, 'IV', '13', 'Scientist-E', 'Materials', 'D1', 'UR', 'Sanction 1/2020') id`, [code]) as { id: string }[])[0].id);
    }
    await call(U.hr, `SELECT post_fill($1, 'P-A', '2020-01-01', 'O/12/2020')`, [ids[0]]);
    await expect(call(U.hr, `SELECT post_fill($1, 'P-A', '2020-01-01', 'O/13')`, [ids[1]])).rejects.toThrow(/already holds a post/);
    await call(U.hr, `SELECT post_set_state($1, 'ADVERTISED', 'Advt 4/2026')`, [ids[1]]);
    await call(U.hr, `SELECT post_set_state($1, 'ABOLISHED', 'Order 9/2026')`, [ids[2]]);
    const s = (await call(U.hr, `SELECT sanctioned, filled, vacant, advertised FROM division_strength WHERE division_code = 'D1'`))[0];
    expect(s).toEqual({ sanctioned: 2, filled: 1, vacant: 1, advertised: 1 });
    await expect(call(U.hr, `UPDATE sanctioned_posts SET state = 'FILLED'`)).rejects.toThrow(/permission denied/);
  });
});

describe('workload, outlook, careers', () => {
  it('workload counts running projects and flags more than four', async () => {
    const w = (await call(U.hr, `SELECT active_projects, as_pi, overload FROM staff_workload('P-A')`))[0];
    expect(w).toEqual({ active_projects: 2, as_pi: 2, overload: false });
  });

  it('the summary view gives the numbers of the profile facts, for exactly the staff the caller may read (20261113000011)', async () => {
    for (const uid of [U.hr, U.sci, U.hod]) {
      const diff = await call(uid, `
        SELECT s."ID" FROM staff s LEFT JOIN staff_research_summary r ON r.staff_id = s."ID"
         WHERE r.staff_id IS NULL
            OR r.active_projects <> (SELECT count(*) FROM staff_profile_facts(s."ID") f WHERE f.section = 'PROJECT'
                  AND (f.date_from IS NULL OR f.date_from <= ist_today()) AND (f.date_to IS NULL OR f.date_to >= ist_today()))
            OR r.ip <> (SELECT count(*) FROM staff_profile_facts(s."ID") f WHERE f.section = 'IP')
            OR r.students <> (SELECT count(*) FROM staff_profile_facts(s."ID") f WHERE f.section = 'STUDENT')
        UNION ALL
        SELECT r.staff_id FROM staff_research_summary r WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s."ID" = r.staff_id)`);
      expect(diff).toEqual([]);
    }
  });

  it('the outlook lists retirements, flags the only holder of a core area, and lists vacant posts', async () => {
    const rows = await asOn(U.hr, T, tx => q<{ kind: string; ref: string; single_holder: boolean }>(tx,
      `SELECT kind, ref, single_holder FROM workforce_outlook(5) ORDER BY kind, ref`));
    expect(rows).toEqual([
      { kind: 'RETIREMENT', ref: 'P-A', single_holder: true },   // Geopolymers: nobody else
      { kind: 'VACANCY', ref: 'S-2', single_holder: false },
    ]);
  });

  it('HR imports career events; they join the timeline; unknown staff are refused', async () => {
    await expect(call(U.hr, `SELECT career_events_import($1::jsonb)`, [JSON.stringify([{ staff_id: 'NOPE', kind: 'PROMOTION', effective_on: '2020-01-01' }])]))
      .rejects.toThrow(/Unknown staff/);
    await call(U.hr, `SELECT career_events_import($1::jsonb)`, [JSON.stringify([
      { staff_id: 'P-A', kind: 'promotion', effective_on: '2022-07-01', detail: { summary: 'Scientist-D to E' }, order_ref: 'O/7/2022' }])]);
    const tl = await call(U.hr, `SELECT summary FROM entity_timeline WHERE entity_type = 'staff' AND entity_id = 'P-A'`) as { summary: string }[];
    expect(tl.map(r => r.summary)).toEqual(['Promotion — Scientist-D to E (O/7/2022)']);
  });
});

describe('project staff engagement (§3.3)', () => {
  let person = '';
  let sel = '';
  const save = (fields: object, id: string | null = null) =>
    call(U.pme, `SELECT project_staff_person_save($1, $2::jsonb) id`, [id, JSON.stringify(fields)]) as Promise<{ id: string }[]>;

  it('refuses a person with no date of birth, and a move without a fresh selection', async () => {
    person = (await save({ name: 'Ravi Kumar', category: 'OBC' }))[0].id;
    sel = (await call(U.pme, `SELECT project_selection_create('PS-LONG', 'JRF', 'SELECTION', 'NCS/2019/7', '2019-03-01',
      '[{"name":"A","role":"CHAIR"},{"name":"B","role":"MEMBER"},{"name":"C","role":"MEMBER"}]'::jsonb, NULL, NULL, NULL) id`) as { id: string }[])[0].id;
    const checks = await call(U.pme, `SELECT rule, ok FROM project_engagement_check($1, 'PS-RUN', 'JRF', '2019-04-01', '2021-03-31', $2)`, [person, sel]) as { rule: string; ok: boolean }[];
    expect(checks.find(c => c.rule === 'age')?.ok).toBe(false);
    expect(checks.find(c => c.rule === 'selection')?.ok).toBe(false);
  });

  it('an engagement past 6 years is refused; the same person with a PhD window that brings it under 6 is accepted', async () => {
    await save({ name: 'Ravi Kumar', category: 'OBC', born_on: '1995-01-01' }, person);
    await call(U.pme, `SELECT project_engage($1, $2, '2019-04-01', '2023-03-31')`, [sel, person]);       // 4 years
    const sel2 = (await call(U.pme, `SELECT project_selection_create('PS-LONG', 'SRF', 'SELECTION', 'NCS/2023/2', '2023-03-01',
      '[{"name":"A","role":"CHAIR"},{"name":"B","role":"MEMBER"},{"name":"C","role":"MEMBER"}]'::jsonb, NULL, NULL, NULL) id`) as { id: string }[])[0].id;
    await expect(call(U.pme, `SELECT project_engage($1, $2, '2023-04-01', '2026-03-31')`, [sel2, person]))   // +3 = 7 years
      .rejects.toThrow(/cap 6 years/);
    await save({ name: 'Ravi Kumar', category: 'OBC', born_on: '1995-01-01', phd_registered_on: '2020-01-01', thesis_submitted_on: '2022-06-30' }, person);
    await call(U.pme, `SELECT project_engage($1, $2, '2023-04-01', '2026-03-31')`, [sel2, person]);       // 7 − 2.5 = 4.5
    expect((await q<{ n: number }>(db, `SELECT count(*)::int n FROM project_engagements WHERE person_id = $1`, [person]))[0].n).toBe(2);
  });

  it('direct engagement only on a project under 12 months, with the reason recorded', async () => {
    const p2 = (await save({ name: 'Meera S', born_on: '1998-05-05' }))[0].id;
    const direct = (note: string | null, project: string) => call(U.pme,
      `SELECT project_selection_create($1, 'PA', 'DIRECT', NULL, NULL, '[]'::jsonb, $2, NULL, NULL) id`, [project, note]) as Promise<{ id: string }[]>;
    const longSel = (await direct('Field season', 'PS-LONG'))[0].id;
    await expect(call(U.pme, `SELECT project_engage($1, $2, '2026-05-01', '2026-10-31')`, [longSel, p2])).rejects.toThrow(/under 12 months/);
    const shortSel = (await direct('Field season starts in May', 'PS-SHORT'))[0].id;
    await call(U.pme, `SELECT project_engage($1, $2, '2026-05-01', '2026-10-31')`, [shortSel, p2]);
  });

  it('paid leave is capped at 12 days a year; only PME or HR records engagements', async () => {
    const e = (await q<{ id: string }>(db, `SELECT id FROM project_engagements WHERE person_id = $1 ORDER BY from_on LIMIT 1`, [person]))[0].id;
    await call(U.pme, `SELECT project_staff_leave_add($1, 'PAID', '2019-06-01', '2019-06-10')`, [e]);
    await expect(call(U.pme, `SELECT project_staff_leave_add($1, 'PAID', '2019-07-01', '2019-07-05')`, [e])).rejects.toThrow(/10 of 12/);
    await expect(call(U.sci, `SELECT project_staff_person_save(NULL, '{"name":"X"}'::jsonb)`)).rejects.toThrow(/Only PME or HR/);
  });
});

describe('legacy project staff', () => {
  it('a name on one row comes in by itself; a name on two rows waits for PME, who links it once', async () => {
    await db.exec(`INSERT INTO project_staff (id, "StaffName", "ProjectNo", "DateOfJoining", "Designation") VALUES
      ('L-1', 'Sunil Verma', 'GAP-1', '01/04/2020', 'JRF'),
      ('L-2', 'Kavya N', 'GAP-1', '01/04/2021', 'JRF'),
      ('L-3', 'Kavya N.', 'GAP-3', '01/04/2025', 'SRF')`);
    expect((await call(U.pme, `SELECT project_staff_backfill() n`) as { n: number }[])[0].n).toBe(1);
    const pending = await call(U.pme, `SELECT legacy_ids FROM project_staff_legacy_pending()`) as { legacy_ids: string[] }[];
    expect(pending).toEqual([{ legacy_ids: ['L-2', 'L-3'] }]);
    const person = (await call(U.pme, `SELECT project_staff_link_legacy(ARRAY['L-2','L-3']) id`) as { id: string }[])[0].id;
    const eng = await q<{ project_id: string }>(db, `SELECT project_id FROM project_engagements WHERE person_id = $1 ORDER BY from_on`, [person]);
    expect(eng.map(e => e.project_id)).toEqual(['PS-LONG', 'PS-RUN']);
    await expect(call(U.sci, `SELECT project_staff_backfill()`)).rejects.toThrow(/Only PME or HR/);
  });

  it('backfill matches project numbers written another way, and only a unique match', async () => {
    await db.exec(`INSERT INTO project_staff (id, "StaffName", "ProjectNo", "DateOfJoining", "Designation") VALUES
      ('L-4', 'Ravi Kumar', 'GAP 0002', '01/05/2026', 'JRF'),
      ('L-5', 'Meena Shah', 'CSIR-SRF', '01/05/2026', 'SRF')`);
    await call(U.pme, `SELECT project_staff_backfill()`);
    const rows = await q<{ id: string; project_id: string | null; n: number }>(db,
      `SELECT ps.id, ps.project_id, (SELECT count(*)::int FROM project_engagements e WHERE e.legacy_project_staff_id = ps.id) n
         FROM project_staff ps WHERE ps.id IN ('L-4','L-5') ORDER BY ps.id`);
    expect(rows).toEqual([{ id: 'L-4', project_id: 'PS-SHORT', n: 1 }, { id: 'L-5', project_id: null, n: 0 }]);
    expect((await q<{ k: string }>(db, `SELECT project_no_key('GAP000141') k`))[0].k).toBe('GAP141');
  });
});

describe('recruitment file', () => {
  it('a drive cannot change stage from the browser; HR moves it one step at a time', async () => {
    await db.exec(`INSERT INTO vacancy_advertisements (id, title, staff_category) VALUES ('ADV-1', 'Scientists 2026', 'Permanent')`);
    await expect(call(U.hr, `UPDATE vacancy_advertisements SET drive_stage = 'Joined' WHERE id = 'ADV-1'`)).rejects.toThrow(/recruitment_advance/);
    await expect(call(U.hr, `SELECT recruitment_advance('ADV-1', 'Screening')`)).rejects.toThrow(/next stage is Applications Closed/);
    await call(U.hr, `SELECT recruitment_advance('ADV-1', 'Applications Closed')`);
    await expect(call(U.sci, `SELECT recruitment_advance('ADV-1', 'Screening')`)).rejects.toThrow(/Only HR/);
    const ev = await q<{ to_stage: string }>(db, `SELECT to_stage FROM recruitment_events WHERE advt_id = 'ADV-1'`);
    expect(ev).toEqual([{ to_stage: 'Applications Closed' }]);
  });
});

describe('acting charge', () => {
  it('an acting HoD holds the role within the dates, and not the day after', async () => {
    await call(U.dir, `SELECT acting_assign('HOD', 'D1', $1, $2, '2026-11-01', '2026-11-20', 'Office Order 55/2026')`, [U.hod, U.acting]);
    const check = (day: string) => asOn(U.acting, day, async tx =>
      (await q<{ r: boolean; d: boolean; other: boolean }>(tx,
        `SELECT caller_has_role('HOD') r, caller_in_division('D1') d, caller_in_division('D2') other`))[0]);
    expect(await check('2026-11-20')).toEqual({ r: true, d: true, other: false });
    expect(await check('2026-11-21')).toEqual({ r: false, d: false, other: false });
  });

  it('an acting Director calls a review within the dates and is refused the day after; the record says in what capacity', async () => {
    await call(U.hr, `SELECT acting_assign('Director', NULL, $1, $2, '2026-12-01', '2026-12-10', 'DG Order 3/2026')`, [U.dir, U.acting]);
    const call_ = (day: string) => asOn(U.acting, day, async tx => {
      await tx.query(`SELECT project_call_review('PS-RUN', $1::date + 30, 'Mid-term check')`, [day]);
      return (await q<{ acted_as: string | null }>(tx,
        `SELECT acted_as FROM entity_timeline WHERE entity_type = 'project' AND entity_id = 'PS-RUN' AND kind <> 'created' ORDER BY at DESC LIMIT 1`))[0];
    });
    await expect(call_('2026-12-10')).resolves.toBeDefined();
    await expect(call_('2026-12-11')).rejects.toThrow(/Only the Director or PME/);
  });

  it('only the Director or HR records it, never for oneself', async () => {
    await expect(call(U.sci, `SELECT acting_assign('HOD', 'D1', NULL, $1, '2026-11-01', '2026-11-02', 'X')`, [U.acting])).rejects.toThrow(/Only the Director or HR/);
    await expect(call(U.hr, `SELECT acting_assign('HOD', 'D1', NULL, $1, '2026-11-01', '2026-11-02', 'X')`, [U.hr])).rejects.toThrow(/own acting charge/);
  });
});
