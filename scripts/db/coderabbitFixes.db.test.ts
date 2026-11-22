// @vitest-environment node
// Regression tests for all 13 security and data-integrity fixes shipped in
// supabase/migrations/20261122000003_coderabbit_security_and_db_fixes.sql.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7e100000-0000-0000-0000-0000000000${n}`;
const U = {
  hr: u('01'),
  pme: u('02'),
  master: u('03'),
  sci1: u('04'),
  sci2: u('05'),
  outsider: u('06'),
  chair: u('07'),
  acting: u('08'),
} as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));

async function onDay<T>(day: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    out = await fn(tx);
    await tx.rollback();
  });
  return out as T;
}

async function asOn<T>(uid: string, day: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${day}'::date $$`);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    try { out = await fn(tx); } finally { await tx.rollback(); }
  });
  return out as T;
}

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@cr.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hr}', 'HRAdmin', NULL),
      ('${U.pme}', 'PME', NULL),
      ('${U.master}', 'MasterAdmin', NULL),
      ('${U.sci1}', 'Scientist', 'D1'),
      ('${U.sci2}', 'Scientist', 'D1'),
      ('${U.outsider}', 'Scientist', 'D2'),
      ('${U.chair}', 'Scientist', 'D1'),
      ('${U.acting}', 'Scientist', 'D1');
    UPDATE public.user_profiles p
       SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('CR-S1', 'Asha Verma', 'D1', '${U.sci1}'),
      ('CR-S2', 'Meena Rao', 'D1', '${U.sci2}'),
      ('CR-OUT', 'Dinesh Sen', 'D2', '${U.outsider}'),
      ('CR-CH', 'Chair Person', 'D1', '${U.chair}');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", track, stage, start_date, end_date, pi_staff_id) VALUES
      ('CR-P1', 'HCP-501', 'Geopolymer Study', 'D1', 'HQ', 'ACTIVE', '2025-04-01', '2028-03-31', 'CR-S1');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('CodeRabbit security and DB regression suite', () => {
  it('1. breaks mutual recursion between publication_files and publication_author_consents RLS', async () => {
    const authors = JSON.stringify([
      { name: 'Asha Verma', staff_id: 'CR-S1' },
      { name: 'Meena Rao', staff_id: 'CR-S2' },
    ]);
    const fileId = (await call<{ id: string }>(
      U.sci1,
      `SELECT publication_file_create('Recursion Check', 'D1', $1::jsonb) id`,
      [authors],
    ))[0].id;

    // Co-author Meena reads both tables as authenticated without hitting SQLSTATE 42P17.
    expect(await call<{ id: string }>(U.sci2, `SELECT id FROM publication_files WHERE id = $1`, [fileId]))
      .toEqual([{ id: fileId }]);
    expect(await call<{ staff_id: string }>(U.sci2, `SELECT staff_id FROM publication_author_consents WHERE file_id = $1 ORDER BY staff_id`, [fileId]))
      .toEqual([{ staff_id: 'CR-S1' }, { staff_id: 'CR-S2' }]);

    // Outsider sees neither.
    expect(await call(U.outsider, `SELECT id FROM publication_files WHERE id = $1`, [fileId])).toEqual([]);
    expect(await call(U.outsider, `SELECT staff_id FROM publication_author_consents WHERE file_id = $1`, [fileId])).toEqual([]);
  });

  it('2. reconsiders orphaned automatic links while still respecting deliberate manual clears', async () => {
    await db.exec(`
      INSERT INTO public.staff ("ID", "Name", "Division") VALUES ('CR-AUTO1', 'Kiran Joshi', 'D1');
      INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code)
      VALUES ('CR-O1', 'Kiran Paper', ARRAY['Kiran Joshi'], 'J Test', 2025, 'D1');
    `);
    expect(await q(db, `SELECT staff_id, link_source FROM output_authors WHERE output_id = 'CR-O1'`))
      .toEqual([{ staff_id: 'CR-AUTO1', link_source: 'auto' }]);

    // Staff deletion leaves staff_id NULL and link_source = 'auto'.
    await db.exec(`DELETE FROM public.staff WHERE "ID" = 'CR-AUTO1'`);
    expect(await q(db, `SELECT staff_id, link_source FROM output_authors WHERE output_id = 'CR-O1'`))
      .toEqual([{ staff_id: null, link_source: 'auto' }]);

    // Replacement staff import is surfaced in gaps and relinked by identity_link_authors().
    await db.exec(`INSERT INTO public.staff ("ID", "Name", "Division") VALUES ('CR-AUTO2', 'Kiran Joshi', 'D1')`);
    const gaps = await call<{ record_id: string }>(U.hr, `SELECT record_id FROM identity_link_gaps() WHERE record_id = 'CR-O1'`);
    expect(gaps).toEqual([{ record_id: 'CR-O1' }]);
    await call(U.hr, `SELECT identity_link_authors()`);
    expect(await q(db, `SELECT staff_id, link_source FROM output_authors WHERE output_id = 'CR-O1'`))
      .toEqual([{ staff_id: 'CR-AUTO2', link_source: 'auto' }]);

    // Deliberate manual clear stays cleared and absent from gaps/autolink.
    await call(U.hr, `SELECT identity_set_link('OUTPUT', 'CR-O1', 1, NULL)`);
    expect(await call(U.hr, `SELECT record_id FROM identity_link_gaps() WHERE record_id = 'CR-O1'`)).toEqual([]);
    await call(U.hr, `SELECT identity_link_authors()`);
    expect(await q(db, `SELECT staff_id, link_source FROM output_authors WHERE output_id = 'CR-O1'`))
      .toEqual([{ staff_id: null, link_source: 'manual' }]);
  });

  it('3. aligns proposal_save_copis() with proposals status constraints and RLS policies', async () => {
    const pid = (await call<{ id: string }>(
      U.sci1,
      `INSERT INTO proposals (title, pi_user_id, pi_name, created_by, status, track)
       VALUES ('CoPI Check', $1, 'Asha Verma', $1, 'DRAFT', 'ULIP') RETURNING id`,
      [U.sci1],
    ))[0].id;
    await call(U.sci1, `SELECT proposal_save_copis($1, $2::jsonb)`, [pid, JSON.stringify([{ staff_id: 'CR-S2', staff_name: 'Meena Rao' }])]);
    expect(await q(db, `SELECT staff_id FROM proposal_copis WHERE proposal_id = $1`, [pid])).toEqual([{ staff_id: 'CR-S2' }]);

    await db.exec(`UPDATE public.proposals SET status = 'REVISION_REQUESTED' WHERE id = '${pid}'`);
    await call(U.sci1, `SELECT proposal_save_copis($1, '[]'::jsonb)`, [pid]);
    expect(await q(db, `SELECT staff_id FROM proposal_copis WHERE proposal_id = $1`, [pid])).toEqual([]);

    await db.exec(`UPDATE public.proposals SET status = 'SUBMITTED' WHERE id = '${pid}'`);
    await expect(call(U.sci1, `SELECT proposal_save_copis($1, $2::jsonb)`, [pid, JSON.stringify([{ staff_id: 'CR-S2', staff_name: 'Meena Rao' }])]))
      .rejects.toThrow(/Proposal not found|while DRAFT or REVISION_REQUESTED/);
    await expect(call(U.sci1, `INSERT INTO proposal_copis (proposal_id, staff_id, staff_name) VALUES ($1, 'CR-S2', 'Meena Rao')`, [pid]))
      .rejects.toThrow(/row-level security/);
  });

  it('4. excludes post-cutoff expenditure statements from project_cpd_halfyearly()', async () => {
    await db.exec(`
      INSERT INTO public.project_expenditure (project_id, fiscal_year, period, head, amount, recorded_by) VALUES
        ('CR-P1', '2025-26', 'Q1', 'CONSUMABLES', 100, '${U.pme}'),
        ('CR-P1', '2025-26', 'H1', 'EQUIPMENT', 200, '${U.pme}'),
        ('CR-P1', '2025-26', 'H2', 'OTHER', 400, '${U.pme}'),
        ('CR-P1', '2025-26', 'FY', 'WORKS', 800, '${U.pme}');
    `);
    const sep = await onDay('2025-10-15', tx => q<{ spent: string }>(tx,
      `SELECT spent FROM project_cpd_halfyearly('2025-09-30') WHERE project_id = 'CR-P1'`));
    expect(Number(sep[0].spent)).toBe(300);

    const mar = await onDay('2026-04-10', tx => q<{ spent: string }>(tx,
      `SELECT spent FROM project_cpd_halfyearly('2026-03-31') WHERE project_id = 'CR-P1'`));
    expect(Number(mar[0].spent)).toBe(1500);
  });

  it('5. cancels future acting assignments and refuses past last-day edits after start', async () => {
    const futureId = (await call<{ id: string }>(U.hr,
      `SELECT acting_assign('HOD', 'D1', NULL, $1, '2026-11-20', '2026-11-30', 'OO/F1') id`, [U.acting]))[0].id;
    await asOn(U.hr, '2026-11-10', async tx => {
      await tx.query(`SELECT acting_end($1, '2026-11-19')`, [futureId]);
      expect(await q(tx, `SELECT id FROM acting_assignments WHERE id = $1`, [futureId])).toEqual([]);
      // Verify authority is also absent on the originally scheduled start day inside the same canceled state.
      await tx.exec(`RESET ROLE; CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-11-20'::date $$; SET LOCAL ROLE authenticated;`);
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.acting, role: 'authenticated' })]);
      const r = (await q<{ r: boolean }>(tx, `SELECT caller_has_role('HOD') r`))[0].r;
      expect(r).toBe(false);
    });

    const startedId = (await call<{ id: string }>(U.hr,
      `SELECT acting_assign('HOD', 'D1', NULL, $1, '2026-11-05', '2026-11-20', 'OO/S1') id`, [U.acting]))[0].id;
    await expect(asOn(U.hr, '2026-11-10', tx => tx.query(`SELECT acting_end($1, '2026-11-04')`, [startedId])))
      .rejects.toThrow(/cannot be before start date/);
    await asOn(U.hr, '2026-11-10', async tx => {
      await tx.query(`SELECT acting_end($1, '2026-11-15')`, [startedId]);
      expect((await q<{ to_on: string }>(tx, `SELECT to_on::text FROM acting_assignments WHERE id = $1`, [startedId]))[0].to_on)
        .toBe('2026-11-15');
    });
  });

  it('6-8. enforces waitlist non-null deadline, 12-month lifetime, and order-independent tenure cap', async () => {
    const quorum = JSON.stringify([{ name: 'A', role: 'CHAIR' }, { name: 'B', role: 'MEMBER' }, { name: 'C', role: 'MEMBER' }]);
    const personId = (await call<{ id: string }>(U.pme,
      `SELECT project_staff_person_save(NULL, '{"name":"Test Scholar","born_on":"1992-01-01"}'::jsonb) id`))[0].id;

    // 7. Reject waitlist longer than 12 months from advert_on.
    await expect(call(U.pme,
      `SELECT project_selection_create('CR-P1', 'JRF', 'WAITLIST', 'NCS/W/1', '2026-01-01', $1::jsonb, NULL, '2027-06-01', NULL)`,
      [quorum])).rejects.toThrow(/past 12 months/);

    // 6. Null waitlist deadline fails waitlist check and engagement.
    const nullWlId = (await call<{ id: string }>(U.pme,
      `SELECT project_selection_create('CR-P1', 'JRF', 'WAITLIST', 'NCS/W/2', '2026-01-01', $1::jsonb, NULL, NULL, NULL) id`,
      [quorum]))[0].id;
    const wlChecks = await call<{ rule: string; ok: boolean | null }>(U.pme,
      `SELECT rule, ok FROM project_engagement_check($1, 'CR-P1', 'JRF', '2026-02-01', '2027-01-31', $2)`,
      [personId, nullWlId]);
    expect(wlChecks.find(c => c.rule === 'waitlist')?.ok).toBe(false);
    await expect(call(U.pme, `SELECT project_engage($1, $2, '2026-02-01', '2027-01-31')`, [nullWlId, personId]))
      .rejects.toThrow(/Waitlist valid until/);

    // 8. Out-of-order later booking counts toward tenure cap.
    const validSel = (await call<{ id: string }>(U.pme,
      `SELECT project_selection_create('CR-P1', 'JRF', 'SELECTION', 'NCS/S/1', '2022-01-01', $1::jsonb, NULL, NULL, NULL) id`,
      [quorum]))[0].id;
    await call(U.pme, `SELECT project_engage($1, $2, '2025-01-01', '2029-12-31')`, [validSel, personId]); // 5 years
    await expect(call(U.pme, `SELECT project_engage($1, $2, '2022-01-01', '2024-12-31')`, [validSel, personId])) // +3 = 8 years
      .rejects.toThrow(/cap 6 years/);
  });

  it('9. allocates PAID leave separately to each fiscal year covered', async () => {
    const quorum = JSON.stringify([{ name: 'A', role: 'CHAIR' }, { name: 'B', role: 'MEMBER' }, { name: 'C', role: 'MEMBER' }]);
    const pId = (await call<{ id: string }>(U.pme,
      `SELECT project_staff_person_save(NULL, '{"name":"Leave Tester","born_on":"1996-01-01"}'::jsonb) id`))[0].id;
    const selId = (await call<{ id: string }>(U.pme,
      `SELECT project_selection_create('CR-P1', 'JRF', 'SELECTION', 'NCS/L/1', '2026-03-01', $1::jsonb, NULL, NULL, NULL) id`,
      [quorum]))[0].id;
    const engId = (await call<{ id: string }>(U.pme,
      `SELECT project_engage($1, $2, '2026-04-01', '2028-03-31') id`, [selId, pId]))[0].id;

    // 1 day in 2026-27 (Mar 31) + 11 days in 2027-28 (Apr 1..11) -> fits within 12/year in both FYs.
    await call(U.pme, `SELECT project_staff_leave_add($1, 'PAID', '2027-03-31', '2027-04-11')`, [engId]);
    // Adding 12 more days in 2027-28 (total 23 in 2027-28) must be rejected.
    await expect(call(U.pme, `SELECT project_staff_leave_add($1, 'PAID', '2027-04-12', '2027-04-23')`, [engId]))
      .rejects.toThrow(/11 of 12 days used this year \(2027-28\)/);
    // Remaining 1 day in 2027-28 is allowed.
    await call(U.pme, `SELECT project_staff_leave_add($1, 'PAID', '2027-04-12', '2027-04-12')`, [engId]);
  });

  it('10. refuses COI overwrites once the chair decides and uses an atomic upsert guard', async () => {
    const cid = '7e200000-0000-0000-0000-000000000001';
    const mid = '7e200000-0000-0000-0000-000000000002';
    await db.exec(`
      INSERT INTO public.committees (id, name, committee_type, chairperson_id, secretary_id)
      VALUES ('${cid}', 'COI Committee', 'Standing', 'CR-CH', 'CR-S2');
      INSERT INTO public.committee_members (committee_id, staff_id) VALUES ('${cid}', 'CR-S1');
      INSERT INTO public.meetings (id, committee_id, meeting_date, title) VALUES ('${mid}', '${cid}', current_date, 'Decide');
    `);
    const decId = (await call<{ id: string }>(U.sci1, `SELECT coi_declare($1, 'F2', 'Original conflict') id`, [mid]))[0].id;
    await call(U.chair, `SELECT coi_chair_decide($1, 'RECUSE')`, [decId]);
    await expect(call(U.sci1, `SELECT coi_declare($1, 'F1', NULL)`, [mid])).rejects.toThrow(/already decided/);
    expect(await q(db, `SELECT format, conflict_note FROM coi_declarations WHERE id = $1`, [decId]))
      .toEqual([{ format: 'F2', conflict_note: 'Original conflict' }]);
    const def = (await q<{ src: string }>(db, `SELECT pg_get_functiondef('public.coi_declare(uuid, text, text)'::regprocedure) src`))[0].src;
    expect(def).toMatch(/WHERE\s+coi_declarations\.chair_decision\s+IS\s+NULL/i);
  });

  it('11. calculates outputs_per_year using the snapshot as_on year', async () => {
    await db.exec(`
      INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code) VALUES
        ('CR-Y26', '2026 Output', ARRAY['Asha Verma'], 'J26', 2026, 'D1'),
        ('CR-Y27', '2027 Output', ARRAY['Asha Verma'], 'J27', 2027, 'D1');
    `);
    // Even if snapshot runs on 2027-01-01 with NULL p_as_on (resolves to 2026-12-31), it counts 2026 outputs.
    await asOn(U.master, '2027-01-01', async tx => {
      await tx.query(`SELECT metric_snapshot_run(NULL)`);
      const snap = await q<{ value: string }>(tx,
        `SELECT value FROM metric_snapshots WHERE metric_key = 'outputs_per_year' AND scope = '{"division":"D1"}' AND as_on = '2026-12-31'`);
      expect(Number(snap[0].value)).toBe(1);
    });
  });

  it('12. refuses stale identity_link notification acceptance when the author name changed', async () => {
    await db.exec(`
      INSERT INTO public.staff ("ID", "Name", "Division") VALUES ('CR-S1-DUP', 'Asha Verma', 'D1');
      INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code)
      VALUES ('CR-AI-1', 'Stale Link Test', ARRAY['Asha Verma'], 'J AI', 2026, 'D1');
    `);
    await call(U.master, `SELECT ai_suggest_sweep()`);
    const notif = (await q<{ id: string }>(db,
      `SELECT id FROM notifications WHERE user_id = $1 AND kind = 'suggest-identity-link' ORDER BY created_at DESC LIMIT 1`,
      [U.sci1]))[0].id;

    // Replace the author at pos 1 with an external name after suggestion was queued.
    await db.exec(`UPDATE public.scientific_outputs SET authors = ARRAY['External Scientist'] WHERE id = 'CR-AI-1'`);

    await expect(call(U.sci1, `SELECT notification_accept($1)`, [notif])).rejects.toThrow(/no longer matches/);
    expect(await q(db, `SELECT status FROM notifications WHERE id = $1`, [notif])).toEqual([{ status: 'open' }]);
    expect(await q(db, `SELECT staff_id FROM output_authors WHERE output_id = 'CR-AI-1' AND pos = 1`)).toEqual([{ staff_id: null }]);
  });

  it('13. restricts equipment deletion when usage log rows exist, while empty equipment still deletes', async () => {
    await db.exec(`
      INSERT INTO public.equipment ("UInsID", "Name", "Division", project_id, purchase_cost, owner_user_id) VALUES
        ('CR-EQ-USED', 'Used Rig', 'D1', 'CR-P1', 2500000, '${U.sci1}'),
        ('CR-EQ-FREE', 'Free Rig', 'D1', 'CR-P1', 2500000, '${U.sci1}');
    `);
    await call(U.sci1, `SELECT equipment_log_usage('CR-EQ-USED', current_date - 1, 2.0, 'CR-S1', 'XRD scan')`);
    await expect(call(U.hr, `DELETE FROM equipment WHERE "UInsID" = 'CR-EQ-USED'`)).rejects.toThrow(/foreign key constraint/);
    await call(U.hr, `DELETE FROM equipment WHERE "UInsID" = 'CR-EQ-FREE'`);
    expect(await q(db, `SELECT "UInsID" FROM equipment WHERE "UInsID" IN ('CR-EQ-USED', 'CR-EQ-FREE')`))
      .toEqual([{ UInsID: 'CR-EQ-USED' }]);
  });
});
