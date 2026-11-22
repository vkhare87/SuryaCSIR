// @vitest-environment node
// CM0 (20261121000010) — Committee module foundations: terms, memberships,
// external members, confidentiality RLS, stage <-> status trigger, acting chair.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `7c000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  chair: u('02'),
  sec: u('03'),
  member: u('04'),
  outsider: u('05'),
  acting: u('06'),
  ext: u('07'),
} as const;

let db: PGlite;
const IDS = {
  pubCmt: 'c1000000-0000-0000-0000-000000000001',
  memCmt: 'c1000000-0000-0000-0000-000000000002',
  confCmt: 'c1000000-0000-0000-0000-000000000003',
  memMtg: 'a1000000-0000-0000-0000-000000000001',
  pubMtg: 'a1000000-0000-0000-0000-000000000002',
};

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@c'), ('${U.chair}', 'chair@c'), ('${U.sec}', 'sec@c'),
      ('${U.member}', 'mem@c'), ('${U.outsider}', 'out@c'), ('${U.acting}', 'act@c'),
      ('${U.ext}', 'ext@c');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.chair}', 'Scientist', 'D1'),
      ('${U.sec}', 'Scientist', 'D1'),
      ('${U.member}', 'Scientist', 'D1'),
      ('${U.outsider}', 'Scientist', 'D2'),
      ('${U.acting}', 'Scientist', 'D1'),
      ('${U.ext}', 'Guest', NULL);

    INSERT INTO public.divisions ("divCode", "divName") VALUES ('D1', 'Division 1') ON CONFLICT DO NOTHING;
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('ST-DIR', 'Dr. Dir', 'D1', '${U.dir}'),
      ('ST-CHR', 'Dr. Chair', 'D1', '${U.chair}'),
      ('ST-SEC', 'Dr. Sec', 'D1', '${U.sec}'),
      ('ST-MEM', 'Dr. Mem', 'D1', '${U.member}'),
      ('ST-OUT', 'Dr. Out', 'D2', '${U.outsider}'),
      ('ST-ACT', 'Dr. Act', 'D1', '${U.acting}');

    INSERT INTO public.committees (id, name, committee_type, mandate, chairperson_id, secretary_id, status, formed_date, confidentiality)
    VALUES
      ('${IDS.pubCmt}', 'Institute Canteen', 'Standing', 'Canteen', 'ST-CHR', 'ST-SEC', 'Active', '2025-01-01', 'institute'),
      ('${IDS.memCmt}', 'Research Council', 'Advisory', 'Research', 'ST-CHR', 'ST-SEC', 'Active', '2025-01-01', 'members'),
      ('${IDS.confCmt}', 'Selection Panel', 'Review', 'Selection', 'ST-CHR', 'ST-SEC', 'Active', '2025-01-01', 'confidential');

    -- Create Term 1 explicitly for these newly inserted committees
    INSERT INTO public.committee_terms (committee_id, term_no, from_on, status, quorum_min, quorum_needs_chair)
    SELECT id, 1, formed_date, 'ACTIVE', 2, true FROM public.committees;

    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
    SELECT c.id, t.id, 'ST-CHR', 'CHAIRPERSON', t.from_on
      FROM public.committees c JOIN public.committee_terms t ON t.committee_id = c.id AND t.term_no = 1;
    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
    SELECT c.id, t.id, 'ST-SEC', 'MEMBER_SECRETARY', t.from_on
      FROM public.committees c JOIN public.committee_terms t ON t.committee_id = c.id AND t.term_no = 1;
    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat, from_on)
    SELECT '${IDS.memCmt}', t.id, 'ST-MEM', 'MEMBER', t.from_on
      FROM public.committee_terms t WHERE t.committee_id = '${IDS.memCmt}' AND t.term_no = 1;

    INSERT INTO public.external_members (id, name, organisation, designation, user_id)
    VALUES ('e1000000-0000-0000-0000-000000000001', 'Prof. External', 'IIT', 'Professor', '${U.ext}');
    INSERT INTO public.committee_memberships (committee_id, term_id, external_member_id, seat, from_on)
    SELECT '${IDS.memCmt}', t.id, 'e1000000-0000-0000-0000-000000000001', 'EXTERNAL_EXPERT', t.from_on
      FROM public.committee_terms t WHERE t.committee_id = '${IDS.memCmt}' AND t.term_no = 1;

    INSERT INTO public.meetings (id, committee_id, meeting_date, title, status)
    VALUES
      ('${IDS.pubMtg}', '${IDS.pubCmt}', '2026-12-01', 'Open Meeting', 'Scheduled'),
      ('${IDS.memMtg}', '${IDS.memCmt}', '2026-12-02', 'Council Meeting', 'Completed');

    INSERT INTO public.agenda_items (meeting_id, sequence, description, proposed_by)
    VALUES ('${IDS.memMtg}', 1, 'Confidential Agenda', 'ST-CHR');

    INSERT INTO public.meeting_documents (meeting_id, file_name, storage_path)
    VALUES ('${IDS.memMtg}', 'minutes.pdf', 'committees/mem/minutes.pdf');

    INSERT INTO public.action_items (meeting_id, task, assigned_to, deadline)
    VALUES ('${IDS.memMtg}', 'Prepare note', 'Dr. Mem', '2026-12-10');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('CM0 confidentiality and access helpers', () => {
  it('allows verified users on institute committees, but blocks non-members from members and confidential committees', async () => {
    const outsiderCmt = await as(db, U.outsider, tx =>
      tx.query<{ id: string }>(`SELECT id FROM committees ORDER BY id`),
    );
    expect(outsiderCmt.rows.map(r => r.id)).toEqual([IDS.pubCmt]);

    const outsiderMtg = await as(db, U.outsider, tx =>
      tx.query<{ id: string }>(`SELECT id FROM meetings ORDER BY id`),
    );
    expect(outsiderMtg.rows.map(r => r.id)).toEqual([IDS.pubMtg]);

    const outsiderAgenda = await as(db, U.outsider, tx =>
      tx.query(`SELECT id FROM agenda_items`),
    );
    expect(outsiderAgenda.rows).toHaveLength(0);

    const outsiderDocs = await as(db, U.outsider, tx =>
      tx.query(`SELECT id FROM meeting_documents`),
    );
    expect(outsiderDocs.rows).toHaveLength(0);

    const memberCmt = await as(db, U.member, tx =>
      tx.query<{ id: string }>(`SELECT id FROM committees ORDER BY id`),
    );
    expect(memberCmt.rows.map(r => r.id)).toEqual([IDS.pubCmt, IDS.memCmt]);

    const extCmt = await as(db, U.ext, tx =>
      tx.query<{ id: string }>(`SELECT id FROM committees ORDER BY id`),
    );
    expect(extCmt.rows.map(r => r.id)).toEqual([IDS.memCmt]);

    const dirCmt = await as(db, U.dir, tx =>
      tx.query<{ id: string }>(`SELECT id FROM committees ORDER BY id`),
    );
    expect(dirCmt.rows.map(r => r.id)).toEqual([IDS.pubCmt, IDS.memCmt, IDS.confCmt]);
  });

  it('recognises acting chairperson via acting_assignments for committee_seat and committee_can_run', async () => {
    const before = await as(db, U.acting, tx =>
      tx.query<{ seat: string | null; can_run: boolean }>(
        `SELECT committee_seat($1) AS seat, committee_can_run($1) AS can_run`, [IDS.memCmt],
      ),
    );
    expect(before.rows[0]).toEqual({ seat: null, can_run: false });

    await db.exec(`
      INSERT INTO public.acting_assignments (role, division_code, principal_user_id, acting_user_id, from_on, to_on, order_ref)
      VALUES ('HOD', 'D1', '${U.chair}', '${U.acting}', CURRENT_DATE - 1, CURRENT_DATE + 5, 'OM-ACT-1');
    `);

    const during = await as(db, U.acting, tx =>
      tx.query<{ seat: string | null; can_run: boolean }>(
        `SELECT committee_seat($1) AS seat, committee_can_run($1) AS can_run`, [IDS.memCmt],
      ),
    );
    expect(during.rows[0]).toEqual({ seat: 'CHAIRPERSON', can_run: true });
  });
});

