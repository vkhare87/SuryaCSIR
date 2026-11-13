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
