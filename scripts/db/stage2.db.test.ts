// @vitest-environment node
// Stage 2 DB tests: HH1/DH1 (caller_division_codes, division_rollup),
// SH2 (my_report_timers), PJ1 (my_engagement), CD1-CD3 (my_day, my_requests, request_catalog),
// CM1 (rooms, room_book clash guard, meeting_schedule, meeting_postpone, hospitality_requests).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7d000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  hod1: u('02'),
  actingHod: u('03'),
  sci: u('04'),
  pj1: u('05'),
  pj2: u('06'),
  hosp: u('07'),
} as const;

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@s2'), ('${U.hod1}', 'hod1@s2'), ('${U.actingHod}', 'act@s2'),
      ('${U.sci}', 'sci@s2'), ('${U.pj1}', 'pj1@s2'), ('${U.pj2}', 'pj2@s2'), ('${U.hosp}', 'hosp@s2');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.hod1}', 'HOD', 'D1'),
      ('${U.actingHod}', 'Scientist', 'D2'),
      ('${U.sci}', 'Scientist', 'D1'),
      ('${U.pj1}', 'ProjectStaff', 'D1'),
      ('${U.pj2}', 'ProjectStaff', 'D1'),
      ('${U.hosp}', 'Technician', 'D1');

    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Div 1'), ('D2', 'Div 2') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('S-DIR', 'Dr. Dir', 'D1', '${U.dir}'),
      ('S-HOD', 'Dr. Hod', 'D1', '${U.hod1}'),
      ('S-ACT', 'Dr. Act', 'D2', '${U.actingHod}'),
      ('S-SCI', 'Dr. Sci', 'D1', '${U.sci}');

    INSERT INTO public.acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref)
    VALUES ('HOD', 'D1', '${U.hod1}', '${U.actingHod}', CURRENT_DATE - 1, CURRENT_DATE + 5, 'OM-S2-1');

    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", "ProjectStatus", pi_staff_id, end_date)
    VALUES ('P-S2-1', 'GAP-S2', 'Stage 2 Study', 'D1', 'Active', 'S-SCI', CURRENT_DATE - 2);

    INSERT INTO public.project_review_slots (project_id, kind, body, period_end, period_label, due_date, status)
    VALUES ('P-S2-1', 'PROGRESS_REPORT', 'PI', CURRENT_DATE - 5, 'Q2 2026', CURRENT_DATE - 5, 'PENDING');

    INSERT INTO public.project_staff_persons (id, name, user_id) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'PJ One', '${U.pj1}'),
      ('a0000000-0000-0000-0000-000000000002', 'PJ Two', '${U.pj2}');
    INSERT INTO public.project_engagements (person_id, project_id, position_code, from_on, to_on, emoluments)
    VALUES
      ('a0000000-0000-0000-0000-000000000001', 'P-S2-1', 'PA-I', CURRENT_DATE - 30, CURRENT_DATE + 60, 31000),
      ('a0000000-0000-0000-0000-000000000002', 'P-S2-1', 'PA-II', CURRENT_DATE - 10, CURRENT_DATE + 90, 35000);

    INSERT INTO public.tickets (token, subject, category, urgency, description, submitted_by, request_key)
    VALUES ('TKT-S2-1', 'Broken chiller', 'Infrastructure', 'High', 'Not cooling', '${U.sci}', 'repair');

    INSERT INTO public.holidays (holiday_date, name, holiday_type, year)
    VALUES (CURRENT_DATE + 1, 'Foundation Day', 'Institute', EXTRACT(YEAR FROM CURRENT_DATE)::int);

    INSERT INTO public.module_desks (desk, user_id) VALUES ('hospitality', '${U.hosp}');
    INSERT INTO public.rooms (id, name, kind, building, capacity) VALUES
      ('b0000000-0000-0000-0000-000000000001', 'Board Room', 'room', 'Main Block', 24),
      ('b0000000-0000-0000-0000-000000000002', 'Staff Car 1', 'vehicle', 'Garage', 4),
      ('b0000000-0000-0000-0000-000000000003', 'Guest Suite 2', 'guest house', 'Hostel', 2);

    INSERT INTO public.committees (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date)
    VALUES ('c2000000-0000-0000-0000-000000000001', 'LSG', 'Standing', 'Strategy', 'S-DIR', 'S-SCI', 'Active', '2025-01-01');
    INSERT INTO public.committee_terms (committee_id, term_no, from_on, status)
    VALUES ('c2000000-0000-0000-0000-000000000001', 1, '2025-01-01', 'ACTIVE');
    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
    SELECT 'c2000000-0000-0000-0000-000000000001', id, 'S-SCI', 'MEMBER_SECRETARY', '2025-01-01'
      FROM public.committee_terms WHERE committee_id = 'c2000000-0000-0000-0000-000000000001';
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('HH1 / DH1 / SH2 / PJ1 / CD1-3 SQL foundations', () => {
  it('caller_division_codes honours HOD role and active acting_assignments', async () => {
    const hod = await as(db, U.hod1, tx => tx.query<{ c: string[] }>(`SELECT caller_division_codes() c`));
    expect(hod.rows[0].c).toEqual(['D1']);

    const act = await as(db, U.actingHod, tx => tx.query<{ c: string[] }>(`SELECT caller_division_codes() c`));
    expect(act.rows[0].c).toEqual(['D1']);

    const sci = await as(db, U.sci, tx => tx.query<{ c: string[] }>(`SELECT caller_division_codes() c`));
    expect(sci.rows[0].c).toEqual([]);
  });

  it('division_rollup reports late_projects and staff_count accurately', async () => {
    const res = await as(db, U.dir, tx => tx.query<{ div_code: string; late_projects: string; staff_count: string }>(
      `SELECT div_code, late_projects::text, staff_count::text FROM division_rollup() WHERE div_code = 'D1'`,
    ));
    expect(res.rows[0]).toEqual({ div_code: 'D1', late_projects: '1', staff_count: '3' });
  });

  it('my_report_timers returns caller pending progress report slot', async () => {
    const timers = await as(db, U.sci, tx => tx.query<{ kind: string; subject: string }>(
      `SELECT kind, subject FROM my_report_timers()`,
    ));
    expect(timers.rows.some(r => r.kind === 'PROGRESS_REPORT' && r.subject.includes('GAP-S2'))).toBe(true);
  });

  it('my_engagement isolates each ProjectStaff user strictly to their own engagement', async () => {
    const e1 = await as(db, U.pj1, tx => tx.query<{ person_name: string; position_code: string }>(
      `SELECT person_name, position_code FROM my_engagement()`,
    ));
    expect(e1.rows).toEqual([{ person_name: 'PJ One', position_code: 'PA-I' }]);

    const e2 = await as(db, U.pj2, tx => tx.query<{ person_name: string }>(
      `SELECT person_name FROM my_engagement()`,
    ));
    expect(e2.rows).toEqual([{ person_name: 'PJ Two' }]);
  });

  it('my_day and my_requests surface holidays, report timers, tickets and catalog norms', async () => {
    const day = await as(db, U.sci, tx => tx.query<{ kind: string; title: string }>(
      `SELECT kind, title FROM my_day(CURRENT_DATE - 10, CURRENT_DATE + 10)`,
    ));
    expect(day.rows.some(r => r.kind === 'HOLIDAY' && r.title === 'Foundation Day')).toBe(true);
    expect(day.rows.some(r => r.kind === 'REPORT_DUE')).toBe(true);

    const reqs = await as(db, U.sci, tx => tx.query<{ kind: string; title: string; norm_days: number }>(
      `SELECT kind, title, norm_days FROM my_requests()`,
    ));
    expect(reqs.rows).toEqual([
      { kind: 'repair', title: 'Broken chiller', norm_days: 3 },
    ]);
  });
});

