// @vitest-environment node
// Stage 4 DB tests: CM4/CM5 (proceedings, minutes draft/circulate/approve, signature_attest & signature_verify),
// DH2/DH3/DH4 (delegation_rules, non-delegable floor, decision_authority, decision_record, director_flags),
// CD10 (general_meeting_schedule).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `9f000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  hod1: u('02'),
  sci1: u('03'),
} as const;

const q = <T = Record<string, unknown>>(db: PGlite, uid: string, sql: string) =>
  as(db, uid, (tx) => tx.query<T>(sql));

let db: PGlite;
let meetingId: string;
let agendaItemId: string;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@s4'), ('${U.hod1}', 'hod1@s4'), ('${U.sci1}', 'sci1@s4');
    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.hod1}', 'HOD', 'D1'),
      ('${U.sci1}', 'Scientist', 'D1');
    INSERT INTO public.divisions ("divCode", "divName", "divHoDID") VALUES ('D1', 'Div 1', 'S4-HOD')
    ON CONFLICT ("divCode") DO UPDATE SET "divHoDID" = EXCLUDED."divHoDID";
    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('S4-DIR', 'Dr. Director', 'D1', '${U.dir}'),
      ('S4-HOD', 'Dr. HoD', 'D1', '${U.hod1}'),
      ('S4-SCI', 'Dr. Sci', 'D1', '${U.sci1}');
  `);

  const cRes = await db.query<{ id: string }>(`
    INSERT INTO public.committees (name, committee_type, chairperson_id, secretary_id, status)
    VALUES ('Stage 4 Committee', 'Review', 'S4-HOD', 'S4-SCI', 'Active') RETURNING id
  `);
  const committeeId = cRes.rows[0].id;
  const tRes = await db.query<{ id: string }>(`
    INSERT INTO public.committee_terms (committee_id, term_no, from_on, quorum_min, quorum_needs_chair, status)
    VALUES ('${committeeId}', 1, CURRENT_DATE - 5, 1, false, 'ACTIVE') RETURNING id
  `);
  const termId = tRes.rows[0].id;
  await db.exec(`
    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat) VALUES
      ('${committeeId}', '${termId}', 'S4-HOD', 'CHAIRPERSON'),
      ('${committeeId}', '${termId}', 'S4-SCI', 'MEMBER_SECRETARY');
  `);
  const mRes = await db.query<{ id: string }>(`
    INSERT INTO public.meetings (committee_id, term_id, meeting_date, title, status, stage)
    VALUES ('${committeeId}', '${termId}', CURRENT_DATE, 'Stage 4 Meeting', 'Scheduled', 'HELD') RETURNING id
  `);
  meetingId = mRes.rows[0].id;
  const aRes = await db.query<{ id: string }>(`
    INSERT INTO public.agenda_items (meeting_id, sequence, description, proposed_by, status, title)
    VALUES ('${meetingId}', 1, 'Approve lab budget', 'S4-SCI', 'Pending', 'Lab Budget') RETURNING id
  `);
  agendaItemId = aRes.rows[0].id;
}, 180000);

afterAll(async () => {
  await db?.close();
});

describe('Stage 4 database layer', () => {
  it('4.1 CM4/CM5: captures proceedings, drafts/approves minutes, attests signature, locks editing, and verifies hash', async () => {
    await q(db, U.sci1, `
      SELECT public.meeting_proceeding_upsert('${meetingId}', '${agendaItemId}', 'Discussed thoroughly', 'Approved ₹2L', 'APPROVED', '')
    `);
    const draft = await q<{ id: string }>(db, U.sci1, `SELECT public.minutes_draft_create('${meetingId}', NULL) AS id`);
    const verId = draft.rows[0].id;

    await q(db, U.sci1, `SELECT public.minutes_circulate('${verId}')`);
    await q(db, U.hod1, `SELECT public.minutes_comment_add('${verId}', 'Add reference to circular', '${agendaItemId}')`);
    await q(db, U.hod1, `SELECT public.minutes_approve('${verId}')`);

    const sig = await q<{ code: string }>(db, U.hod1, `
      SELECT public.signature_attest('minutes_version', '${verId}', 'abcdef0123456789abcdef0123456789', 'ATTEST') AS code
    `);
    const code = sig.rows[0].code;
    expect(code).toMatch(/^SURYA-/);

    // Verification passes
    const ver = await q<{ valid: boolean; signer_name: string }>(db, U.sci1, `SELECT valid, signer_name FROM public.signature_verify('${code}')`);
    expect(ver.rows[0].valid).toBe(true);
    expect(ver.rows[0].signer_name).toBe('Dr. HoD');

    // Signed minutes lock proceedings against further edits
    await expect(
      q(db, U.sci1, `SELECT public.meeting_proceeding_upsert('${meetingId}', '${agendaItemId}', 'Tamper', 'Tamper', 'APPROVED', '')`),
    ).rejects.toThrow(/Signed minutes are locked/i);
  });

  it('4.2/4.4/4.5 DH2-DH4: enforces non-delegable floor, dial limits, Director flags, and audit citation', async () => {
    // Non-delegable floor refuses switching away from SELF
    await expect(
      q(db, U.dir, `SELECT public.delegation_rule_set('PROPOSAL_APPROVAL', 'HEAD_TELL', NULL, 'ORD-1')`),
    ).rejects.toThrow(/non-delegable floor/i);

    // HoD refused on SELF kind
    await expect(
      q(db, U.hod1, `SELECT public.decision_record('proposal', 'PROP-1', 'PROPOSAL_APPROVAL', 'APPROVE')`),
    ).rejects.toThrow(/requires Director approval/i);

    // HoD refused when amount exceeds max_amount_inr (500,000)
    await expect(
      q(db, U.hod1, `SELECT public.decision_record('recruitment', 'REC-1', 'HIRING_EXTENSION', 'APPROVE', 'Over limit', 750000)`),
    ).rejects.toThrow(/requires Director approval/i);

    // Within limit -> HoD succeeds and logs order citation
    const rec = await q<{ id: string }>(
      db,
      U.hod1,
      `SELECT public.decision_record('recruitment', 'REC-2', 'HIRING_EXTENSION', 'APPROVE', 'Within cap', 250000) AS id`,
    );
    expect(rec.rows[0].id).toBeTruthy();

    // Director flag (HOLD) blocks HoD until Director resolves
    const flagRes = await q<{ id: string }>(
      db,
      U.dir,
      `SELECT public.director_flag_set('project_report', 'REP-9', 'HOLD', 'Audit check') AS id`,
    );
    const flagId = flagRes.rows[0].id;
    await expect(
      q(db, U.hod1, `SELECT public.decision_record('project_report', 'REP-9', 'PROGRESS_REPORT', 'APPROVE')`),
    ).rejects.toThrow(/held\/called back by Director/i);

    await q(db, U.dir, `SELECT public.director_flag_resolve('${flagId}')`);
    const afterResolve = await q<{ id: string }>(
      db,
      U.hod1,
      `SELECT public.decision_record('project_report', 'REP-9', 'PROGRESS_REPORT', 'APPROVE') AS id`,
    );
    expect(afterResolve.rows[0].id).toBeTruthy();

    // Director updates delegation dial and issues order notice
    await q(db, U.dir, `SELECT public.delegation_rule_set('HIRING_EXTENSION', 'HEAD_FLAGS', 600000, 'DIR-DEL-2026-02')`);
    const notice = await db.query<{ notice_no: string }>(`SELECT notice_no FROM public.notices WHERE notice_no = 'DIR-DEL-2026-02'`);
    expect(notice.rows.length).toBe(1);
  });

  it('4.6 CD10: general_meeting_schedule creates audience-scoped institute meeting', async () => {
    const gm = await q<{ id: string }>(
      db,
      U.dir,
      `SELECT public.general_meeting_schedule('Annual Staff Assembly', CURRENT_DATE + 10, 'Main Auditorium', 'Annual address', '{"scope":"ALL"}'::jsonb) AS id`,
    );
    expect(gm.rows[0].id).toBeTruthy();
    const visible = await q(db, U.sci1, `SELECT title FROM public.general_meetings WHERE id = '${gm.rows[0].id}'`);
    expect(visible.rows.length).toBe(1);
  });
});
