// @vitest-environment node
// SEC-18: supabase/mock/*.sql is dev-only demo data (one file creates a
// MasterAdmin with a known password). Every file must refuse to run unless the
// session opts in, and must stop psql at the first error.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDb, sqlFile } from './pgliteHarness';

const FILES = readdirSync('supabase/mock').filter(f => f.endsWith('.sql'));
const HEAD = String.raw`\set ON_ERROR_STOP on` + '\n';

let db: PGlite;
beforeAll(async () => { db = await migratedDb(); }, 180000);
afterAll(async () => { await db?.close(); });

// Windows checkouts get CRLF; PGlite runs SQL, not psql meta-commands.
const read = (f: string) => sqlFile(`supabase/mock/${f}`).replace(/\r\n/g, '\n');
const runnable = (f: string) => read(f).replace(HEAD, '');

describe('supabase/mock guard (SEC-18)', () => {
  it.each(FILES)('%s opens with the psql stop and the opt-in guard', f => {
    const sql = read(f);
    expect(sql.startsWith(HEAD)).toBe(true);
    expect(sql).toContain("current_setting('surya.allow_mock', true)");
  });

  it('refuses without the opt-in', async () => {
    await expect(db.exec(runnable('17_test_auth_users.sql'))).rejects.toThrow(/dev-only/);
    const n = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth.users WHERE email LIKE '%@test.local'`)).rows[0].n;
    expect(n).toBe(0);
  });

  it('gets past the guard with the opt-in', async () => {
    await db.exec(`SET surya.allow_mock = 'on'`);
    await expect(db.exec(runnable('01_divisions.sql'))).resolves.toBeDefined();
    await db.exec(`RESET surya.allow_mock`);
  });
});
