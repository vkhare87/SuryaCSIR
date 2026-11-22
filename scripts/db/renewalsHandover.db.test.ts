// @vitest-environment node
// Patent renewal and fellowship-end alerts, and the leaver list (20261122000007).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7c700000-0000-0000-0000-0000000000${n}`;
const U = { hod: u('01'), hod2: u('02'), inventor: u('03'), sup: u('04'), cosup: u('05') } as const;

let db: PGlite;

const told = async (kind: string) => (await db.query<{ user_id: string; title: string }>(
  `SELECT user_id, title FROM notifications WHERE kind = $1 ORDER BY title, user_id`, [kind])).rows;

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@r.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.hod}', 'HOD', 'D1'), ('${U.hod2}', 'HOD', 'D2'),
      ('${U.inventor}', 'Scientist', 'D1'), ('${U.sup}', 'Scientist', 'D1'), ('${U.cosup}', 'Scientist', 'D1');
    UPDATE public.user_profiles p SET active_role = (SELECT role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1);
    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Materials'), ('D2', 'Energy') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id, "DOB") VALUES
      ('R-INV', 'Ira Inventor', 'D1', '${U.inventor}', NULL),
      ('R-SUP', 'Sam Supervisor', 'D1', '${U.sup}', to_char(public.ist_today() - interval '60 years' + interval '3 months', 'YYYY-MM-DD')),
      ('R-CO',  'Cora Cosup', 'D1', '${U.cosup}', NULL),
      ('R-FAR', 'Far Future', 'D1', NULL, to_char(public.ist_today() - interval '40 years', 'YYYY-MM-DD'));
    -- Filed 5 years ago less 30 days: the 5th anniversary is 30 days away.
    INSERT INTO public.ip_intelligence (id, title, type, status, filing_date, division_code) VALUES
      ('IP-DUE',  'Foam panel',   'Patent', 'Granted',   to_char(public.ist_today() - interval '5 years' + interval '30 days', 'YYYY-MM-DD'), 'D1'),
      ('IP-FILED','Coating',      'Patent', 'Filed',     to_char(public.ist_today() - interval '5 years' + interval '30 days', 'YYYY-MM-DD'), 'D1'),
      ('IP-FAR',  'Alloy',        'Patent', 'Granted',   to_char(public.ist_today() - interval '5 years' + interval '90 days', 'YYYY-MM-DD'), 'D1'),
      ('IP-NEW',  'Sensor',       'Patent', 'Granted',   to_char(public.ist_today() - interval '1 year' + interval '30 days', 'YYYY-MM-DD'), 'D1');
    INSERT INTO public.ip_inventors (ip_id, pos, author_name, staff_id) VALUES ('IP-DUE', 1, 'Ira Inventor', 'R-INV');
    INSERT INTO public.phd_students ("EnrollmentNo", "StudentName", "DivisionCode", supervisor_staff_id, cosupervisor_staff_id, "CurrentStatus", fellowship_end) VALUES
      ('E-SOON', 'Asha',  'D1', 'R-SUP', 'R-CO', 'Ongoing',          public.ist_today() + 90),
      ('E-DONE', 'Bela',  'D1', 'R-SUP', NULL,   'Thesis Submitted', public.ist_today() + 90),
      ('E-DEF',  'Devi',  'D1', 'R-SUP', NULL,   'Defended',         public.ist_today() + 90),
      ('E-FAR',  'Chand', 'D1', 'R-SUP', NULL,   'Ongoing',          public.ist_today() + 400);
    INSERT INTO public.equipment ("UInsID", "Name", "Division", owner_user_id) VALUES ('R-EQ', 'SEM', 'D1', '${U.sup}');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('R-P1', 'RP-1', 'Running', 'D1', 'R-SUP'), ('R-P2', 'RP-2', 'Closed', 'D1', 'R-SUP');
    UPDATE public.projects SET stage = 'ACTIVE' WHERE "ProjectID" = 'R-P1';
    UPDATE public.projects SET stage = 'CLOSED' WHERE "ProjectID" = 'R-P2';
    INSERT INTO public.action_items (task, assigned_to, deadline, status) VALUES
      ('Send the minutes', 'R-SUP', public.ist_today() + 5, 'Pending'),
      ('Old task', 'R-SUP', public.ist_today() - 5, 'Completed');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('renewal_watch_sweep', () => {
  // Each test starts from one fresh sweep, so any test can run on its own.
  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.notifications WHERE kind IN ('patent-renewal', 'fellowship-end');
      UPDATE public.phd_students SET fellowship_end = public.ist_today() + 90 WHERE "EnrollmentNo" = 'E-SOON';
    `);
    await db.query(`SELECT public.renewal_watch_sweep()`);
  });

  it('tells inventors and the division head about a granted patent whose renewal falls within 60 days', async () => {
    expect(await told('patent-renewal')).toEqual([
      { user_id: U.hod, title: 'Patent renewal due: Foam panel' },
      { user_id: U.inventor, title: 'Patent renewal due: Foam panel' },
    ]);
  });

  it('tells supervisors and the head about a fellowship ending within 180 days before submission, not after submission or defence', async () => {
    expect(await told('fellowship-end')).toEqual([
      { user_id: U.hod, title: 'Fellowship ends soon: Asha' },
      { user_id: U.sup, title: 'Fellowship ends soon: Asha' },
      { user_id: U.cosup, title: 'Fellowship ends soon: Asha' },
    ].sort((a, b) => a.title.localeCompare(b.title) || a.user_id.localeCompare(b.user_id)));
  });

  it('runs again without repeating, and tells again when the fellowship is extended', async () => {
    expect((await db.query<{ n: number }>(`SELECT public.renewal_watch_sweep() n`)).rows[0].n).toBe(0);
    await db.exec(`UPDATE public.phd_students SET fellowship_end = public.ist_today() + 120 WHERE "EnrollmentNo" = 'E-SOON'`);
    expect((await db.query<{ n: number }>(`SELECT public.renewal_watch_sweep() n`)).rows[0].n).toBe(3);
  });

  it('cannot be run by a signed-in user', async () => {
    await expect(as(db, U.hod, tx => tx.query(`SELECT public.renewal_watch_sweep()`))).rejects.toThrow(/permission denied/);
  });
});

describe('leaver list', () => {
  it('lists what a person holds that must pass to someone else', async () => {
    const rows = (await db.query<{ kind: string; ref: string }>(
      `SELECT kind, ref FROM public.staff_handover('R-SUP') ORDER BY kind, ref`)).rows;
    expect(rows.map(r => `${r.kind}:${r.ref}`)).toEqual([
      expect.stringMatching(/^ACTION_ITEM:/),
      'INSTRUMENT:R-EQ',
      'PROJECT:R-P1',
      'STUDENT:E-DEF',
      'STUDENT:E-DONE',
      'STUDENT:E-FAR',
      'STUDENT:E-SOON',
    ]);
  });

  it('lists people leaving within the window with their item count', async () => {
    const rows = (await db.query<{ staff_id: string; reason: string; items: number }>(
      `SELECT staff_id, reason, items FROM public.leaving_staff(12)`)).rows;
    expect(rows).toEqual([{ staff_id: 'R-SUP', reason: 'Retirement', items: 7 }]);
  });

  it('runs for a signed-in head under their own row-level security', async () => {
    const rows = await as(db, U.hod, tx => tx.query<{ staff_id: string }>(`SELECT staff_id FROM public.leaving_staff(12)`));
    expect(rows.rows.map(r => r.staff_id)).toContain('R-SUP');
  });
});
