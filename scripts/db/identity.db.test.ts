// @vitest-environment node
// Enterprise P1 / EA1 EA2 EA3 — author links (20261112000005), typed HR
// dates (…06) and the entity timeline (…07).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7b000000-0000-0000-0000-0000000000${n}`;
const U = { hr: u('01'), asha: u('02'), kumar1: u('03'), sci: u('04') } as const;

let db: PGlite;
const links = async () => (await db.query<{ pos: number; author_name: string; staff_id: string | null }>(
  `SELECT pos, author_name, staff_id FROM output_authors WHERE output_id = 'O1' ORDER BY pos`)).rows;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${U.hr}', 'h@i'), ('${U.asha}', 'a@i'), ('${U.kumar1}', 'k@i'), ('${U.sci}', 's@i');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hr}', 'HRAdmin', NULL), ('${U.asha}', 'Scientist', 'D1'), ('${U.kumar1}', 'Scientist', 'D1'), ('${U.sci}', 'Scientist', 'D1');
    INSERT INTO public.staff ("ID", "Name", "Division", user_id, "DOJ", "DOB") VALUES
      ('S-ASHA', 'Dr. Asha Verma', 'D1', '${U.asha}', '01/07/2010', 'not a date'),
      ('S-K1', 'R. Kumar', 'D1', '${U.kumar1}', NULL, NULL),
      ('S-K2', 'R Kumar', 'D1', NULL, NULL, NULL),
      ('S-SCI', 'Meena Rao', 'D1', '${U.sci}', NULL, NULL);
    INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code)
      VALUES ('O1', 'Red mud', ARRAY['Asha Verma', 'R. Kumar', 'J. Smith'], 'J', 2025, 'D1');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('author links', () => {
  it('links a name only when one staff member alone carries it', async () => {
    expect(await links()).toEqual([
      { pos: 1, author_name: 'Asha Verma', staff_id: 'S-ASHA' },
      { pos: 2, author_name: 'R. Kumar', staff_id: null },   // two R Kumars: never guessed
      { pos: 3, author_name: 'J. Smith', staff_id: null },
    ]);
  });

  it('lists only names a person must decide — not an external co-author', async () => {
    const gaps = await as(db, U.hr, async tx => (await tx.query<{ kind: string; name: string; candidates: number }>(
      `SELECT kind, name, candidates FROM identity_link_gaps() WHERE kind = 'OUTPUT'`)).rows);
    expect(gaps).toEqual([{ kind: 'OUTPUT', name: 'R. Kumar', candidates: 2 }]);
    await expect(as(db, U.sci, tx => tx.query(`SELECT * FROM identity_link_gaps()`))).rejects.toThrow(/not authorized/);
  });

  it('a staff member may claim an unlinked name as their own, not as someone else', async () => {
    await expect(as(db, U.sci, tx => tx.query(`SELECT identity_set_link('OUTPUT', 'O1', 2, 'S-K1')`))).rejects.toThrow(/not authorized/);
    await as(db, U.kumar1, tx => tx.query(`SELECT identity_set_link('OUTPUT', 'O1', 2, 'S-K1')`));
    expect((await links())[1].staff_id).toBe('S-K1');
    // Now linked to R. Kumar: another person cannot take it over.
    await expect(as(db, U.sci, tx => tx.query(`SELECT identity_set_link('OUTPUT', 'O1', 2, 'S-SCI')`))).rejects.toThrow(/not authorized/);
  });

  it('a manual link survives the automatic pass; a changed name loses its link', async () => {
    await as(db, U.hr, tx => tx.query(`SELECT identity_link_authors()`));
    expect((await links())[1].staff_id).toBe('S-K1');
    await db.exec(`UPDATE scientific_outputs SET authors = ARRAY['Asha Verma', 'Meena Rao'] WHERE id = 'O1'`);
    expect(await links()).toEqual([
      { pos: 1, author_name: 'Asha Verma', staff_id: 'S-ASHA' },
      { pos: 2, author_name: 'Meena Rao', staff_id: 'S-SCI' },
    ]);
  });

  it('cannot be written directly', async () => {
    await expect(as(db, U.hr, tx => tx.query(`UPDATE output_authors SET staff_id = 'S-SCI'`))).rejects.toThrow(/permission denied/);
  });
});

describe('typed HR dates', () => {
  it('fills the twin from the text; a date that does not parse stays missing', async () => {
    const r = (await db.query<{ doj: string | null; dob: string | null }>(
      `SELECT doj_date::text doj, dob_date::text dob FROM staff WHERE "ID" = 'S-ASHA'`)).rows[0];
    expect(r).toEqual({ doj: '2010-07-01', dob: null });
    await db.exec(`UPDATE staff SET "DOB" = '15.03.1970' WHERE "ID" = 'S-ASHA'`);
    expect((await db.query<{ d: string }>(`SELECT dob_date::text d FROM staff WHERE "ID" = 'S-ASHA'`)).rows[0].d).toBe('1970-03-15');
  });
});

