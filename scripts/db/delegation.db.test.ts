// @vitest-environment node
// Lane 1 DH2 — the delegation dial (20261114120005).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c600000-0000-0000-0000-0000000000${n}`;
const U = { dir: u('01'), acting: u('02'), hod: u('03'), sci: u('04') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const issue = (who: string, lines: unknown[], preset = 'BALANCED') =>
  call<{ id: string }>(who, `SELECT delegation_issue($1, $2::jsonb) id`, [preset, JSON.stringify(lines)]).then(r => r[0].id);
const authority = (kind: string, div: string | null, amount: number | null = null, requester: string | null = null) =>
  call<{ authority: string; mode: string | null }>(U.sci, `SELECT authority, mode FROM decision_authority($1, $2, $3, $4)`, [kind, div, amount, requester])
    .then(r => r[0]);

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@d.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL), ('${U.acting}', 'Scientist', 'D1'), ('${U.hod}', 'HOD', 'D1'), ('${U.sci}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials') ON CONFLICT DO NOTHING;
    INSERT INTO public.acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref)
      VALUES ('Director', NULL, '${U.dir}', '${U.acting}', public.ist_today() - 1, public.ist_today() + 5, 'O/1');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('delegation_issue', () => {
  it('with no order in force, every module keeps its own rule', async () => {
    expect(await authority('INDENT', 'D1', 100)).toEqual({ authority: 'UNCHANGED', mode: null });
    expect(await authority('MOU_SIGNING', 'D1')).toEqual({ authority: 'DIRECTOR', mode: 'SELF' });
  });

  it('only a held Director issues; an acting Director and a head cannot', async () => {
    const lines = [{ kind: 'INDENT', mode: 'HEAD_TELL', limit: 500000 }];
    await expect(issue(U.acting, lines)).rejects.toThrow(/Only the Director/);
    await expect(issue(U.hod, lines)).rejects.toThrow(/Only the Director/);
  });

  it('a line below the floor is refused with the rule', async () => {
    await expect(issue(U.dir, [{ kind: 'APPRAISAL_GRADE', mode: 'HEAD_TELL' }])).rejects.toThrow(/cannot be delegated \(rule delegation\.floor\.APPRAISAL_GRADE\)/);
  });

  it('an order is numbered, published as an office order, and replaces the one before', async () => {
    const first = await issue(U.dir, [{ kind: 'LEAVE_TOUR', mode: 'HEAD_FLAGS' }]);
    const second = await issue(U.dir, [
      { kind: 'INDENT', mode: 'HEAD_TELL', limit: 500000 },
      { kind: 'PS_HIRE_EXTEND', mode: 'HEAD_TELL', division: 'D1' },
      { kind: 'LEAVE_TOUR', mode: 'HEAD_FLAGS' },
    ]);
    const rows = await q<{ id: string; order_no: string; ended: boolean; notice: string | null }>(db,
      `SELECT id, order_no, ended_at IS NOT NULL ended, notice_id::text notice FROM delegation_orders ORDER BY issued_at`);
    expect(rows.map(r => [r.id === first, r.ended])).toEqual([[true, true], [false, false]]);
    expect(rows[1].id).toBe(second);
    expect(rows.map(r => r.order_no.replace(/\/\d{4}\//, '/Y/'))).toEqual(['DO/Y/01', 'DO/Y/02']);
    const notice = await q<{ kind: string; title: string }>(db, `SELECT kind, title FROM notices WHERE id = $1`, [rows[1].notice]);
    expect(notice[0]).toEqual({ kind: 'OFFICE_ORDER', title: `Delegation of decisions ${rows[1].order_no}` });
    expect((await q<{ s: number }>(db, `SELECT sample_rate s FROM delegation_lines WHERE order_id = $1 AND kind = 'LEAVE_TOUR'`, [second]))[0].s).toBe(10);
  });
});

describe('decision_authority', () => {
  it('sends an item to the head within the limit and to the Director above it', async () => {
    expect(await authority('INDENT', 'D1', 300000)).toEqual({ authority: 'HEAD', mode: 'HEAD_TELL' });
    expect(await authority('INDENT', 'D1', 740000)).toEqual({ authority: 'DIRECTOR', mode: 'HEAD_TELL' });
  });

  it('follows a division line, and keeps kinds not on the order with the Director', async () => {
    expect(await authority('PS_HIRE_EXTEND', 'D1')).toEqual({ authority: 'HEAD', mode: 'HEAD_TELL' });
    expect(await authority('PS_HIRE_EXTEND', 'D2')).toEqual({ authority: 'DIRECTOR', mode: 'SELF' });
    expect(await authority('PROPOSAL', 'D1')).toEqual({ authority: 'DIRECTOR', mode: 'SELF' });
  });

  it('never lets a head decide their own request, and keeps floor kinds with the Director', async () => {
    expect(await authority('LEAVE_TOUR', 'D1', null, U.hod)).toMatchObject({ authority: 'DIRECTOR' });
    expect(await authority('LEAVE_TOUR', 'D1', null, U.sci)).toMatchObject({ authority: 'HEAD', mode: 'HEAD_FLAGS' });
    expect(await authority('MOU_SIGNING', 'D1')).toEqual({ authority: 'DIRECTOR', mode: 'SELF' });
  });

  it('a newer rule row can lift a floor', async () => {
    await db.exec(`INSERT INTO csir_rules (rule_key, value, effective_from, source_ref) VALUES ('delegation.floor.WRITE_OFF', 'false', public.ist_today() - 1, 'test')`);
    expect((await q<{ f: boolean }>(db, `SELECT delegation_is_floor('WRITE_OFF') f`))[0].f).toBe(false);
    expect((await q<{ f: boolean }>(db, `SELECT delegation_is_floor('MOU_SIGNING') f`))[0].f).toBe(true);
  });

  it('fails closed: unknown amount, acting head asking, floor with no order, no limit, future order', async () => {
    expect(await authority('INDENT', 'D1', null)).toMatchObject({ authority: 'DIRECTOR' });
    await db.exec(`INSERT INTO acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref)
                   VALUES ('HOD', 'D1', '${U.hod}', '${U.sci}', public.ist_today() - 1, public.ist_today() + 3, 'O/2')`);
    expect(await authority('LEAVE_TOUR', 'D1', null, U.sci)).toMatchObject({ authority: 'DIRECTOR' });
    expect(await authority('LEAVE_TOUR', null, null, U.hod)).toMatchObject({ authority: 'DIRECTOR' });
    await expect(issue(U.dir, [{ kind: 'INDENT', mode: 'HEAD_TELL' }])).rejects.toThrow(/Give a money limit for INDENT/);
    await expect(call(U.dir, `SELECT delegation_issue('BALANCED', '[]'::jsonb, public.ist_today() + 3)`)).rejects.toThrow(/day it is issued/);
  });

  it('nobody writes the order tables directly', async () => {
    await expect(call(U.dir, `UPDATE delegation_lines SET mode = 'SELF'`)).rejects.toThrow(/permission denied/);
  });
});