describe('CM0 stage/status trigger and action_items staff sync', () => {
  it('keeps meetings.stage and status synchronized in both directions', async () => {
    const inserted = (await db.query<{ stage: string; status: string }>(
      `SELECT stage, status FROM meetings WHERE id = '${IDS.memMtg}'`,
    )).rows[0];
    expect(inserted).toEqual({ stage: 'HELD', status: 'Completed' });

    await db.exec(`UPDATE public.meetings SET stage = 'AGENDA_CIRCULATED' WHERE id = '${IDS.pubMtg}'`);
    const updated = (await db.query<{ stage: string; status: string }>(
      `SELECT stage, status FROM meetings WHERE id = '${IDS.pubMtg}'`,
    )).rows[0];
    expect(updated).toEqual({ stage: 'AGENDA_CIRCULATED', status: 'Scheduled' });

    await db.exec(`UPDATE public.meetings SET stage = 'MINUTES_SIGNED' WHERE id = '${IDS.pubMtg}'`);
    const signed = (await db.query<{ stage: string; status: string }>(
      `SELECT stage, status FROM meetings WHERE id = '${IDS.pubMtg}'`,
    )).rows[0];
    expect(signed).toEqual({ stage: 'MINUTES_SIGNED', status: 'Completed' });
  });

  it('populates action_items.assigned_staff_id from unique_staff_names on insert', async () => {
    const row = (await db.query<{ assigned_staff_id: string | null }>(
      `SELECT assigned_staff_id FROM action_items WHERE task = 'Prepare note'`,
    )).rows[0];
    expect(row.assigned_staff_id).toBe('ST-MEM');
  });

  it('prevents direct client INSERT into committee_events', async () => {
    await expect(
      as(db, U.dir, tx => tx.query(
        `INSERT INTO committee_events (committee_id, event_type, summary) VALUES ($1, 'TEST', 'Direct write')`,
        [IDS.pubCmt],
      )),
    ).rejects.toThrow(/permission denied/);
  });
});
