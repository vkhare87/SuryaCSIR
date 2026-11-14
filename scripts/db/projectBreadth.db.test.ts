// @vitest-environment node
// Enterprise P9 — schemes, multi-lab projects, publication file (20261113000009).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c500000-0000-0000-0000-0000000000${n}`;
const U = { pme: u('01'), asha: u('02'), meena: u('03'), hod: u('04') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const num = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]));

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@b.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pme}', 'PME', NULL), ('${U.asha}', 'Scientist', 'D1'), ('${U.meena}', 'Scientist', 'D1'), ('${U.hod}', 'HOD', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('B-1', 'Asha Verma', 'D1', '${U.asha}'), ('B-2', 'Meena Rao', 'D1', '${U.meena}'), ('B-3', 'Hari Das', 'D1', '${U.hod}');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", track, stage, "SponsorerName")
      VALUES ('BP-1', 'HCP-77', 'Two-lab project', 'D1', 'HQ', 'ACTIVE', NULL),
             ('BP-2', 'EFP-01', 'Sponsored', 'D1', 'EFP', 'SANCTIONED', 'DST');
    INSERT INTO public.project_documents (id, project_id, doc_type, storage_path, file_name, uploaded_by) VALUES
      ('00000000-0000-0000-0000-00000000d001', 'BP-1', 'other', 'p/rc.pdf', 'rc.pdf', '${U.pme}'),
      ('00000000-0000-0000-0000-00000000d002', 'BP-1', 'other', 'p/ipa.pdf', 'ipa.pdf', '${U.pme}');
    INSERT INTO public.project_budget_lines (id, project_id, fiscal_year, head, amount) VALUES
      ('00000000-0000-0000-0000-0000000000b1', 'BP-1', '2026-27', 'EQUIPMENT', 600),
      ('00000000-0000-0000-0000-0000000000b2', 'BP-1', '2026-27', 'CONSUMABLES', 400);
    INSERT INTO public.project_fund_receipts (id, project_id, received_on, fiscal_year, amount, order_no, recorded_by) VALUES
      ('00000000-0000-0000-0000-0000000000c1', 'BP-1', '2026-05-01', '2026-27', 500, 'RO-1', '${U.pme}'),
      ('00000000-0000-0000-0000-0000000000c2', 'BP-1', '2026-05-02', '2026-27', 300, 'RO-2', '${U.pme}');
    INSERT INTO public.project_expenditure (id, project_id, fiscal_year, period, head, amount, recorded_by) VALUES
      ('00000000-0000-0000-0000-0000000000e1', 'BP-1', '2026-27', 'Q1', 'EQUIPMENT', 200, '${U.pme}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('schemes', () => {
  it('EFP and OLP exist with their own review steps; the sponsor is the authority', async () => {
    expect((await q<{ k: string[] }>(db, `SELECT proposal_step_kinds('EFP') k`))[0].k).toEqual(['PME_VETTING', 'FINANCE', 'DIRECTOR_FORWARD', 'COMPETENT_AUTHORITY']);
    expect((await q<{ k: string[] }>(db, `SELECT proposal_step_kinds('OLP') k`))[0].k).toEqual(['PME_VETTING', 'REVIEW_COMMITTEE', 'DIRECTOR_APPROVAL']);
    expect(await q(db, `SELECT "ApprovalAuthority" a FROM projects WHERE "ProjectID" = 'BP-2'`)).toEqual([{ a: 'DST' }]);
  });
});

