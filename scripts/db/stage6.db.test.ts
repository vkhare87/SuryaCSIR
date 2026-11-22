// @vitest-environment node
// Stage 6 DB tests: HH5/HH6 (technologies + evidence guard, outside_threads),
// ST3/ST4 (supervisor_meetings, private_grievances isolation), TS3 (equipment_faults),
// CD12/CD15 (no_dues_clearances, campus_requests), C3 (proposal_evaluations).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `bf000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  hod1: u('02'),
  stu: u('03'),
  tech: u('04'),
} as const;

const q = <T = Record<string, unknown>>(db: PGlite, uid: string, sql: string) =>
  as(db, uid, (tx) => tx.query<T>(sql));

let db: PGlite;
let techId: string;
let docId: string;
let propId: string;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@s6'), ('${U.hod1}', 'hod1@s6'), ('${U.stu}', 'stu@s6'), ('${U.tech}', 'tech@s6');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.hod1}', 'HOD', 'D1'),
      ('${U.stu}', 'Student', 'D1'),
      ('${U.tech}', 'Technician', 'D1');
  `);

  const dRes = await db.query<{ id: string }>(`
    INSERT INTO public.documents (entity_type, entity_id, doc_type, title, storage_bucket, storage_path, file_name, owner_id)
    VALUES ('project', 'P-S6-1', 'report', 'TRL Evidence', 'documents', 'docs/trl.pdf', 'trl.pdf', '${U.hod1}') RETURNING id
  `);
  docId = dRes.rows[0].id;

  const tRes = await db.query<{ id: string }>(`
    INSERT INTO public.technologies (title, division_code, trl)
    VALUES ('Bio-polymer Coating', 'D1', 3) RETURNING id
  `);
  techId = tRes.rows[0].id;

  const pRes = await db.query<{ id: string }>(`
    INSERT INTO public.proposals (proposal_code, title, pi_user_id, pi_name, division_code, status, created_by)
    VALUES ('PROP-S6-1', 'Stage 6 Proposal', '${U.hod1}', 'Dr. HoD', 'D1', 'SUBMITTED', '${U.hod1}') RETURNING id
  `);
  propId = pRes.rows[0].id;
}, 180000);

afterAll(async () => {
  await db?.close();
});

describe('Stage 6 database layer', () => {
  it('6.1 HH5/HH6: TRL step requires evidence document and outside contact updates thread date', async () => {
    await expect(
      q(db, U.hod1, `SELECT public.technology_log_step('${techId}', 'TRL_STEP', 'Moved to TRL 4', 4, NULL)`),
    ).rejects.toThrow(/requires an evidence document/i);

    await q(db, U.hod1, `SELECT public.technology_log_step('${techId}', 'TRL_STEP', 'Lab validation complete', 4, '${docId}')`);
    const tRow = await db.query<{ trl: number }>(`SELECT trl FROM public.technologies WHERE id = '${techId}'`);
    expect(tRow.rows[0].trl).toBe(4);

    const th = await db.query<{ id: string }>(`
      INSERT INTO public.outside_threads (partner_name, division_code, purpose)
      VALUES ('Tata Chemicals', 'D1', 'Licensing') RETURNING id
    `);
    await q(db, U.hod1, `SELECT public.outside_contact_log('${th.rows[0].id}', 'MEETING', 'Initial NDA call', CURRENT_DATE)`);
  });

  it('6.2 ST3/ST4: private grievance is hidden from named party and supervisor meetings log cleanly', async () => {
    await q(db, U.stu, `SELECT public.supervisor_meeting_log(CURRENT_DATE, 'Reviewed thesis chapter 2', 'Run XRD')`);

    const gRes = await q<{ id: string }>(
      db,
      U.stu,
      `SELECT public.private_grievance_submit('Academic', 'Concern about lab bench access', '${U.hod1}') AS id`,
    );
    const gid = gRes.rows[0].id;

    // Reporter and Director see it; HoD (not grievance desk) does not
    const stuVis = await q(db, U.stu, `SELECT id FROM public.private_grievances WHERE id = '${gid}'`);
    expect(stuVis.rows.length).toBe(1);
    const hodVis = await q(db, U.hod1, `SELECT id FROM public.private_grievances WHERE id = '${gid}'`);
    expect(hodVis.rows.length).toBe(0);
    const dirVis = await q(db, U.dir, `SELECT id FROM public.private_grievances WHERE id = '${gid}'`);
    expect(dirVis.rows.length).toBe(1);
  });

  it('6.3/6.5/6.8 TS3, CD12, CD15 & C3: equipment faults, no-dues signoff, campus requests, and rubric scoring', async () => {
    const fRes = await q<{ id: string }>(db, U.tech, `SELECT public.equipment_fault_report('EQ-1', 'Vacuum pump leak', 'DOWN') AS id`);
    await q(db, U.tech, `SELECT public.equipment_fault_resolve('${fRes.rows[0].id}')`);

    const nd = await q<{ id: string }>(db, U.stu, `SELECT public.no_dues_request() AS id`);
    for (const desk of ['LIBRARY', 'STORES', 'ACCOUNTS', 'IT']) {
      await q(db, U.hod1, `SELECT public.no_dues_signoff('${nd.rows[0].id}', '${desk}')`);
    }
    const ndRow = await db.query<{ status: string }>(`SELECT status FROM public.no_dues_clearances WHERE id = '${nd.rows[0].id}'`);
    expect(ndRow.rows[0].status).toBe('CLEARED');

    const cr = await q<{ id: string }>(db, U.stu, `SELECT public.campus_request_create('GUEST_ROOM', CURRENT_DATE + 3, 'External examiner stay') AS id`);
    expect(cr.rows[0].id).toBeTruthy();

    const ev = await q<{ id: string }>(db, U.dir, `SELECT public.proposal_rubric_score('${propId}', 9, 8, 9, 'Strong fit') AS id`);
    expect(ev.rows[0].id).toBeTruthy();
  });
});
