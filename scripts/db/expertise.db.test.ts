// @vitest-environment node
// Enterprise P6 — expertise vocabulary and finder (20261113000006).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c200000-0000-0000-0000-0000000000${n}`;
const U = { hr: u('01'), asha: u('02'), other: u('03'), dir: u('04') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const termId = async (label: string) => (await q<{ id: string }>(db, `SELECT id FROM expertise_terms WHERE label = $1 AND status = 'ACTIVE'`, [label]))[0].id;
const find = (uid: string, terms: string[] | null, text: string | null) =>
  call<{ staff_id: string; confirmed_terms: number; evidence_count: number; retires_on: string | Date }>(uid,
    `SELECT staff_id, confirmed_terms, evidence_count, retires_on FROM expertise_find($1::uuid[], $2)`, [terms, text]);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@x.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hr}', 'HRAdmin', NULL), ('${U.asha}', 'Scientist', 'D1'), ('${U.other}', 'Scientist', 'D1'), ('${U.dir}', 'Director', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", "Designation", "DOB", "Expertise", user_id) VALUES
      ('X-ASHA', 'Asha Verma', 'D1', 'Scientist E', '01/03/1970', NULL, '${U.asha}'),
      ('X-OTHER', 'Meena Rao', 'D1', 'Scientist C', '01/01/1988', NULL, '${U.other}'),
      ('X-NOTE', 'Ravi Jain', 'D1', 'Scientist B', '01/01/1990', 'Geopolymer cements', NULL);
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('XP-1', 'OLP-0901', 'Geopolymer bricks from red mud', 'D1', 'X-ASHA');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('vocabulary', () => {
  it('HR keeps the terms; a scientist cannot', async () => {
    await call(U.hr, `INSERT INTO expertise_terms (label, kind, theme_code, created_by) VALUES
      ('Geopolymer', 'MATERIAL', '03', auth.uid()), ('Red mud', 'MATERIAL', '07', auth.uid()), ('Geopolymers', 'MATERIAL', '03', auth.uid())`);
    await expect(call(U.asha, `INSERT INTO expertise_terms (label, kind) VALUES ('Corrosion', 'TECHNIQUE')`)).rejects.toThrow(/row-level security/);
    await expect(call(U.hr, `INSERT INTO expertise_terms (label, kind) VALUES ('geopolymer ', 'MATERIAL')`)).rejects.toThrow(/duplicate/);
  });
});

describe('tags', () => {
  it('suggests terms from the titles of the person\'s records', async () => {
    const rows = await call<{ label: string; evidence_count: number }>(U.asha, `SELECT label, evidence_count FROM expertise_suggest('X-ASHA')`);
    expect(rows).toEqual([{ label: 'Geopolymer', evidence_count: 1 }, { label: 'Red mud', evidence_count: 1 }]);
  });

  it('a curator only proposes; the person confirms; nobody tags someone else', async () => {
    const geo = await termId('Geopolymer');
    await expect(call(U.hr, `INSERT INTO staff_expertise (staff_id, term_id, source, confirmed_at) VALUES ('X-OTHER', $1, 'SUGGESTED', now())`, [geo]))
      .rejects.toThrow(/row-level security/);
    await call(U.hr, `INSERT INTO staff_expertise (staff_id, term_id, source) VALUES ('X-OTHER', $1, 'SUGGESTED')`, [geo]);
    await expect(call(U.asha, `INSERT INTO staff_expertise (staff_id, term_id, source, confirmed_at) VALUES ('X-OTHER', $1, 'SELF', now())`, [await termId('Red mud')]))
      .rejects.toThrow(/row-level security/);

    // Unconfirmed: Meena is not found; Asha (project) and Ravi (note) are.
    expect((await find(U.dir, [geo], null)).map(r => r.staff_id)).toEqual(['X-ASHA', 'X-NOTE']);

    await call(U.other, `UPDATE staff_expertise SET confirmed_at = now() WHERE staff_id = 'X-OTHER'`);
    const ranked = await find(U.dir, [geo], null);
    expect(ranked.map(r => [r.staff_id, r.confirmed_terms, r.evidence_count])).toEqual([['X-OTHER', 1, 0], ['X-ASHA', 0, 1], ['X-NOTE', 0, 1]]);
    expect(String(ranked[1].retires_on instanceof Date ? ranked[1].retires_on.toISOString() : ranked[1].retires_on).slice(0, 10)).toBe('2030-03-01');
  });

  it('free text finds the same people as the term', async () => {
    const byText = await find(U.dir, null, 'geopolymer');
    expect(byText.map(r => r.staff_id)).toEqual(['X-OTHER', 'X-ASHA', 'X-NOTE']);
  });

  it('merging a term moves its tags', async () => {
    const [geo, geos] = [await termId('Geopolymer'), await termId('Geopolymers')];
    await call(U.asha, `INSERT INTO staff_expertise (staff_id, term_id, source, confirmed_at) VALUES ('X-ASHA', $1, 'SELF', now())`, [geos]);
    await expect(call(U.asha, `SELECT expertise_merge($1, $2)`, [geos, geo])).rejects.toThrow(/Only HR/);
    await call(U.hr, `SELECT expertise_merge($1, $2)`, [geos, geo]);
    const tags = await q<{ term_id: string }>(db, `SELECT term_id FROM staff_expertise WHERE staff_id = 'X-ASHA'`);
    expect(tags).toEqual([{ term_id: geo }]);
    expect((await find(U.dir, [geo], null))[0].staff_id).toBe('X-ASHA');
  });
});
