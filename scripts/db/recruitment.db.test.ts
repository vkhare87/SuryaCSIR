// @vitest-environment node
// vacancy_applications: candidates are people, posts are post definitions
// (BUG-09). Applicant personal data is HR-only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const HR = '90000000-0000-0000-0000-000000000001';
const SCI = '90000000-0000-0000-0000-000000000002';

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${HR}', 'hr@t.local'), ('${SCI}', 'sci@t.local');
    INSERT INTO user_roles (user_id, role) VALUES ('${HR}', 'HRAdmin');
    INSERT INTO vacancy_advertisements (id, title, status) VALUES ('ADV-1', 'Scientist posts 2026', 'Open');
    INSERT INTO vacancy_posts (id, advertisement_id, designation, no_of_positions) VALUES ('ADV-1-P1', 'ADV-1', 'Scientist', 3);
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('vacancy_applications', () => {
  it('HR records an application against an advertisement and a post', async () => {
    await as(db, HR, tx => tx.query(
      `INSERT INTO vacancy_applications (advertisement_id, post_id, candidate_name, email, status)
       VALUES ('ADV-1', 'ADV-1-P1', 'A. Candidate', 'a@c.example', 'Shortlisted')`));
    const n = await as(db, HR, async tx => (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM vacancy_applications`)).rows[0].n);
    expect(n).toBe(1);
  });

  it('rejects a status the funnel does not know', async () => {
    await expect(as(db, HR, tx => tx.query(
      `INSERT INTO vacancy_applications (advertisement_id, candidate_name, status) VALUES ('ADV-1', 'B', 'Hired')`))).rejects.toThrow();
  });

  it('a non-HR user can neither read nor write applicant data', async () => {
    const n = await as(db, SCI, async tx => (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM vacancy_applications`)).rows[0].n);
    expect(n).toBe(0);
    await expect(as(db, SCI, tx => tx.query(
      `INSERT INTO vacancy_applications (advertisement_id, candidate_name) VALUES ('ADV-1', 'C')`))).rejects.toThrow();
  });
});