describe('CM1 rooms, bookings clash guard, meeting schedule & hospitality', () => {
  it('supports room kinds, prevents overlapping room_book calls, moves booking on postpone, and gates hospitality', async () => {
    const kinds = (await db.query<{ kind: string }>(`SELECT kind FROM rooms ORDER BY kind`)).rows.map(r => r.kind);
    expect(kinds).toEqual(['guest house', 'room', 'vehicle']);

    const mtgRes = await as(db, U.sci, tx => tx.query<{ id: string }>(
      `SELECT meeting_schedule('c2000000-0000-0000-0000-000000000001', 'LSG Q4', '2026-12-10T10:00:00Z', '2026-12-10T11:30:00Z', '', 'IN_PERSON', 'b0000000-0000-0000-0000-000000000001', 7) AS id`,
    ));
    const mtgId = mtgRes.rows[0].id;

    // Overlapping booking on the same room must fail
    await expect(
      as(db, U.dir, tx => tx.query(
        `SELECT room_book('b0000000-0000-0000-0000-000000000001', '2026-12-10T10:30:00Z', '2026-12-10T12:00:00Z', 'Clash test')`,
      )),
    ).rejects.toThrow(/already booked/);

    // Postponing moves both meeting and room booking
    await as(db, U.sci, tx => tx.query(
      `SELECT meeting_postpone($1, '2026-12-12T10:00:00Z', '2026-12-12T11:30:00Z')`, [mtgId],
    ));
    const bk = (await db.query<{ starts_at: string }>(
      `SELECT starts_at::text FROM room_bookings WHERE meeting_id = $1`, [mtgId],
    )).rows[0];
    expect(bk.starts_at).toContain('2026-12-12');

    // Hospitality create by convener, decide by hospitality desk only
    const hr = await as(db, U.sci, tx => tx.query<{ id: string }>(
      `SELECT hospitality_request_create($1, 15, 'Tea and snacks') AS id`, [mtgId],
    ));
    await expect(
      as(db, U.sci, tx => tx.query(`SELECT hospitality_request_decide($1, 'APPROVED')`, [hr.rows[0].id])),
    ).rejects.toThrow(/not authorized/);

    await as(db, U.hosp, tx => tx.query(`SELECT hospitality_request_decide($1, 'APPROVED')`, [hr.rows[0].id]));
    const status = (await db.query<{ status: string }>(`SELECT status FROM hospitality_requests WHERE id = $1`, [hr.rows[0].id])).rows[0].status;
    expect(status).toBe('APPROVED');
  });
});
