// @vitest-environment node
// Contribution requests: routing, the transition table, RLS and the stale
// sweep, against every real migration in an in-process Postgres.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const U = {
  admin: '30000000-0000-0000-0000-000000000001',
  steward: '30000000-0000-0000-0000-000000000002',
  hod: '30000000-0000-0000-0000-000000000003',
  owner: '30000000-0000-0000-0000-000000000004',
  deleg: '30000000-0000-0000-0000-000000000005',
  stranger: '30000000-0000-0000-0000-000000000006',
} as const;

type Row = Record<string, unknown>;

const rpc = async (tx: Tx, fn: string, args: unknown[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await tx.query<Row>(`SELECT * FROM public.${fn}(${ph})`, args)).rows;
};
const one = async (tx: Tx, sql: string, args: unknown[] = []) =>
  (await tx.query<Row>(sql, args)).rows[0];

let db: PGlite;
const su = () => db as unknown as Tx;

/** contribution_request_create as `who`; returns the new id. */
const create = async (who: string, args: unknown[]) =>
  (await as(db, who, tx => rpc(tx, 'contribution_request_create', args)))[0].contribution_request_create as string;
const act = (who: string, id: string, action: string, note: string | null = null,
  target: string | null = null, response: unknown = null) =>
  as(db, who, tx => rpc(tx, 'contribution_request_act',
    [id, action, note, target, response === null ? null : JSON.stringify(response)]));
const req = (id: string) => one(su(), `SELECT * FROM contribution_requests WHERE id = $1`, [id]);
const amc = (assignee: string | null = null) =>
  ['equipment', 'UI-1', 'IMD', 'Confirm AMC date', 'AMC field empty', '/facilities/UI-1', null,
    JSON.stringify({ AMCDate: null }), assignee];
const unowned = () => ['phd', null, null, 'Check thesis titles', 'Missing titles', '/phd', null, '{}', null];

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.admin}', 'admin@t.local'), ('${U.steward}', 'st@t.local'), ('${U.hod}', 'hod@t.local'),
      ('${U.owner}', 'own@t.local'), ('${U.deleg}', 'del@t.local'), ('${U.stranger}', 'x@t.local');
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.admin}', 'MasterAdmin', NULL), ('${U.hod}', 'HOD', 'IMD');
    UPDATE public.user_profiles SET active_role = 'HOD' WHERE user_id = '${U.hod}';
    INSERT INTO public.divisions ("divCode") VALUES ('IMD');
    INSERT INTO public.staff ("ID", "Name", "Division", "Email", user_id)
      VALUES ('T-HOD', 'HoD', 'IMD', 'hod@t.local', '${U.hod}');
  `);
  await as(db, U.admin, tx => rpc(tx, 'data_steward_set', ['equipment', null, U.steward, 'steward', 30]));
}, 180000);

afterAll(async () => { await db?.close(); });

describe('creating requests', () => {
  it('hod creates a request routed to the domain steward when no assignee given', async () => {
    const id = await create(U.hod, amc());
    const row = await req(id);
    expect(row.assignee_id).toBe(U.steward);
    expect(row.requested_by).toBe(U.hod);
    expect(row.status).toBe('open');
    const ev = await one(su(), `SELECT count(*)::int AS n FROM contribution_request_events WHERE request_id = $1 AND action = 'created'`, [id]);
    expect(ev.n).toBe(1);
    const note = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2`, [U.steward, `/work?r=${id}`]);
    expect(note.n).toBe(1);
  });

  it('stranger cannot create a request', async () => {
    await expect(create(U.stranger, amc())).rejects.toThrow(/not_authorized/);
  });

  it('link must be a relative app path', async () => {
    for (const link of ['https://x', '//x', '/\\x', '/\t/x', '/\n/x']) {
      const a = amc(); a[5] = link;
      await expect(create(U.hod, a)).rejects.toThrow(/invalid_link/);
    }
  });
});

describe('targets', () => {
  it('an unknown target user is invalid_target, not an FK error', async () => {
    const ghost = '39999999-0000-0000-0000-000000000000';
    await expect(create(U.hod, amc(ghost))).rejects.toThrow(/invalid_target/);
    const id = await create(U.hod, amc(U.owner));
    await expect(act(U.owner, id, 'delegate', null, ghost)).rejects.toThrow(/invalid_target/);
    const free = await create(U.admin, unowned());
    await expect(act(U.admin, free, 'claim', null, ghost)).rejects.toThrow(/invalid_target/);
  });
});

