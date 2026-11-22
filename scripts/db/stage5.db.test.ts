// @vitest-environment node
// Stage 5 DB tests: TS2 (instrument_book clash guard), PJ2/PJ3 (project leave & official letters),
// CD8/CD9/CD16/DH5 (dak_letters + HQ filter, forms_shelf, safety_incidents),
// HH4 (division_report_assemble/send), DH13 (director_watch_pin), CM6 (action_item_verify).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `af000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  hod1: u('02'),
  tech: u('03'),
  pj1: u('04'),
} as const;

const q = <T = Record<string, unknown>>(db: PGlite, uid: string, sql: string) =>
  as(db, uid, (tx) => tx.query<T>(sql));

let db: PGlite;
let actionItemId: string;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@s5'), ('${U.hod1}', 'hod1@s5'), ('${U.tech}', 'tech@s5'), ('${U.pj1}', 'pj1@s5');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.hod1}', 'HOD', 'D1'),
      ('${U.tech}', 'Technician', 'D1'),
      ('${U.pj1}', 'ProjectStaff', 'D1');
    INSERT INTO public.divisions ("divCode", "divName", "divHoDID") VALUES ('D1', 'Division 1', 'S5-HOD')
    ON CONFLICT ("divCode") DO UPDATE SET "divHoDID" = EXCLUDED."divHoDID";
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('S5-DIR', 'Dr. Director', 'D1', '${U.dir}'),
      ('S5-HOD', 'Dr. HoD', 'D1', '${U.hod1}'),
      ('S5-TECH', 'Tech One', 'D1', '${U.tech}');
    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", "ProjectStatus", pi_staff_id)
    VALUES ('P-S5-1', 'GAP-S5', 'Stage 5 Project', 'D1', 'Active', 'S5-HOD');
  `);

  const aiRes = await db.query<{ id: string }>(`
    INSERT INTO public.action_items (source, task, assigned_to, deadline, status)
    VALUES ('manual', 'Calibrate spectrometer', 'S5-TECH', CURRENT_DATE + 5, 'Pending') RETURNING id
  `);
  actionItemId = aiRes.rows[0].id;
}, 180000);

afterAll(async () => {
  await db?.close();
});

describe('Stage 5 database layer', () => {
  it('5.1 TS2: instrument_book prevents overlapping bookings and allows technician decision', async () => {
    const b1 = await q<{ id: string }>(
      db,
      U.pj1,
      `SELECT public.instrument_book('EQ-SEM-1', '2026-12-01T10:00:00Z', '2026-12-01T12:00:00Z', 'Sample imaging', 'P-S5-1') AS id`,
    );
    expect(b1.rows[0].id).toBeTruthy();

    await expect(
      q(db, U.hod1, `SELECT public.instrument_book('EQ-SEM-1', '2026-12-01T11:00:00Z', '2026-12-01T13:00:00Z', 'Overlap')`),
    ).rejects.toThrow(/overlapping/i);

    await q(db, U.tech, `SELECT public.instrument_booking_decide('${b1.rows[0].id}', 'APPROVED', 'Slot confirmed')`);
    const row = await db.query<{ status: string }>(`SELECT status FROM public.instrument_bookings WHERE id = '${b1.rows[0].id}'`);
    expect(row.rows[0].status).toBe('APPROVED');
  });

  it('5.2 PJ2/PJ3: project staff leave approval and attested official letters', async () => {
    const l1 = await q<{ id: string }>(
      db,
      U.pj1,
      `SELECT public.project_leave_apply('CL', CURRENT_DATE + 2, CURRENT_DATE + 3, 'Personal work') AS id`,
    );
    await q(db, U.hod1, `SELECT public.project_leave_decide('${l1.rows[0].id}', 'APPROVED')`);
    const lRow = await db.query<{ status: string; days_count: number }>(`SELECT status, days_count FROM public.project_leave_requests WHERE id = '${l1.rows[0].id}'`);
    expect(lRow.rows[0].status).toBe('APPROVED');
    expect(lRow.rows[0].days_count).toBe(2);

    const ltr = await q<{ id: string }>(
      db,
      U.pj1,
      `SELECT public.letter_request('BONAFIDE', 'Bonafide certificate for bank', 'Employed on GAP-S5.') AS id`,
    );
    const codeRes = await q<{ code: string }>(db, U.hod1, `SELECT public.letter_issue('${ltr.rows[0].id}', NULL) AS code`);
    expect(codeRes.rows[0].code).toMatch(/^SURYA-/);
  });

  it('5.3/5.7 CD8/CD9/CD16/DH5: dak register with HQ filter, forms shelf, and safety incidents', async () => {
    await q(db, U.dir, `SELECT public.dak_letter_log('CSIR/HQ/2026/10', 'INWARD', 'CSIR HQ', 'Annual budget call', true, 'D1', '${U.hod1}')`);
    await q(db, U.hod1, `SELECT public.dak_letter_log('D1/OUT/2026/05', 'OUTWARD', 'DST', 'Progress submission', false, 'D1', NULL)`);

    const hqOnly = await q<{ dak_no: string }>(db, U.dir, `SELECT dak_no FROM public.dak_letters WHERE is_hq = true`);
    expect(hqOnly.rows.map((r) => r.dak_no)).toEqual(['CSIR/HQ/2026/10']);

    const shelf = await q<{ key: string }>(db, U.pj1, `SELECT key FROM public.forms_shelf`);
    expect(shelf.rows.length).toBeGreaterThanOrEqual(5);

    const saf = await q<{ id: string }>(
      db,
      U.tech,
      `SELECT public.safety_incident_report('Lab 204', 'NEAR_MISS', 'Fume hood sash alarm triggered', 'D1') AS id`,
    );
    expect(saf.rows[0].id).toBeTruthy();
  });

  it('5.4/5.5/5.6 HH4, DH13 & CM6: division report assembly, director watch, and action verification', async () => {
    const rep = await q<{ id: string }>(
      db,
      U.hod1,
      `SELECT public.division_report_assemble('D1', 'MONTHLY', CURRENT_DATE - 30, CURRENT_DATE, CURRENT_DATE + 5) AS id`,
    );
    await q(db, U.hod1, `SELECT public.division_report_send('${rep.rows[0].id}')`);
    const repRow = await db.query<{ status: string; body_markdown: string }>(`SELECT status, body_markdown FROM public.division_reports WHERE id = '${rep.rows[0].id}'`);
    expect(repRow.rows[0].status).toBe('SENT');
    expect(repRow.rows[0].body_markdown).toContain('Active projects:');

    const w = await q<{ id: string }>(
      db,
      U.dir,
      `SELECT public.director_watch_pin('PROJECT', 'project', 'P-S5-1', 'Monitor GAP-S5 deliverables', 'Key milestone Q4') AS id`,
    );
    expect(w.rows[0].id).toBeTruthy();

    await q(db, U.hod1, `SELECT public.action_item_verify('${actionItemId}')`);
    const aiRow = await db.query<{ status: string; verified_at: string | null }>(`SELECT status, verified_at FROM public.action_items WHERE id = '${actionItemId}'`);
    expect(aiRow.rows[0].status).toBe('Completed');
    expect(aiRow.rows[0].verified_at).not.toBeNull();
  });
});