describe('multi-lab', () => {
  it('money is shown per lab, and a reversal stays with its lab', async () => {
    await call(U.pme, `SELECT project_lab_set('BP-1', 'AMPRI', 'NODAL', '00000000-0000-0000-0000-00000000d001')`);
    await call(U.pme, `SELECT project_lab_set('BP-1', 'nml', 'PARTICIPATING', NULL)`);
    await expect(call(U.pme, `SELECT project_entry_set_lab('receipt', '00000000-0000-0000-0000-0000000000c2', 'IMMT')`)).rejects.toThrow(/Add IMMT/);
    await call(U.pme, `SELECT project_entry_set_lab('receipt', '00000000-0000-0000-0000-0000000000c2', 'NML')`);
    await call(U.pme, `SELECT project_entry_set_lab('budget', '00000000-0000-0000-0000-0000000000b2', 'NML')`);
    await call(U.pme, `SELECT project_reverse_entry('receipt', '00000000-0000-0000-0000-0000000000c2', 'wrong amount')`);
    await expect(call(U.asha, `SELECT project_lab_set('BP-1', 'IMMT', 'PARTICIPATING', NULL)`)).rejects.toThrow(/Only PME/);

    const rows = (await call<Record<string, unknown>>(U.pme, `SELECT * FROM project_lab_money('BP-1')`)).map(num);
    expect(rows).toEqual([
      { lab_code: 'AMPRI', role: 'NODAL', sanctioned: 600, received: 500, spent: 200, balance: 300 },
      { lab_code: 'NML', role: 'PARTICIPATING', sanctioned: 400, received: 0, spent: 0, balance: 0 },
    ]);
  });

  it('a running two-lab project without an IP agreement is flagged until one is filed', async () => {
    expect((await q<{ m: boolean }>(db, `SELECT project_ip_agreement_missing('BP-1') m`))[0].m).toBe(true);
    await call(U.pme, `SELECT project_ip_agreement_add('BP-1', '00000000-0000-0000-0000-00000000d002', '2026-06-01')`);
    expect((await q<{ m: boolean }>(db, `SELECT project_ip_agreement_missing('BP-1') m`))[0].m).toBe(false);
  });
});

describe('publication file', () => {
  let id = '';
  it('cannot be submitted without a communication number and every in-house consent', async () => {
    const authors = JSON.stringify([{ name: 'Asha Verma', staff_id: 'B-1' }, { name: 'J. Smith', staff_id: null }, { name: 'Meena Rao', staff_id: 'B-2' }]);
    await expect(call(U.hod, `SELECT publication_file_create('X', 'D1', $1::jsonb)`, [authors])).rejects.toThrow(/one of the authors/);
    await expect(call(U.asha, `SELECT publication_file_create('X', 'D9', $1::jsonb)`, [authors])).rejects.toThrow(/own division/);
    id = (await call<{ id: string }>(U.asha, `SELECT publication_file_create('Red mud geopolymers', 'D1', $1::jsonb) id`, [authors]))[0].id;

    await call(U.asha, `SELECT publication_move($1, 'ETHICS_CHECK', '{"similarity_pct": 8}')`, [id]);
    await expect(call(U.asha, `SELECT publication_move($1, 'CLEARED')`, [id])).rejects.toThrow(/not their own/);
    const no = (await call<{ n: string }>(U.hod, `SELECT publication_move($1, 'CLEARED') n`, [id]))[0].n;
    expect(no).toMatch(/^AMPRI\/\d{4}\/0001$/);

    await call(U.asha, `SELECT publication_consent($1, 'Synthesis and writing')`, [id]);
    await expect(call(U.asha, `SELECT publication_move($1, 'SUBMITTED')`, [id])).rejects.toThrow(/Every in-house author/);
    await expect(call(U.hod, `SELECT publication_consent($1, 'x')`, [id])).rejects.toThrow(/not an author/);
    await call(U.meena, `SELECT publication_consent($1, 'Characterisation')`, [id]);
    await call(U.asha, `SELECT publication_move($1, 'SUBMITTED', '{"journal": "J Mat"}')`, [id]);
  });

  it('on publication it becomes a scientific output with the authors linked', async () => {
    await call(U.asha, `SELECT publication_move($1, 'ACCEPTED')`, [id]);
    const out = (await call<{ o: string }>(U.asha, `SELECT publication_move($1, 'PUBLISHED', '{"year": 2026, "doi": "10.1/x"}') o`, [id]))[0].o;
    expect(await q(db, `SELECT pos, staff_id FROM output_authors WHERE output_id = $1 ORDER BY pos`, [out]))
      .toEqual([{ pos: 1, staff_id: 'B-1' }, { pos: 2, staff_id: null }, { pos: 3, staff_id: 'B-2' }]);
    await expect(call(U.asha, `SELECT publication_move($1, 'DRAFT')`, [id])).rejects.toThrow(/cannot move/);
  });
});
