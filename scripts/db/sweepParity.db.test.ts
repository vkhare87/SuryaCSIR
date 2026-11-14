// @vitest-environment node
// Enterprise P1 / EI4 — every deadline rule in src/lib/dashboard/myActions.ts
// is also raised by notifications_sweep() (20261112000008), with nobody
// logged in. One row per myActions kind: fixture → who must be told.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb } from './pgliteHarness';

const u = (n: string) => `7c000000-0000-0000-0000-0000000000${n}`;
const U = { pi: u('01'), pme: u('02'), fin: u('03'), dir: u('04'), hod: u('05'), hodOther: u('06'), member: u('07') } as const;
const DAY = '2026-11-12';
const PROP = '7d000000-0000-0000-0000-000000000001';

let db: PGlite;
let sent: { user_id: string; kind: string; dedupe_key: string }[] = [];

beforeAll(async () => {
  db = await migratedDb();
  const users = Object.values(U).map(id => `('${id}', '${id.slice(-2)}@s.local')`).join(', ');
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ${users};
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.pi}', 'Scientist', 'D1'), ('${U.pme}', 'PME', NULL), ('${U.fin}', 'FinanceAdmin', NULL),
      ('${U.dir}', 'Director', NULL), ('${U.hod}', 'HOD', 'D1'), ('${U.hodOther}', 'HOD', 'D2'),
      ('${U.member}', 'Scientist', 'D1');
    INSERT INTO public.staff ("ID", "Name", "Division", user_id, "DOB") VALUES
      ('SW-PI', 'Dr Pi Person', 'D1', '${U.pi}', NULL),
      ('SW-M', 'Meena Member', 'D1', '${U.member}', NULL),
      ('SW-OLD', 'Old Timer', 'D1', NULL, '01/02/1967');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", pi_staff_id) VALUES
      ('SW-P1', 'SW-1', 'Sweep project', 'D1', 'SW-PI');
    UPDATE public.projects SET stage = 'ACTIVE', start_date = '2023-04-01', end_date = '2026-10-31' WHERE "ProjectID" = 'SW-P1';
    DELETE FROM public.project_review_slots WHERE project_id = 'SW-P1';
    INSERT INTO public.project_review_slots (project_id, kind, body, period_label, period_end, due_date)
      VALUES ('SW-P1', 'PROGRESS_REPORT', 'Progress report', 'H1 2026-27', '2026-09-30', '2026-11-30');
    INSERT INTO public.project_change_requests (id, project_id, kind, status, round, created_by)
      VALUES ('7d000000-0000-0000-0000-000000000002', 'SW-P1', 'REPHASING', 'UNDER_REVIEW', 1, '${U.pi}');
    INSERT INTO public.project_change_steps (change_id, round, seq, kind, status) VALUES
      ('7d000000-0000-0000-0000-000000000002', 1, 1, 'PME_VETTING', 'DONE'),
      ('7d000000-0000-0000-0000-000000000002', 1, 2, 'FINANCE', 'PENDING'),
      ('7d000000-0000-0000-0000-000000000002', 1, 3, 'DIRECTOR_FORWARD', 'PENDING');
    INSERT INTO public.proposals (id, title, pi_user_id, pi_name, created_by, status, track)
      VALUES ('${PROP}', 'Sweep proposal', '${U.pi}', 'Dr Pi Person', '${U.pi}', 'SUBMITTED', 'ULIP');
    INSERT INTO public.project_reports (project_no, project_name, division_code, period_label, status, submitted_by)
      VALUES ('SW-OTHER', 'Other project', 'D1', 'Q2 2026-27', 'SUBMITTED', '${U.pi}');
    INSERT INTO public.action_items (task, assigned_to, deadline, status)
      VALUES ('Send the minutes', 'Meena Member', '2026-11-20', 'Pending');
  `);
  await db.transaction(async tx => {
    await tx.exec(`CREATE OR REPLACE FUNCTION public.ist_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT '${DAY}'::date $$`);
    await tx.query(`SELECT public.notifications_sweep()`);
    sent = (await tx.query<{ user_id: string; kind: string; dedupe_key: string }>(
      `SELECT user_id, kind, dedupe_key FROM notifications ORDER BY kind, user_id`)).rows;
    await tx.rollback();
  });
}, 180000);

afterAll(async () => { await db?.close(); });

const told = (kind: string, prefix: string) =>
  sent.filter(s => s.kind === kind && s.dedupe_key.startsWith(prefix)).map(s => s.user_id).sort();

// myActions kind → sweep kind, dedupe prefix, and who is told.
const PARITY: [string, string, string, string[]][] = [
  ['project-review: progress report due', 'project-review', 'project-slot:', [U.pi]],
  ['project-change: only the step whose turn it is', 'project-change', 'change-step:', [U.fin]],
  ['project-closure: report due after the end date', 'project-closure', 'closure-due:', [U.pi]],
  ['proposal: awaiting vetting', 'proposal', 'proposal-desk:', [U.pme]],
  ['progress-report: awaiting review, in-division heads only', 'progress-report', 'progress-review:', [U.dir, U.hod].sort()],
  ['action-item: name resolved to one staff member', 'action-item', 'action-item:', [U.member]],
  ['retirement: within six months', 'retirement', 'retirement:', [U.dir, U.hod].sort()],
];

describe('sweep parity with My Actions', () => {
  it.each(PARITY)('%s', (_label, kind, prefix, users) => {
    expect(told(kind, prefix)).toEqual(users);
  });
});