describe('access', () => {
  it('stranger cannot read or act on a request', async () => {
    const id = await create(U.hod, amc(U.owner));
    const n = await as(db, U.stranger, tx => one(tx, `SELECT count(*)::int AS n FROM contribution_requests WHERE id = $1`, [id]));
    expect(n.n).toBe(0);
    const e = await as(db, U.stranger, tx => one(tx, `SELECT count(*)::int AS n FROM contribution_request_events WHERE request_id = $1`, [id]));
    expect(e.n).toBe(0);
    await expect(act(U.stranger, id, 'confirm_unchanged')).rejects.toThrow(/not_authorized/);
  });

  it('participants can read their request', async () => {
    const id = await create(U.hod, amc(U.owner));
    for (const who of [U.hod, U.owner, U.steward, U.admin]) {
      const n = await as(db, who, tx => one(tx, `SELECT count(*)::int AS n FROM contribution_requests WHERE id = $1`, [id]));
      expect(n.n).toBe(1);
    }
  });

  it('stranger cannot act on an unowned request', async () => {
    const id = await create(U.admin, unowned());
    expect((await req(id)).assignee_id).toBeNull();
    for (const action of ['confirm_unchanged', 'claim', 'submit', 'withdraw']) {
      await expect(act(U.stranger, id, action, 'x', null, { a: 1 })).rejects.toThrow(/not_authorized/);
    }
  });

  it('client cannot update status directly', async () => {
    const id = await create(U.hod, amc(U.owner));
    await expect(as(db, U.owner, tx => tx.query(`UPDATE contribution_requests SET status = 'done' WHERE id = $1`, [id])))
      .rejects.toThrow(/permission denied/);
    await expect(as(db, U.owner, tx => tx.query(
      `INSERT INTO contribution_requests (domain, title, reason, status) VALUES ('staff', 't', 'r', 'done')`)))
      .rejects.toThrow(/permission denied/);
  });
});

