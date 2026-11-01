// @vitest-environment node
// Security review phase 2 (docs/roadmap/sources/SECURITY-REVIEW-2026-11-01.md),
// checked against every real migration (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, type Tx } from './pgliteHarness';

const PENDING = 'a0000000-0000-0000-0000-000000000001';
const SCI = 'a0000000-0000-0000-0000-000000000002';
const SCI_ACTING_PENDING = 'a0000000-0000-0000-0000-000000000003';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${PENDING}', 'pending@t.local'), ('${SCI}', 'sci@t.local'), ('${SCI_ACTING_PENDING}', 'acting@t.local');
    DELETE FROM user_roles WHERE user_id IN ('${SCI}', '${SCI_ACTING_PENDING}');
    INSERT INTO user_roles (user_id, role) VALUES
      ('${SCI}', 'Scientist'), ('${SCI_ACTING_PENDING}', 'Scientist'), ('${SCI_ACTING_PENDING}', 'DefaultUser');
    UPDATE user_profiles SET active_role = 'DefaultUser' WHERE user_id = '${SCI_ACTING_PENDING}';
    INSERT INTO documents (entity_type, entity_id, doc_type, title, storage_bucket, storage_path, file_name, owner_id, access_tier)
    VALUES ('proposal', 'P1', 'note', 'Institute note', 'documents', 'legacy/P1/note.pdf', 'note.pdf', '${SCI}', 'institute');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

const one = async <T,>(tx: Tx, sql: string) => (await tx.query<{ v: T }>(sql)).rows[0].v;

describe('Ask SURYA gate (SEC-02)', () => {
  it('a pending-only account is not verified; a Scientist is', async () => {
    expect(await as(db, PENDING, tx => one(tx, `SELECT public.caller_is_verified() AS v`))).toBe(false);
    expect(await as(db, SCI, tx => one(tx, `SELECT public.caller_is_verified() AS v`))).toBe(true);
  });

  it('a Scientist acting as DefaultUser is still verified', async () => {
    expect(await as(db, SCI_ACTING_PENDING, tx => one(tx, `SELECT public.caller_is_verified() AS v`))).toBe(true);
  });

  it('the global /ask switch closes the gate; no row leaves it open', async () => {
    expect(await as(db, SCI, tx => one(tx, `SELECT public.can_use_ask_surya() AS v`))).toBe(true);
    expect(await as(db, PENDING, tx => one(tx, `SELECT public.can_use_ask_surya() AS v`))).toBe(false);
    await db.exec(`INSERT INTO feature_controls (feature_key, enabled) VALUES ('/ask', false)`);
    expect(await as(db, SCI, tx => one(tx, `SELECT public.can_use_ask_surya() AS v`))).toBe(false);
    await db.exec(`DELETE FROM feature_controls WHERE feature_key = '/ask'`);
  });

  it('anon cannot call the gate', async () => {
    expect(await one(db as unknown as Tx,
      `SELECT has_function_privilege('anon', 'public.can_use_ask_surya()', 'EXECUTE') AS v`)).toBe(false);
  });
});

describe('institute-tier documents (SEC-04)', () => {
  const count = (uid: string) => as(db, uid, tx => one<number>(tx, `SELECT count(*)::int AS v FROM documents`));

  it('a pending account reads none; a Scientist reads the institute document', async () => {
    expect(await count(PENDING)).toBe(0);
    expect(await count(SCI)).toBe(1);
  });
});

