// @vitest-environment node
// Stage 3 DB tests: SH3/HH7 (work_priorities), HH2/CD6 (my_decisions, decision_questions),
// SH4 (home_snoozes, report_nudge_sweep), CD4 (notices, notice_reads),
// CM2/CM3 (agenda_circulate, agenda_receipts, meeting_attendance, quorum, mark_held, adjourn).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb } from './pgliteHarness';

const u = (n: string) => `8e000000-0000-0000-0000-0000000000${n}`;
const U = {
  dir: u('01'),
  hod1: u('02'),
  hod2: u('03'),
  sci1: u('04'),
  sci2: u('05'),
  guest: u('06'),
} as const;

let db: PGlite;
let committeeId: string;
let meetingId: string;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.dir}', 'dir@s3'), ('${U.hod1}', 'hod1@s3'), ('${U.hod2}', 'hod2@s3'),
      ('${U.sci1}', 'sci1@s3'), ('${U.sci2}', 'sci2@s3'), ('${U.guest}', 'guest@s3');

    DELETE FROM public.user_roles;
    INSERT INTO public.user_roles (user_id, role, division_code) VALUES
      ('${U.dir}', 'Director', NULL),
      ('${U.hod1}', 'HOD', 'D1'),
      ('${U.hod2}', 'HOD', 'D2'),
      ('${U.sci1}', 'Scientist', 'D1'),
      ('${U.sci2}', 'Scientist', 'D2'),
      ('${U.guest}', 'Guest', NULL);

    INSERT INTO public.divisions ("divCode", "divName", "divHoDID") VALUES
      ('D1', 'Division 1', 'S3-HOD1'),
      ('D2', 'Division 2', 'S3-HOD2')
    ON CONFLICT ("divCode") DO UPDATE SET "divHoDID" = EXCLUDED."divHoDID";

    INSERT INTO public.staff ("ID", "Name", "Division", user_id) VALUES
      ('S3-DIR', 'Dr. Director', 'D1', '${U.dir}'),
      ('S3-HOD1', 'Dr. HoD One', 'D1', '${U.hod1}'),
      ('S3-HOD2', 'Dr. HoD Two', 'D2', '${U.hod2}'),
      ('S3-SCI1', 'Dr. Sci One', 'D1', '${U.sci1}'),
      ('S3-SCI2', 'Dr. Sci Two', 'D2', '${U.sci2}');

    INSERT INTO public.user_profiles (user_id, email, active_role) VALUES
      ('${U.dir}', 'dir@s3', 'Director'),
      ('${U.hod1}', 'hod1@s3', 'HOD'),
      ('${U.hod2}', 'hod2@s3', 'HOD'),
      ('${U.sci1}', 'sci1@s3', 'Scientist'),
      ('${U.sci2}', 'sci2@s3', 'Scientist')
    ON CONFLICT (user_id) DO UPDATE SET active_role = EXCLUDED.active_role;

    INSERT INTO public.projects ("ProjectID", "ProjectNo", "ProjectName", "DivisionCode", "ProjectStatus", pi_staff_id)
    VALUES
      ('P-S3-1', 'GAP-S3', 'Stage 3 Project', 'D1', 'Active', 'S3-SCI1'),
      ('P-S3-2', 'GAP-S3-2', 'Stage 3 Overdue Slot Project', 'D1', 'Active', 'S3-SCI1');

    INSERT INTO public.project_review_slots (project_id, kind, body, period_end, period_label, due_date, status)
    VALUES ('P-S3-2', 'PROGRESS_REPORT', 'PI', CURRENT_DATE - 7, 'Q3 2026', CURRENT_DATE - 7, 'PENDING');

    INSERT INTO public.project_reports (project_no, project_name, division_code, period_label, status, submitted_by, submitted_at)
    VALUES ('GAP-S3', 'Stage 3 Project', 'D1', 'Q3 2026', 'SUBMITTED', '${U.sci1}', now() - interval '3 days');
  `);

  const cRes = await db.query<{ id: string }>(`
    INSERT INTO public.committees (name, committee_type, chairperson_id, secretary_id, status)
    VALUES ('Stage 3 Review Committee', 'Review', 'S3-HOD1', 'S3-SCI1', 'Active')
    RETURNING id
  `);
  committeeId = cRes.rows[0].id;

  const tRes = await db.query<{ id: string }>(`
    INSERT INTO public.committee_terms (committee_id, term_no, from_on, quorum_min, quorum_needs_chair, status)
    VALUES ('${committeeId}', 1, CURRENT_DATE - 10, 2, true, 'ACTIVE')
    RETURNING id
  `);
  const termId = tRes.rows[0].id;

  await db.exec(`
    INSERT INTO public.committee_memberships (committee_id, term_id, staff_id, seat) VALUES
      ('${committeeId}', '${termId}', 'S3-HOD1', 'CHAIRPERSON'),
      ('${committeeId}', '${termId}', 'S3-SCI1', 'MEMBER_SECRETARY');
  `);

  const mRes = await db.query<{ id: string }>(`
    INSERT INTO public.meetings (committee_id, term_id, meeting_date, title, status, stage)
    VALUES ('${committeeId}', '${termId}', CURRENT_DATE + 5, 'First S3 Meeting', 'Scheduled', 'PLANNED')
    RETURNING id
  `);
  meetingId = mRes.rows[0].id;

  await db.exec(`
    INSERT INTO public.agenda_items (meeting_id, sequence, description, proposed_by, status, title)
    VALUES ('${meetingId}', 1, 'Review annual progress', 'S3-SCI1', 'Pending', 'Annual Progress');
  `);
});

afterAll(async () => {
  await db.close();
});

const q = <T = Record<string, unknown>>(uid: string, sql: string) =>
  as(db, uid, (tx) => tx.query<T>(sql));

describe('Stage 3 database layer', () => {
  it('3.1 work_priorities: enforces rules, clash notifications, push-back & answer', async () => {
    // Unauthorized / self-pin fails
    await expect(
      q(U.sci2, `SELECT public.priority_pin('${U.sci1}', 'Task', 'Reason long enough', CURRENT_DATE + 3)`),
    ).rejects.toThrow(/Not authorized/i);
    await expect(
      q(U.hod1, `SELECT public.priority_pin('${U.hod1}', 'Self', 'Reason long enough', CURRENT_DATE + 3)`),
    ).rejects.toThrow(/Not authorized/i);

    // Reason < 10 chars fails
    await expect(
      q(U.hod1, `SELECT public.priority_pin('${U.sci1}', 'Task', 'Too short', CURRENT_DATE + 3)`),
    ).rejects.toThrow(/10 characters/i);

    // Pin 3 priorities (including clash from Director on same wanted_by)
    const p1 = await q<{ id: string }>(
      U.hod1,
      `SELECT public.priority_pin('${U.sci1}', 'Priority 1', 'First urgent deliverable for D1', CURRENT_DATE + 4, '/projects/P-S3-1') AS id`,
    );
    const id1 = p1.rows[0].id;

    await q(
      U.dir,
      `SELECT public.priority_pin('${U.sci1}', 'Director Priority', 'Director urgent review request', CURRENT_DATE + 4, '/projects/P-S3-1')`,
    );
    await q(
      U.hod1,
      `SELECT public.priority_pin('${U.sci1}', 'Priority 3', 'Third priority item for scientist', CURRENT_DATE + 8, '/')`,
    );

    // 4th OPEN priority refused
    await expect(
      q(U.hod1, `SELECT public.priority_pin('${U.sci1}', 'Priority 4', 'Fourth priority must be rejected', CURRENT_DATE + 9)`),
    ).rejects.toThrow(/already holds 3 priorities/i);

    // Clash notification sent to both HoD1 and Director
    const clashes = await db.query<{ user_id: string }>(
      `SELECT user_id FROM public.notifications WHERE kind = 'PRIORITY_CLASH' ORDER BY user_id`,
    );
    expect(clashes.rows.map((r) => r.user_id)).toEqual([U.dir, U.hod1].sort());

    // Assignee seen -> push back -> asker accepts -> wanted_by moves
    await q(U.sci1, `SELECT public.priority_seen('${id1}')`);
    await q(U.sci1, `SELECT public.priority_push_back('${id1}', 'Field visit scheduled', CURRENT_DATE + 10)`);
    await q(U.hod1, `SELECT public.priority_answer('${id1}', true)`);

    const updated = await db.query<{ pushback_answer: string; wanted_by: string }>(
      `SELECT pushback_answer, wanted_by::text FROM public.work_priorities WHERE id = '${id1}'`,
    );
    expect(updated.rows[0].pushback_answer).toBe('ACCEPTED');

    // Assignee marks done
    await q(U.sci1, `SELECT public.priority_done('${id1}')`);
    const doneRow = await db.query<{ status: string }>(`SELECT status FROM public.work_priorities WHERE id = '${id1}'`);
    expect(doneRow.rows[0].status).toBe('DONE');
  });

  it('3.2 my_decisions() and decision_questions track pending items and open clarification flag', async () => {
    const before = await q<{ kind: string; subject_type: string; subject_id: string; open_question: boolean }>(
      U.hod1,
      `SELECT kind, subject_type, subject_id, open_question FROM public.my_decisions()`,
    );
    const reportRow = before.rows.find((r) => r.kind === 'PROGRESS_REPORT');
    expect(reportRow).toBeTruthy();
    expect(reportRow?.open_question).toBe(false);

    const qRes = await q<{ id: string }>(
      U.hod1,
      `SELECT public.decision_ask('project_report', '${reportRow!.subject_id}', '${U.sci1}', 'Please attach expenditure sheet') AS id`,
    );
    const qId = qRes.rows[0].id;

    const during = await q<{ kind: string; open_question: boolean }>(
      U.hod1,
      `SELECT kind, open_question FROM public.my_decisions() WHERE subject_type = 'project_report'`,
    );
    expect(during.rows[0].open_question).toBe(true);

    await q(U.sci1, `SELECT public.decision_answer('${qId}', 'Attached in section 3')`);
    const after = await q<{ kind: string; open_question: boolean }>(
      U.hod1,
      `SELECT kind, open_question FROM public.my_decisions() WHERE subject_type = 'project_report'`,
    );
    expect(after.rows[0].open_question).toBe(false);
  });

  it('3.3 SH4 home_snooze_tomorrow and report_nudge_sweep escalation ladder', async () => {
    await expect(
      q(U.sci1, `SELECT public.home_snooze_tomorrow('priority:123', NULL)`),
    ).rejects.toThrow(/Priorities cannot be postponed/i);

    await expect(
      q(U.sci1, `SELECT public.home_snooze_tomorrow('task:1', CURRENT_DATE)`),
    ).rejects.toThrow(/on or after its due date/i);

    await q(U.sci1, `SELECT public.home_snooze_tomorrow('task:1', CURRENT_DATE + 5)`);

    // Report slot seeded in beforeAll is 7 days overdue -> sweep escalates to HoD1
    const sweep = await q(U.dir, `SELECT * FROM public.report_nudge_sweep(CURRENT_DATE)`);
    expect(sweep.rows.length).toBeGreaterThanOrEqual(1);
    const hodNotif = await db.query<{ kind: string }>(
      `SELECT kind FROM public.notifications WHERE user_id = '${U.hod1}' AND kind = 'REPORT_OVERDUE_HOD'`,
    );
    expect(hodNotif.rows.length).toBe(1);
  });

  it('3.4 CD4 notices: division scoping, superseding, and read receipts', async () => {
    const n1 = await q<{ id: string }>(
      U.hod1,
      `SELECT public.notice_issue('D1/2026/01', 'OFFICE_ORDER', 'D1 Safety Order', 'Wear lab coats.', '{"scope":"DIVISIONS","divisions":["D1"]}'::jsonb, true, CURRENT_DATE + 2) AS id`,
    );
    const noticeId1 = n1.rows[0].id;

    // D1 scientist sees it; D2 scientist & Guest do not
    const d1Vis = await q(U.sci1, `SELECT id FROM public.notices WHERE id = '${noticeId1}'`);
    expect(d1Vis.rows.length).toBe(1);
    const d2Vis = await q(U.sci2, `SELECT id FROM public.notices WHERE id = '${noticeId1}'`);
    expect(d2Vis.rows.length).toBe(0);
    const guestVis = await q(U.guest, `SELECT id FROM public.notices WHERE id = '${noticeId1}'`);
    expect(guestVis.rows.length).toBe(0);

    // Acknowledge
    await q(U.sci1, `SELECT public.notice_mark_read('${noticeId1}', true)`);
    const ackRow = await db.query<{ acked_at: string | null }>(
      `SELECT acked_at FROM public.notice_reads WHERE notice_id = '${noticeId1}' AND user_id = '${U.sci1}'`,
    );
    expect(ackRow.rows[0].acked_at).not.toBeNull();

    // Supersede
    const n2 = await q<{ id: string }>(
      U.hod1,
      `SELECT public.notice_issue('D1/2026/02', 'OFFICE_ORDER', 'D1 Safety Order Rev 2', 'Updated.', '{"scope":"DIVISIONS","divisions":["D1"]}'::jsonb, false, NULL, NULL, '${noticeId1}') AS id`,
    );
    const noticeId2 = n2.rows[0].id;
    const oldNotice = await db.query<{ superseded_by: string }>(`SELECT superseded_by FROM public.notices WHERE id = '${noticeId1}'`);
    expect(oldNotice.rows[0].superseded_by).toBe(noticeId2);
  });

  it('3.5 CM2/CM3 agenda circulation, attendance quorum guard, mark held, and adjourn', async () => {
    const circ = await q<{ v: number }>(U.sci1, `SELECT public.agenda_circulate('${meetingId}', 'Please review v1') AS v`);
    expect(circ.rows[0].v).toBe(1);

    const recRes = await q<{ circulation_id: string }>(
      U.hod1,
      `SELECT circulation_id FROM public.agenda_receipts WHERE member_user_id = '${U.hod1}'`,
    );
    expect(recRes.rows.length).toBe(1);
    const circId = recRes.rows[0].circulation_id;
    await q(U.hod1, `SELECT public.agenda_receipt_ack('${circId}', 'Looks good')`);

    // Only 1 member present -> quorum_min = 2 and chair required -> mark_held fails
    await q(U.sci1, `SELECT public.meeting_attendance_set('${meetingId}', 'S3-SCI1', 'PRESENT', 'S3-SCI1', NULL, 'MEMBER_SECRETARY')`);
    await expect(
      q(U.sci1, `SELECT public.meeting_mark_held('${meetingId}')`),
    ).rejects.toThrow(/Quorum not met/i);

    // Adjourn creates follow-on meeting with carried-over pending agenda
    const adj = await q<{ id: string }>(U.sci1, `SELECT public.meeting_adjourn('${meetingId}', CURRENT_DATE + 12) AS id`);
    const nextMeetingId = adj.rows[0].id;
    const carried = await db.query<{ title: string }>(`SELECT title FROM public.agenda_items WHERE meeting_id = '${nextMeetingId}'`);
    expect(carried.rows.length).toBe(1);

    // On follow-on meeting, both Chair and Member-Secretary present -> quorum met -> mark_held succeeds
    await q(U.sci1, `SELECT public.meeting_attendance_set('${nextMeetingId}', 'S3-HOD1', 'PRESENT', 'S3-HOD1', NULL, 'CHAIRPERSON')`);
    await q(U.sci1, `SELECT public.meeting_attendance_set('${nextMeetingId}', 'S3-SCI1', 'ONLINE', 'S3-SCI1', NULL, 'MEMBER_SECRETARY')`);
    await q(U.sci1, `SELECT public.meeting_mark_held('${nextMeetingId}')`);

    const held = await db.query<{ stage: string; status: string }>(`SELECT stage, status FROM public.meetings WHERE id = '${nextMeetingId}'`);
    expect(held.rows[0].stage).toBe('HELD');
    expect(held.rows[0].status).toBe('Completed');
  });
});
