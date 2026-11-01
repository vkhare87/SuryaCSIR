// @vitest-environment node
// Helpdesk ticket RPCs against every real migration (see pgliteHarness.ts).
// ponytail: PGlite is one session, so two truly concurrent calls cannot be
// staged here; the race fix is checked by the lock being present in the
// function body. A real two-connection race test needs the CI Postgres.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const SUBMITTER = '60000000-0000-0000-0000-000000000001';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${SUBMITTER}', 'sub@t.local')`);
}, 180000);

afterAll(async () => { await db?.close(); });

const create = () => as(db, SUBMITTER, async tx => {
  const id = (await tx.query<{ id: string }>(
    `SELECT public.helpdesk_create_ticket('Leaking tap', 'Infrastructure', 'Low', 'Lab 3', $1) AS id`,
    [SUBMITTER])).rows[0].id;
  return (await tx.query<{ token: string }>(`SELECT token FROM tickets WHERE id = $1`, [id])).rows[0].token;
});

describe('ticket tokens (BUG-06)', () => {
  it('keep climbing past 999 in one day', async () => {
    await db.exec(`
      INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, status)
      SELECT 'AMPRI-' || to_char(current_date, 'YYMMDD') || '-' || lpad(n::text, 3, '0'),
             'seed', 'Infrastructure', 'Low', 'seed', '${SUBMITTER}', 'Open'
        FROM generate_series(1, 999) n;
    `);
    expect(await create()).toMatch(/-1000$/);
    expect(await create()).toMatch(/-1001$/);
  });
});

describe('check-then-act is serialized (BUG-06)', () => {
  const body = async (fn: string) =>
    (await db.query<{ d: string }>(`SELECT pg_get_functiondef('public.${fn}'::regproc) AS d`)).rows[0].d;

  it('token generation takes a per-day advisory lock', async () => {
    expect(await body('helpdesk_create_ticket')).toMatch(/pg_advisory_xact_lock/);
  });

  it('status and assignment changes lock the ticket row before checking it', async () => {
    expect(await body('helpdesk_update_status')).toMatch(/FROM public\.tickets WHERE id = p_ticket_id FOR UPDATE/);
    expect(await body('helpdesk_assign_ticket')).toMatch(/FROM public\.tickets WHERE id = p_ticket_id FOR UPDATE/);
  });
});
