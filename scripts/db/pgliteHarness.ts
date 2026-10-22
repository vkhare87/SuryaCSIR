// In-process Postgres for database tests: PGlite (Postgres compiled to
// WASM — no server, no native DLLs) plus minimal stand-ins for the Supabase
// pieces the migrations touch: the anon/authenticated/service_role roles,
// auth.users + auth.uid()/role()/jwt(), storage.buckets/objects, and
// pg_cron. Every file in supabase/migrations is applied as-is, in order.
// ponytail: shims cover what the migrations reference today; a migration
// using another Supabase feature fails here loudly — extend the shim then.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const ROOT = resolve(__dirname, '../..');

const SUPABASE_SHIM = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_admin NOLOGIN;
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text, aud text, role text,
    encrypted_password text,
    raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}',
    email_confirmed_at timestamptz, last_sign_in_at timestamptz,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
GRANT SELECT ON auth.users TO authenticated, service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(auth.jwt()->>'sub', '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT auth.jwt()->>'role' $$;

CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets(id), name text, owner uuid,
    metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO authenticated, service_role;
GRANT SELECT ON storage.buckets TO authenticated, service_role;

CREATE SCHEMA cron;
CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
`;

/** Fresh database with every migration applied. ~seconds; share per test file. */
export async function migratedDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(SUPABASE_SHIM);
  await db.exec(`SET search_path = public, extensions`);
  const dir = join(ROOT, 'supabase/migrations');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8')
      .replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;/gi, '-- pg_cron: shimmed');
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Run `fn` as a signed-in user, the way PostgREST does (role + JWT claims). */
export async function as<T>(db: PGlite, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE authenticated`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    return fn(tx);
  });
}

export type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];

export function sqlFile(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}
