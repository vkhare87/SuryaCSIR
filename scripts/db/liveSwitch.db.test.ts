// @vitest-environment node
// The live project still has the pre-2026-11-21 migration history. This
// rebuilds a live-shaped database (the baseline, plus the PR #32/#33/#34
// files live ran) and runs the switch: Stage 0 (whose first block drops the
// PR #32 objects), Stages 1–6 and
// everything after. The result must match a fresh build object for object.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { dbWith, migrationFiles } from './pgliteHarness';

const ARCHIVE = 'supabase/migrations_archive/2026-11-21';
const LIVE_EXTRAS = [
  '20261114120001_project_staff_self_read', '20261114120002_work_priorities', '20261114120003_notices',
  '20261114120004_home_overdue_sweep', '20261114120005_delegation', '20261114120006_general_meetings',
  '20261114120007_home_review_fixes', '20261115000001_ask_scope_guard', '20261116000001_coderabbit_security_and_db_fixes',
].map(f => `${ARCHIVE}/${f}.sql`);

// One fingerprint per object; whitespace-insensitive where Postgres keeps source text.
const SNAPSHOT = `
WITH o AS (
  SELECT 'table' k, c.relname::text nm,
         md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' ORDER BY a.attname) || c.relrowsecurity::text) h
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') GROUP BY c.relname, c.relrowsecurity
  UNION ALL SELECT 'view', c.relname::text, md5(pg_get_viewdef(c.oid)) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('v','m')
  UNION ALL SELECT 'func', p.proname::text||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(regexp_replace(p.prosrc,'\\s+',' ','g')||p.prosecdef::text||coalesce(array_to_string(p.proconfig,','),'')||coalesce(array_to_string(p.proacl::text[],','),''))
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
  UNION ALL SELECT 'policy', tablename::text||'.'||policyname::text, md5(cmd||permissive||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public'
  UNION ALL SELECT 'index', indexname::text, md5(indexdef) FROM pg_indexes WHERE schemaname='public'
  UNION ALL SELECT 'trigger', c.relname::text||'.'||t.tgname::text, md5(pg_get_triggerdef(t.oid)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
  UNION ALL SELECT 'constraint', c.relname::text||'.'||k.conname::text, md5(pg_get_constraintdef(k.oid)) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='public'::regnamespace AND k.contype <> 'n'
  UNION ALL SELECT 'grant', table_name::text||'@'||grantee::text, md5(string_agg(privilege_type,',' ORDER BY privilege_type)) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY table_name, grantee
  UNION ALL SELECT 'colgrant', table_name::text||'@'||grantee::text||'.'||column_name::text, md5(string_agg(privilege_type,',' ORDER BY privilege_type)) FROM information_schema.column_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated') GROUP BY table_name, grantee, column_name
)
SELECT k||' '||nm AS key, h FROM o`;

async function snapshot(db: PGlite): Promise<Map<string, string>> {
  const r = await db.query<{ key: string; h: string }>(SNAPSHOT);
  return new Map(r.rows.map(x => [x.key, x.h]));
}

let fresh: PGlite;
let live: PGlite;

beforeAll(async () => {
  const all = migrationFiles();
  const baseline = all.filter(f => /\/2026112100000[1-8]_/.test(f));
  const rest = all.filter(f => !baseline.includes(f));
  fresh = await dbWith(all);
  live = await dbWith([...baseline, ...LIVE_EXTRAS, ...rest]);
}, 240000);

afterAll(async () => { await fresh?.close(); await live?.close(); });

describe('switching the live project to the 2026-11-21 baseline', () => {
  it('ends in the same schema as a fresh build', async () => {
    const [a, b] = [await snapshot(fresh), await snapshot(live)];
    const differ = [...new Set([...a.keys(), ...b.keys()])].filter(k => a.get(k) !== b.get(k)).sort();
    expect(differ).toEqual([]);
  });

  it('stops before dropping a PR #32 table that has rows', async () => {
    const baseline = migrationFiles().filter(f => /\/2026112100000[1-8]_/.test(f));
    const reconcile = migrationFiles().filter(f => f.includes('20261121000009_stage0_hardening'));
    const db = await dbWith([...baseline, `${ARCHIVE}/20261114120003_notices.sql`]);
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('7c700000-0000-0000-0000-000000000001');
      INSERT INTO public.notices (notice_no, kind, title, issued_by) VALUES ('N-1', 'NOTICE', 'Kept', '7c700000-0000-0000-0000-000000000001');`);
    const sql = (await import('node:fs')).readFileSync(`${__dirname}/../../${reconcile[0]}`, 'utf-8');
    await expect(db.exec(sql)).rejects.toThrow(/public\.notices has 1 rows/);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.notices`)).rows[0].n).toBe(1);
    await db.close();
  }, 120000);
});
