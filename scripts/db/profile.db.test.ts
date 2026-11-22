// @vitest-environment node
// Enterprise P2 — staff_profile_facts (20261112000010), update_own_profile
// (…11), profile_consistency_issues / _sweep (…12).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7f000000-0000-0000-0000-0000000000${n}`;
const U = { asha: u('01'), hod1: u('02'), hod2: u('03'), other: u('04'), dir: u('05') } as const;

let db: PGlite;
type Fact = { section: string; record_id: string; role: string; link: string };
const facts = (uid: string, staffId: string, from: string | null = null, to: string | null = null) =>
  as(db, uid, async tx => (await tx.query<Fact>(
    `SELECT section, record_id, role, link FROM staff_profile_facts($1, $2::date, $3::date)`, [staffId, from, to])).rows);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@p.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.asha}', 'Scientist', 'D1'), ('${U.hod1}', 'HOD', 'D1'), ('${U.hod2}', 'HOD', 'D2'),
      ('${U.other}', 'Scientist', 'D1'), ('${U.dir}', 'Director', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.staff ("ID", "Name", "Division", "Designation", user_id, "DOJ", "VidwanID") VALUES
      ('P-ASHA', 'Asha Verma', 'D1', 'Scientist E', '${U.asha}', '01/07/2010', 'V-1'),
      ('P-OTHER', 'Meena Rao', 'D1', 'Scientist C', '${U.other}', NULL, NULL);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('PP-1', 'OLP-0101', 'Red mud bricks', 'D1', 'P-ASHA'),
      ('PP-2', 'OLP-0202', 'Fly ash foam', 'D1', NULL);
    UPDATE public.projects SET "PrincipalInvestigator" = 'Dr. Asha Verma' WHERE "ProjectID" = 'PP-2';
    INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code) VALUES
      ('PO-1', 'Geopolymer from red mud', ARRAY['Asha Verma', 'J. Smith'], 'J Mat', 2025, 'D1'),
      ('PO-2', 'Old work', ARRAY['Asha Verma'], 'J Old', 2019, 'D1');
    INSERT INTO public.phd_students ("EnrollmentNo", "StudentName", "SupervisorName", "DivisionCode")
      VALUES ('E-1', 'Ravi', 'Asha Verma', 'D1');
    INSERT INTO public.irins_profiles (vidwan_id, profile_data) VALUES ('V-1',
      '{"publications": [{"title": "Geopolymer from Red Mud!"}, {"title": "A paper only on IRINS", "year": "2024"}]}');
    INSERT INTO public.pms_awps (staff_id, reporting_year, projects)
      VALUES ('P-ASHA', '2026-27', '[{"kind": "Project", "details": "Lab work on OLP-0202 foam"}]');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('staff_profile_facts', () => {
  it('lists the person\'s records by key, each with a link', async () => {
    const rows = await facts(U.asha, 'P-ASHA');
    expect(rows.map(r => `${r.section}:${r.record_id}`).sort()).toEqual([
      'AWP:' + rows.find(r => r.section === 'AWP')!.record_id,
      'OUTPUT:PO-1', 'OUTPUT:PO-2', 'PROJECT:PP-1', 'SERVICE:P-ASHA', 'STUDENT:E-1',
    ].sort());
    expect(rows.find(r => r.record_id === 'PP-1')).toMatchObject({ role: 'PI', link: '/projects/PP-1' });
    // PP-2 names her only by display name: not hers until linked.
    expect(rows.some(r => r.record_id === 'PP-2')).toBe(false);
  });

  it('a date window keeps only that year', async () => {
    const rows = await facts(U.asha, 'P-ASHA', '2025-04-01', '2026-03-31');
    expect(rows.filter(r => r.section === 'OUTPUT').map(r => r.record_id)).toEqual(['PO-1']);
  });

  it('the division HoD sees the profile; another division\'s HoD gets no rows', async () => {
    expect((await facts(U.hod1, 'P-ASHA')).length).toBeGreaterThan(0);
    expect(await facts(U.hod2, 'P-ASHA')).toEqual([]);
    expect(await facts(U.other, 'P-ASHA')).toEqual([]);
  });
});

describe('update_own_profile', () => {
  it('changes allowed fields on the caller\'s own row and logs the change', async () => {
    await as(db, U.asha, tx => tx.query(`SELECT update_own_profile($1::jsonb)`,
      [JSON.stringify({ Expertise: 'Geopolymers', orcid: '0000-0002-1825-0097' })]));
    const row = (await db.query<{ e: string; o: string }>(`SELECT "Expertise" e, orcid o FROM staff WHERE "ID" = 'P-ASHA'`)).rows[0];
    expect(row).toEqual({ e: 'Geopolymers', o: '0000-0002-1825-0097' });
    const tl = await as(db, U.asha, async tx => (await tx.query<{ summary: string }>(
      `SELECT summary FROM entity_timeline WHERE entity_type = 'staff' AND entity_id = 'P-ASHA'`)).rows);
    expect(tl).toEqual([{ summary: 'Profile updated: Expertise, orcid' }]);
  });

  it('refuses any other field and a malformed ORCID', async () => {
    await expect(as(db, U.asha, tx => tx.query(`SELECT update_own_profile('{"Designation": "Director"}'::jsonb)`)))
      .rejects.toThrow(/cannot change Designation/);
    await expect(as(db, U.asha, tx => tx.query(`SELECT update_own_profile('{"orcid": "123"}'::jsonb)`)))
      .rejects.toThrow(/ORCID/);
  });

  it('refuses a login with no staff link', async () => {
    await expect(as(db, U.dir, tx => tx.query(`SELECT update_own_profile('{"Ext": "1234"}'::jsonb)`)))
      .rejects.toThrow(/not linked/);
  });
});

describe('profile consistency', () => {
  it('finds the IRINS paper missing from SURYA, the unlinked PI and the work-plan project', async () => {
    const rows = await as(db, U.dir, async tx => (await tx.query<{ kind: string; record_ref: string }>(
      `SELECT kind, record_ref FROM profile_consistency_issues('P-ASHA')`)).rows);
    expect(rows).toEqual([
      { kind: 'AWP_PROJECT_NOT_ON_TEAM', record_ref: 'PP-2' },
      { kind: 'IRINS_OUTPUT_NOT_IN_SURYA', record_ref: 'A paper only on IRINS' },
      { kind: 'PI_NAME_UNLINKED', record_ref: 'PP-2' },
    ]);
  });

  it('the sweep raises one request for the person, and not a second while it is open', async () => {
    const first = (await db.query<{ n: number }>(`SELECT profile_consistency_sweep() n`)).rows[0].n;
    const second = (await db.query<{ n: number }>(`SELECT profile_consistency_sweep() n`)).rows[0].n;
    expect([first, second]).toEqual([1, 0]);
    const req = (await db.query<{ assignee_id: string; link: string }>(
      `SELECT assignee_id, link FROM contribution_requests WHERE record_ref = 'P-ASHA'`)).rows;
    expect(req).toEqual([{ assignee_id: U.asha, link: '/me' }]);
  });

  it('the sweep cannot be run from a browser', async () => {
    await expect(as(db, U.dir, tx => tx.query(`SELECT profile_consistency_sweep()`))).rejects.toThrow(/permission denied/);
  });
});
