// @vitest-environment node
// 20261112000009 — the Dashboard-era policies found on the live project are
// recreated here exactly as read from it (2026-11-12), then the migration is
// run again: they must be gone, and the repo's rules must hold again.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, sqlFile } from './pgliteHarness';

const SCI = '7e000000-0000-0000-0000-000000000001';
const ADMINS = `(user_has_role('HRAdmin') OR user_has_role('SystemAdmin') OR user_has_role('MasterAdmin'))`;
const HR_TABLES = ['contract_staff', 'divisions', 'equipment', 'ip_intelligence', 'phd_students',
  'project_staff', 'projects', 'scientific_outputs', 'staff'];

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  const drift = HR_TABLES.map(t => `
    CREATE POLICY "Authenticated users can read ${t}" ON public.${t} FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Admins can write ${t}" ON public.${t} FOR ALL TO authenticated USING ${ADMINS} WITH CHECK ${ADMINS};`).join('');
  await db.exec(`
    ${drift}
    CREATE POLICY "Enable insert for authenticated users only" ON public.staff FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "HRAdmin and MasterAdmin can write contract_staff" ON public.contract_staff FOR ALL TO authenticated USING (true);
    CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "collegiums_select" ON public.pms_evaluation_committees FOR SELECT TO authenticated USING (true);
    -- 20261114000003 later ships an HR-only policy under this same name; the
    -- live drift row was the open one. Replace it to recreate the drift.
    DROP POLICY IF EXISTS "vacancy_posts_insert" ON public.vacancy_posts;
    CREATE POLICY "vacancy_posts_insert" ON public.vacancy_posts FOR INSERT TO authenticated WITH CHECK (true);
    DROP POLICY "evaluation_committees_select" ON public.pms_evaluation_committees;

    INSERT INTO auth.users (id, email) VALUES ('${SCI}', 'sci@d.local');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES ('${SCI}', 'Scientist', 'D1');
    UPDATE public.user_profiles SET active_role = 'Scientist' WHERE user_id = '${SCI}';
    INSERT INTO public.staff ("ID", "Name", "Division") VALUES ('DR-1', 'Other Division Person', 'D2');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

const readOtherDivision = () => as(db, SCI, async tx =>
  (await tx.query(`SELECT 1 FROM staff WHERE "ID" = 'DR-1'`)).rows.length);

describe('live policy drift', () => {
  it('while present, a scientist reads another division and can add staff', async () => {
    expect(await readOtherDivision()).toBe(1);
    await as(db, SCI, async tx => {
      await tx.query(`INSERT INTO staff ("ID", "Name") VALUES ('DR-X', 'Self-made')`);
      await tx.rollback();
    });
  });

  it('the migration removes every Dashboard-era policy and the repo rules hold again', async () => {
    await db.exec(sqlFile('supabase/migrations/20261112000009_live_policy_drift.sql'));
    const left = (await db.query(`SELECT policyname FROM pg_policies WHERE schemaname = 'public'
      AND (policyname LIKE '% %' OR policyname LIKE 'collegium%' OR policyname = 'vacancy_posts_insert')`)).rows;
    expect(left).toEqual([]);
    expect(await readOtherDivision()).toBe(0);
    await expect(as(db, SCI, tx => tx.query(`INSERT INTO staff ("ID", "Name") VALUES ('DR-Y', 'Self-made')`)))
      .rejects.toThrow(/row-level security/);
    const committees = (await db.query(`SELECT policyname FROM pg_policies WHERE tablename = 'pms_evaluation_committees' ORDER BY 1`)).rows;
    // The drift row is gone and the repo's read rule is back. (Write rules are
    // split by 20261114000003, which runs after this file on a real database.)
    const names = committees.map((r) => (r as { policyname: string }).policyname);
    expect(names).toContain('evaluation_committees_select');
    expect(names).not.toContain('collegiums_select');
  });
});