describe('transitions', () => {
  it('delegate submits → prepared; owner confirms → submitted; requester accepts → done', async () => {
    const id = await create(U.hod, amc(U.owner));
    await act(U.owner, id, 'delegate', null, U.deleg);
    expect((await req(id)).delegate_id).toBe(U.deleg);
    await act(U.deleg, id, 'submit', null, null, { AMCDate: '2027-03-31' });
    expect((await req(id)).status).toBe('prepared');
    const prepared = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2 AND title = 'Delegate prepared an update'`, [U.owner, `/work?r=${id}`]);
    expect(prepared.n).toBe(1);
    await act(U.owner, id, 'confirm');
    expect((await req(id)).status).toBe('submitted');
    const review = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2 AND title = 'Data update submitted for review'`, [U.hod, `/work?r=${id}`]);
    expect(review.n).toBe(1);
    await act(U.hod, id, 'accept');
    const row = await req(id);
    expect(row.status).toBe('done');
    expect(row.resolved_at).not.toBeNull();
    expect(row.response).toEqual({ AMCDate: '2027-03-31' });
    const ev = (await su().query<Row>(
      `SELECT action FROM contribution_request_events WHERE request_id = $1 ORDER BY created_at`, [id])).rows;
    expect(ev.map(e => e.action)).toEqual(['created', 'delegate', 'submit', 'confirm', 'accept']);
    const note = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND title = 'Your update was accepted'`, [U.owner]);
    expect(note.n).toBe(1);
  });

  it('owner submitting directly goes straight to submitted', async () => {
    const id = await create(U.hod, amc(U.owner));
    await expect(act(U.owner, id, 'submit', null, null, null)).rejects.toThrow(/response_required/);
    await act(U.owner, id, 'submit', null, null, { AMCDate: '2027-01-01' });
    expect((await req(id)).status).toBe('submitted');
    const review = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2 AND title = 'Data update submitted for review'`, [U.hod, `/work?r=${id}`]);
    expect(review.n).toBe(1);
    await act(U.hod, id, 'return', 'Date is wrong');
    expect((await req(id)).status).toBe('open');
  });

  it('confirm_unchanged closes without review', async () => {
    const id = await create(U.hod, amc(U.owner));
    await act(U.owner, id, 'confirm_unchanged');
    const row = await req(id);
    expect(row.status).toBe('done');
    expect(row.response).toEqual({});
    expect(row.resolved_at).not.toBeNull();
  });

  it('not_mine by the steward leaves the request unowned', async () => {
    const id = await create(U.hod, amc());
    expect((await req(id)).assignee_id).toBe(U.steward);
    await act(U.steward, id, 'not_mine');
    const row = await req(id);
    expect(row.assignee_id).toBeNull();
    expect(row.status).toBe('open');
  });

  it('not_mine by a non-steward routes to the steward', async () => {
    const id = await create(U.hod, amc(U.owner));
    await act(U.owner, id, 'not_mine');
    expect((await req(id)).assignee_id).toBe(U.steward);
  });

  it('admin can claim an unowned request for a user', async () => {
    const id = await create(U.admin, unowned());
    await act(U.admin, id, 'claim', null, U.owner);
    const row = await req(id);
    expect(row.assignee_id).toBe(U.owner);
    expect(row.status).toBe('open');
    // Once owned it is no longer claimable.
    await expect(act(U.admin, id, 'claim')).rejects.toThrow(/invalid_action/);
  });

  it('clarify needs a note and returns via answer', async () => {
    const id = await create(U.hod, amc(U.owner));
    await expect(act(U.owner, id, 'clarify', '')).rejects.toThrow(/note_required/);
    await act(U.owner, id, 'clarify', 'Which contract?');
    expect((await req(id)).status).toBe('needs_clarification');
    const n = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2`, [U.hod, `/work?r=${id}`]);
    expect(n.n).toBe(1);
    await act(U.hod, id, 'answer', 'The 2026 AMC');
    expect((await req(id)).status).toBe('open');
  });

  it('cannot_provide blocks; withdraw declines', async () => {
    const id = await create(U.hod, amc(U.owner));
    await act(U.owner, id, 'cannot_provide', 'No record held');
    expect((await req(id)).status).toBe('blocked');
    await act(U.hod, id, 'withdraw', 'Dropping it');
    expect((await req(id)).status).toBe('declined');
    await expect(act(U.hod, id, 'withdraw', 'again')).rejects.toThrow(/invalid_action/);
  });

  it('invalid transition is rejected', async () => {
    const id = await create(U.hod, amc(U.owner));
    await expect(act(U.hod, id, 'accept')).rejects.toThrow(/invalid_action/);
    await expect(act(U.owner, id, 'bogus')).rejects.toThrow(/invalid_action/);
  });

  it('a delegate cannot take assignee-only actions', async () => {
    const id = await create(U.hod, amc(U.owner));
    await act(U.owner, id, 'delegate', null, U.deleg);
    await expect(act(U.deleg, id, 'confirm_unchanged')).rejects.toThrow(/not_authorized/);
  });
});

describe('stewards', () => {
  it('only an admin can set or remove a steward', async () => {
    await expect(as(db, U.hod, tx => rpc(tx, 'data_steward_set', ['staff', 'IMD', U.hod, 'steward', 90])))
      .rejects.toThrow(/not_authorized/);
    const sid = (await as(db, U.admin, tx => rpc(tx, 'data_steward_set', ['staff', 'IMD', U.hod, 'accountable', 90])))[0].data_steward_set as string;
    // Upsert: the same (domain, division, user) updates in place.
    const again = (await as(db, U.admin, tx => rpc(tx, 'data_steward_set', ['staff', 'IMD', U.hod, 'accountable', 60])))[0].data_steward_set;
    expect(again).toBe(sid);
    await expect(as(db, U.hod, tx => rpc(tx, 'data_steward_remove', [sid]))).rejects.toThrow(/not_authorized/);
    await as(db, U.admin, tx => rpc(tx, 'data_steward_remove', [sid]));
    expect((await one(su(), `SELECT count(*)::int AS n FROM data_stewards WHERE id = $1`, [sid])).n).toBe(0);
  });
});

describe('sweep', () => {
  it('authenticated cannot run the sweep', async () => {
    await expect(as(db, U.admin, tx => tx.query(`SELECT contribution_requests_sweep()`))).rejects.toThrow(/permission denied/);
  });

  it('sweep is idempotent and re-arms after a new import', async () => {
    const sweep = async () => (await one(su(), `SELECT contribution_requests_sweep() AS n`)).n;
    expect(await sweep()).toBe(1);
    expect(await sweep()).toBe(0);
    const raised = await one(su(), `SELECT * FROM contribution_requests WHERE requested_by IS NULL AND domain = 'equipment'`);
    expect(raised.assignee_id).toBe(U.steward);
    expect(raised.link).toBe('/data');
    expect(raised.title).toBe('Refresh equipment data');

    await su().query(`INSERT INTO import_events (file_type, row_count, uploaded_by, uploaded_by_email, uploaded_at)
                      VALUES ('equipment', 5, $1, 'admin@t.local', now() - interval '31 days')`, [U.admin]);
    // A newer stale period, but the first refresh request is still open.
    expect(await sweep()).toBe(0);

    // The steward closes it themselves: allowed, but marked as self-review.
    await act(U.steward, raised.id as string, 'submit', null, null, { note: 'refreshed' });
    await act(U.steward, raised.id as string, 'accept');
    const ev = await one(su(), `SELECT payload FROM contribution_request_events WHERE request_id = $1 AND action = 'accept'`, [raised.id]);
    expect(ev.payload).toMatchObject({ self_review: true });
    const selfNote = await one(su(), `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2 AND title <> 'Data refresh due'`, [U.steward, `/work?r=${raised.id}`]);
    expect(selfNote.n).toBe(0);

    expect(await sweep()).toBe(1);
    await su().query(`INSERT INTO import_events (file_type, row_count, uploaded_by, uploaded_by_email, uploaded_at)
                      VALUES ('equipment', 5, $1, 'admin@t.local', now())`, [U.admin]);
    expect(await sweep()).toBe(0);
  });
});