describe('upload namespace (SEC-11)', () => {
  const putObject = (uid: string, name: string) => as(db, uid, tx => tx.query(
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('documents', $1)`, [name]));
  const register = (uid: string, path: string) => as(db, uid, tx => tx.query(
    `INSERT INTO documents (entity_type, entity_id, doc_type, title, storage_bucket, storage_path, file_name, owner_id, access_tier)
     VALUES ('proposal', 'P2', 'note', 't', 'documents', $1, 'f.pdf', $2, 'owner')`, [path, uid]));

  it('an object outside the uploader\'s uid folder is refused', async () => {
    await expect(putObject(SCI, 'proposal/P2/f.pdf')).rejects.toThrow();
    await expect(putObject(SCI, `${PENDING}/proposal/P2/f.pdf`)).rejects.toThrow();
    await putObject(SCI, `${SCI}/proposal/P2/f.pdf`);
  });

  it('a registry row outside the uploader\'s uid folder is refused', async () => {
    await expect(register(SCI, 'proposal/P2/g.pdf')).rejects.toThrow();
    await register(SCI, `${SCI}/proposal/P2/g.pdf`);
  });

  it('the existing document keeps its old path and stays readable', async () => {
    const path = await as(db, SCI, tx => one<string>(tx, `SELECT storage_path AS v FROM documents WHERE entity_id = 'P1'`));
    expect(path).toBe('legacy/P1/note.pdf');
  });
});

describe('append-only audit trail (SEC-05)', () => {
  const DIRECTOR = 'a0000000-0000-0000-0000-000000000010';
  const SYSADMIN = 'a0000000-0000-0000-0000-000000000011';
  let ticketId = '';

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${DIRECTOR}', 'dir@t.local'), ('${SYSADMIN}', 'sys@t.local');
      INSERT INTO user_roles (user_id, role) VALUES ('${DIRECTOR}', 'Director'), ('${SYSADMIN}', 'SystemAdmin');
    `);
    ticketId = await as(db, SCI, tx => one<string>(tx,
      `SELECT public.helpdesk_create_ticket('Fan broken', 'Infrastructure', 'Low', 'Lab 1', '${SCI}') AS v`));
  });

  const auditRows = async (entity: string) =>
    (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log WHERE entity_type = $1`, [entity])).rows[0].n;
  // RLS turns a forbidden UPDATE/DELETE into "0 rows"; a revoked grant raises. Either way nothing may change.
  const changes = async (uid: string, sql: string) => {
    try { return (await as(db, uid, tx => tx.query(sql))).affectedRows ?? 0; } catch { return 0; }
  };

  it('a Director cannot rewrite or erase audit_log, or write it directly', async () => {
    expect(await auditRows('ticket')).toBeGreaterThan(0);
    expect(await changes(DIRECTOR, `UPDATE audit_log SET action = 'x'`)).toBe(0);
    expect(await changes(DIRECTOR, `DELETE FROM audit_log`)).toBe(0);
    await expect(as(db, DIRECTOR, tx => tx.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_id) VALUES ('ticket', gen_random_uuid(), 'forged', 'x')`))).rejects.toThrow();
  });

  it('a Director cannot edit or delete tickets, events or responses directly', async () => {
    expect(await changes(DIRECTOR, `UPDATE tickets SET status = 'Closed'`)).toBe(0);
    expect(await changes(DIRECTOR, `DELETE FROM tickets`)).toBe(0);
    expect(await changes(DIRECTOR, `DELETE FROM ticket_events`)).toBe(0);
    expect(await changes(DIRECTOR, `DELETE FROM ticket_responses`)).toBe(0);
  });

  it('the status RPC still moves the ticket and writes its history', async () => {
    const before = await auditRows('ticket');
    await as(db, SYSADMIN, tx => tx.query(
      `SELECT public.helpdesk_update_status($1, 'InProgress', $2)`, [ticketId, SYSADMIN]));
    const status = (await db.query<{ s: string }>(`SELECT status AS s FROM tickets WHERE id = $1`, [ticketId])).rows[0].s;
    expect(status).toBe('InProgress');
    expect(await auditRows('ticket')).toBe(before + 1);
    const events = (await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ticket_events WHERE ticket_id = $1`, [ticketId])).rows[0].n;
    expect(events).toBeGreaterThan(0);
  });
});