describe('entity timeline', () => {
  it('shows a project\'s events in order', async () => {
    await db.exec(`
      INSERT INTO projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode") VALUES ('TP1', 'T-1', 'Timeline', 'D1');
      INSERT INTO project_events (project_id, at, kind, summary) VALUES
        ('TP1', '2026-01-01', 'funds', 'Funds received'),
        ('TP1', '2026-03-01', 'change', 'Change request approved'),
        ('TP1', '2026-02-01', 'review', 'Review held');
    `);
    const rows = await as(db, U.hr, async tx => (await tx.query<{ kind: string }>(
      `SELECT kind FROM entity_timeline WHERE entity_type = 'project' AND entity_id = 'TP1' ORDER BY at`)).rows);
    expect(rows.map(r => r.kind)).toEqual(['funds', 'review', 'change', 'created']); // 'created' is the insert itself, today
  });
});

describe('staff link gaps and removal of display-name RLS fallback (A3b / 0.5)', () => {
  it('resolves unambiguous names via identity_link_authors and ambiguous rows via identity_set_link to drive admin_staff_link_gaps() to zero', async () => {
    // Link S-K2 to an auth user so only table-link gaps remain under test
    const uK2 = '7b000000-0000-0000-0000-000000000099';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${uK2}', 'k2@i');
      UPDATE public.staff SET user_id = '${uK2}' WHERE "ID" = 'S-K2';
      INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "PrincipalInvestigator", "DivisionCode")
      VALUES
        ('PRJ-EXACT', 'P-E1', 'Exact PI',       'Dr. Asha Verma', 'D2'),
        ('PRJ-NORM',  'P-N1', 'Unstripped PI',  'Asha Verma',     'D2'),
        ('PRJ-AMBIG', 'P-A1', 'Ambiguous PI',   'Dr. R. Kumar',   'D2');
      INSERT INTO public.phd_students ("EnrollmentNo", "StudentName", "SupervisorName", "CoSupervisorName", "DivisionCode")
      VALUES ('PHD-GAP-1', 'Scholar A', 'Dr. R. Kumar', 'Asha Verma', 'D2');
      INSERT INTO public.project_staff (id, "StaffName", "ProjectNo", "DivisionCode")
      VALUES ('PS-GAP-1', 'Dr. R. Kumar', 'P-E1', 'D2');
    `);

    // Exact unique name auto-links on insert via sync_staff_key; honorific variant links via identity_link_authors; ambiguous stays NULL.
    const prjExact = (await db.query<{ pi_staff_id: string | null }>(`SELECT pi_staff_id FROM projects WHERE "ProjectID" = 'PRJ-EXACT'`)).rows[0];
    expect(prjExact.pi_staff_id).toBe('S-ASHA');

    const prjNormBefore = (await db.query<{ pi_staff_id: string | null }>(`SELECT pi_staff_id FROM projects WHERE "ProjectID" = 'PRJ-NORM'`)).rows[0];
    expect(prjNormBefore.pi_staff_id).toBeNull();

    await as(db, U.hr, tx => tx.query(`SELECT identity_link_authors()`));
    const prjNormAfter = (await db.query<{ pi_staff_id: string | null }>(`SELECT pi_staff_id FROM projects WHERE "ProjectID" = 'PRJ-NORM'`)).rows[0];
    expect(prjNormAfter.pi_staff_id).toBe('S-ASHA');

    const prjA = (await db.query<{ pi_staff_id: string | null }>(`SELECT pi_staff_id FROM projects WHERE "ProjectID" = 'PRJ-AMBIG'`)).rows[0];
    expect(prjA.pi_staff_id).toBeNull();

    // Display-name fallback is gone: kumar1 (named 'R. Kumar', in D1) must NOT see PRJ-AMBIG, PHD-GAP-1, or PS-GAP-1 in D2.
    const visiblePrj = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM projects WHERE "ProjectID" = 'PRJ-AMBIG'`));
    const visiblePhd = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM phd_students WHERE "EnrollmentNo" = 'PHD-GAP-1'`));
    const visiblePs = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM project_staff WHERE id = 'PS-GAP-1'`));
    expect(visiblePrj.rows).toHaveLength(0);
    expect(visiblePhd.rows).toHaveLength(0);
    expect(visiblePs.rows).toHaveLength(0);

    // Non-admin cannot link table rows
    await expect(as(db, U.kumar1, tx => tx.query(`SELECT identity_set_link('projects.PrincipalInvestigator', 'P-A1', 0, 'S-K1')`)))
      .rejects.toThrow(/not authorized/);

    // Admin links the remaining gaps via identity_set_link
    await as(db, U.hr, tx => tx.query(`
      SELECT identity_set_link('projects.PrincipalInvestigator', 'P-A1', 0, 'S-K1'),
             identity_set_link('phd_students.SupervisorName', 'PHD-GAP-1', 0, 'S-K1'),
             identity_set_link('project_staff.StaffName', 'PS-GAP-1', 0, 'S-K1');
    `));

    const remaining = await as(db, U.hr, tx => tx.query(`SELECT * FROM admin_staff_link_gaps()`));
    expect(remaining.rows).toEqual([]);

    // Once linked to S-K1, kumar1 sees those records cleanly by staff_id.
    const linkedPrj = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM projects WHERE "ProjectID" = 'PRJ-AMBIG'`));
    const linkedPhd = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM phd_students WHERE "EnrollmentNo" = 'PHD-GAP-1'`));
    const linkedPs = await as(db, U.kumar1, tx => tx.query(`SELECT 1 FROM project_staff WHERE id = 'PS-GAP-1'`));
    expect(linkedPrj.rows).toHaveLength(1);
    expect(linkedPhd.rows).toHaveLength(1);
    expect(linkedPs.rows).toHaveLength(1);
  });
});
