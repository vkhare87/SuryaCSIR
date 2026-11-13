// @vitest-environment node
// Enterprise P1 / EA4 — CSIR rules as dated rows (20261112000004).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7a000000-0000-0000-0000-0000000000${n}`;
const U = { master: u('01'), hr: u('02'), guest: u('03') } as const;

let db: PGlite;
const rule = (key: string, on: string) =>
  as(db, U.hr, async tx => (await tx.query<{ v: unknown }>(`SELECT csir_rule($1, $2::date) v`, [key, on])).rows[0].v);
const set = (uid: string, key: string, value: unknown, from: string) =>
  as(db, uid, tx => tx.query(`SELECT csir_rule_set($1, $2::jsonb, 'INR', $3::date, '§3.1', false)`,
    [key, JSON.stringify(value), from]));

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${U.master}', 'm@r'), ('${U.hr}', 'h@r'), ('${U.guest}', 'g@r');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role) VALUES
      ('${U.master}', 'MasterAdmin'), ('${U.hr}', 'HRAdmin'), ('${U.guest}', 'Guest');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('csir_rule', () => {
  it('answers the starting value from the OM date on', async () => {
    expect(await rule('project.major_equipment_threshold_inr', '2026-01-01')).toBe(500000);
    expect(await rule('project_staff.age_relaxation_years', '2026-01-01')).toEqual({ SC: 5, ST: 5, PwBD: 5, Women: 5, OBC: 3 });
  });

  it('raises for a date with no row, never a default', async () => {
    await expect(rule('project.major_equipment_threshold_inr', '2020-01-01')).rejects.toThrow(/no CSIR rule/);
    await expect(rule('no.such.rule', '2026-01-01')).rejects.toThrow(/no CSIR rule/);
  });

  it('is hidden from an unverified user', async () => {
    await expect(as(db, U.guest, tx => tx.query(`SELECT csir_rule('project.cost_overrun_dg_limit_pct')`)))
      .rejects.toThrow(/no CSIR rule/);
  });
});

describe('csir_rule_set', () => {
  it('is MasterAdmin only, and rows cannot be written directly', async () => {
    await expect(set(U.hr, 'project.major_equipment_threshold_inr', 600000, '2027-04-01')).rejects.toThrow(/Only MasterAdmin/);
    await expect(as(db, U.master, tx => tx.query(`UPDATE csir_rules SET value = '1'`))).rejects.toThrow(/permission denied/);
  });

  it('a new value answers from its date; the old value still answers for an old date', async () => {
    await set(U.master, 'project.major_equipment_threshold_inr', 600000, '2027-04-01');
    expect(await rule('project.major_equipment_threshold_inr', '2027-03-31')).toBe(500000);
    expect(await rule('project.major_equipment_threshold_inr', '2027-04-01')).toBe(600000);
  });

  it('refuses a date before the latest row', async () => {
    await expect(set(U.master, 'project.major_equipment_threshold_inr', 1, '2026-01-01')).rejects.toThrow(/already has a value/);
  });

  it('the RCE route reads the registry', async () => {
    const steps = async (pct: number) => (await db.query<{ k: string[] }>(
      `SELECT project_change_step_kinds('HQ', 'RCE', $1) k`, [pct])).rows[0].k;
    expect(await steps(20)).not.toContain('REVISED_COST_COMMITTEE');
    expect(await steps(21)).toContain('REVISED_COST_COMMITTEE');
  });
});
