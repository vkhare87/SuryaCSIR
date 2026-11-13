// @vitest-environment node
// Enterprise P8 EI2 — suggestions, accept, log (20261113000008).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const u = (n: string) => `7c400000-0000-0000-0000-0000000000${n}`;
const U = { asha: u('01'), other: u('02'), hr: u('03') } as const;

let db: PGlite;
const q = async <T,>(tx: Tx | PGlite, sql: string, args: unknown[] = []) => (await tx.query<T>(sql, args)).rows;
const call = <T,>(uid: string, sql: string, args: unknown[] = []) => as(db, uid, tx => q<T>(tx, sql, args));
const note = async (uid: string, kind: string) =>
  (await q<{ id: string }>(db, `SELECT id FROM notifications WHERE user_id = $1 AND kind = $2`, [uid, kind]))[0]?.id;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@a.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.asha}', 'Scientist', 'D1'), ('${U.other}', 'Scientist', 'D1'), ('${U.hr}', 'HRAdmin', NULL);
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials') ON CONFLICT DO NOTHING;
    -- Two people share the name, so the author is not linked by itself.
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('A-1', 'Asha Verma', 'D1', '${U.asha}'), ('A-2', 'Asha Verma', 'D1', NULL), ('A-3', 'Meena Rao', 'D1', '${U.other}');
    INSERT INTO public.scientific_outputs (id, title, authors, journal, year, division_code)
      VALUES ('AO-1', 'Fly ash geopolymers', ARRAY['Asha Verma'], 'J Mat', 2025, 'D1');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('AP-1', 'OLP-91', 'Geopolymer bricks', 'D1', 'A-1'), ('AP-2', 'OLP-92', 'Geopolymer roads', 'D1', 'A-1');
    INSERT INTO public.expertise_terms (label, kind) VALUES ('Geopolymer', 'MATERIAL');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('suggestions', () => {
  it('the sweep suggests the paper and the expertise to the person with the login', async () => {
    expect((await q<{ n: number }>(db, `SELECT ai_suggest_sweep() n`))[0].n).toBe(2);
    expect(await note(U.asha, 'suggest-identity-link')).toBeTruthy();
    expect(await note(U.asha, 'suggest-expertise')).toBeTruthy();
    expect((await q<{ n: number }>(db, `SELECT ai_suggest_sweep() n`))[0].n).toBe(0);
    await expect(call(U.other, `SELECT ai_suggest_sweep()`)).rejects.toThrow(/Only MasterAdmin/);
  });

  it('accepting runs the action as the user and logs both', async () => {
    const id = await note(U.asha, 'suggest-identity-link');
    await expect(call(U.other, `SELECT notification_accept($1)`, [id])).rejects.toThrow(/Nothing to accept/);
    await call(U.asha, `SELECT notification_accept($1)`, [id]);
    expect(await q(db, `SELECT staff_id FROM output_authors WHERE output_id = 'AO-1'`)).toEqual([{ staff_id: 'A-1' }]);
    expect(await q(db, `SELECT user_id, action_kind, outcome FROM ai_action_log WHERE notification_id = $1`, [id]))
      .toEqual([{ user_id: U.asha, action_kind: 'identity_link', outcome: 'DONE' }]);
    await expect(call(U.asha, `SELECT notification_accept($1)`, [id])).rejects.toThrow(/Nothing to accept/);

    const tag = await note(U.asha, 'suggest-expertise');
    await call(U.asha, `SELECT notification_accept($1)`, [tag]);
    expect((await q<{ c: boolean }>(db, `SELECT confirmed_at IS NOT NULL c FROM staff_expertise WHERE staff_id = 'A-1'`))[0].c).toBe(true);
  });

  it('an action off the whitelist cannot run and changes nothing', async () => {
    await db.exec(`INSERT INTO notifications (user_id, kind, title, source, dedupe_key, proposed_action)
      VALUES ('${U.other}', 'evil', 'x', 'agent', 'evil-1', '{"kind": "delete_everything"}')`);
    const id = await note(U.other, 'evil');
    await expect(call(U.other, `SELECT notification_accept($1)`, [id])).rejects.toThrow(/not allowed/);
    expect(await q(db, `SELECT status FROM notifications WHERE id = $1`, [id])).toEqual([{ status: 'open' }]);
    await expect(call(U.other, `INSERT INTO ai_action_log (user_id, action_kind, outcome) VALUES ('${U.other}', 'x', 'DONE')`)).rejects.toThrow(/permission denied/);
  });

  it('nobody confirms expertise for someone else through a forged suggestion', async () => {
    const term = (await q<{ id: string }>(db, `SELECT id FROM expertise_terms LIMIT 1`))[0].id;
    await db.exec(`INSERT INTO notifications (user_id, kind, title, source, dedupe_key, proposed_action)
      VALUES ('${U.other}', 'forged', 'x', 'agent', 'forged-1', '{"kind": "expertise_confirm", "args": {"staff_id": "A-2", "term_id": "${term}"}}')`);
    await expect(call(U.other, `SELECT notification_accept($1)`, [await note(U.other, 'forged')])).rejects.toThrow(/own expertise/);
  });
});
