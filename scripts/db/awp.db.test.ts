// @vitest-environment node
// One full Annual Work Plan cycle plus edge cases, against every real
// migration in an in-process Postgres (see pgliteHarness.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, migratedDb, sqlFile, type Tx } from './pgliteHarness';
import { nextReportingYear, reportingYearFor } from '../../src/lib/pms/awp';

const U = {
  sci: '10000000-0000-0000-0000-000000000001',
  ro: '10000000-0000-0000-0000-000000000002',
  rvo: '10000000-0000-0000-0000-000000000003',
  dir: '10000000-0000-0000-0000-000000000004',
  hr: '10000000-0000-0000-0000-000000000005',
  evalr: '10000000-0000-0000-0000-000000000006', // evaluator from another division
  stranger: '10000000-0000-0000-0000-000000000007',
  late: '10000000-0000-0000-0000-000000000008', // staff linked to a login after import
  noro: '10000000-0000-0000-0000-000000000009', // has a login but no Reporting Officer yet
} as const;

// Dates relative to today so the suite never ages out: next year's AWP is
// always before its 15 May deadline and inside its 30 Sep revision window.
const YEAR = nextReportingYear(reportingYearFor(new Date()));
const Y0 = Number(YEAR.slice(0, 4));
const LATER = nextReportingYear(YEAR);
const PAST = reportingYearFor(new Date(Y0 - 3, 5, 1));

function payload(total = 100, confidential = false) {
  return {
    partA: { name: 'Test Scientist' },
    activitySplit: [
      { label: 'R&D — Fundamental Research', role: 'lead', timePct: total - 10 },
      { label: 'Any other', role: 'admin', timePct: 10 },
    ],
    projects: [
      { kind: 'CSIR', details: 'Open gripper project', objectives: 'SMA gripper', resources: '', confidential: false },
      { kind: 'EXTERNAL', details: 'Strategic sensor', objectives: 'secret objective', resources: '', confidential },
    ],
    objectives: { patents: '1 patent' }, development: {}, institutionalWork: 'Safety committee', other: '',
  };
}

const rpc = async (tx: Tx, fn: string, args: unknown[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await tx.query<Record<string, unknown>>(`SELECT * FROM public.${fn}(${ph})`, args)).rows;
};
const one = async (tx: Tx, sql: string, args: unknown[] = []) =>
  (await tx.query<Record<string, unknown>>(sql, args)).rows[0];

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U.sci}', 'sci@t.local'), ('${U.ro}', 'ro@t.local'), ('${U.rvo}', 'rvo@t.local'),
      ('${U.dir}', 'dir@t.local'), ('${U.hr}', 'hr@t.local'), ('${U.evalr}', 'ev@t.local'),
      ('${U.stranger}', 'x@t.local'), ('${U.late}', 'late@t.local'), ('${U.noro}', 'noro@t.local');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${U.dir}', 'Director'), ('${U.hr}', 'HRAdmin');
    INSERT INTO public.divisions ("divCode", "divHoDID") VALUES ('IMD', 'T-RO'), ('NOHOD', NULL), ('OTH', NULL);
    INSERT INTO public.staff ("ID", "Name", "Designation", "Division", "ReportingID", "Email", user_id) VALUES
      ('T-DIR', 'Director', 'Director',          'DIR',   NULL,    'dir@t.local', '${U.dir}'),
      ('T-RO',  'HoD',      'Chief Scientist',   'IMD',   'T-DIR', 'ro@t.local',  '${U.ro}'),
      ('T-RVO', 'RvO',      'Chief Scientist',   'IMD',   'T-DIR', 'rvo@t.local', '${U.rvo}'),
      ('T-SCI', 'Sci',      'Senior Scientist',  'IMD',   'T-RO',  'sci@t.local', '${U.sci}'),
      ('T-EV',  'Eval',     'Chief Scientist',   'OTH',   NULL,    'ev@t.local',  '${U.evalr}'),
      ('T-X',   'Stranger', 'Scientist',         'OTH',   NULL,    'x@t.local',   '${U.stranger}'),
      ('T-NORO','No RO',    'Scientist',         'NOHOD', NULL,    NULL,          NULL),
      ('T-LATE','Late',     'Scientist',         'IMD',   'T-RO',  'late2@t.local', NULL),
      ('T-NORO2','No RO 2', 'Scientist',         'NOHOD', NULL,    'noro@t.local', '${U.noro}');
    INSERT INTO public.appraisal_cycles (id, name, start_date, end_date, status)
      VALUES ('20000000-0000-0000-0000-000000000001', '${YEAR}', '${Y0}-04-01', '${Y0 + 1}-03-31', 'OPEN');
    INSERT INTO public.pms_reports (id, cycle_id, scientist_id, status, period_from, period_to)
      VALUES ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '${U.sci}',
              'UNDER_EVALUATION_COMMITTEE_REVIEW', '${Y0}-04-01', '${Y0 + 1}-03-31');
    INSERT INTO public.pms_evaluations (report_id, evaluator_id)
      VALUES ('20000000-0000-0000-0000-000000000002', '${U.evalr}');
  `);
}, 180000);

afterAll(async () => { await db?.close(); });

describe('harness self-check', () => {
  it('enforces RLS for the authenticated role (a stranger sees no staff-private AWP rows)', async () => {
    const n = await as(db, U.stranger, tx => one(tx, `SELECT count(*)::int AS n FROM public.pms_awps`));
    expect(n.n).toBe(0);
  });

  it('runs supabase/tests/rls_awp.sql green', async () => {
    const fresh = await migratedDb();
    try { await expect(fresh.exec(sqlFile('supabase/tests/rls_awp.sql'))).resolves.toBeDefined(); }
    finally { await fresh.close(); }
  }, 180000);
});

describe('one full AWP cycle', () => {
  let awpId: string;

  it('admin sets a non-Director Reviewing Officer (spec: admin may override)', async () => {
    // Created by the scientist first so the RvO override has a row to act on.
    awpId = (await as(db, U.sci, tx => rpc(tx, 'pms_awp_save_draft', ['T-SCI', YEAR, JSON.stringify(payload(100, true))])))[0].pms_awp_save_draft as string;
    await as(db, U.hr, tx => rpc(tx, 'pms_awp_set_reviewing_officer', [awpId, 'T-RVO']));
    const row = await one(db as unknown as Tx, `SELECT reviewing_officer_id FROM pms_awps WHERE id = $1`, [awpId]);
    expect(row.reviewing_officer_id).toBe('T-RVO');
  });

  it('scientist submits; the HoD is notified', async () => {
    await as(db, U.sci, tx => rpc(tx, 'pms_awp_submit', [awpId]));
    const row = await one(db as unknown as Tx, `SELECT status, submitted_at FROM pms_awps WHERE id = $1`, [awpId]);
    expect(row.status).toBe('WITH_RO');
    const note = await one(db as unknown as Tx, `SELECT count(*)::int AS n FROM pms_notifications WHERE user_id = $1 AND type = 'awp_review_needed'`, [U.ro]);
    expect(note.n).toBe(1);
  });

  it('HoD must give reasons for "not reasonable"', async () => {
    await expect(as(db, U.ro, tx => rpc(tx, 'pms_awp_ro_review', [awpId, 'NOT_REASONABLE', 'too short'])))
      .rejects.toThrow(/Reasons/);
  });

  it('HoD finds it reasonable → Reviewing Officer', async () => {
    await as(db, U.ro, tx => rpc(tx, 'pms_awp_ro_review', [awpId, 'REASONABLE', null]));
    expect((await one(db as unknown as Tx, `SELECT status FROM pms_awps WHERE id = $1`, [awpId])).status).toBe('WITH_RVO');
  });

  it('Reviewing Officer forwards → Director', async () => {
    await as(db, U.rvo, tx => rpc(tx, 'pms_awp_rvo_review', [awpId, 'Plan is balanced']));
    expect((await one(db as unknown as Tx, `SELECT status FROM pms_awps WHERE id = $1`, [awpId])).status).toBe('WITH_DIRECTOR');
  });

  it('Director cannot approve a modification that does not total 100%', async () => {
    await expect(as(db, U.dir, tx => rpc(tx, 'pms_awp_director_decide',
      [awpId, 'MODIFIED', 'Reduced fundamental research share', JSON.stringify(payload(90))])))
      .rejects.toThrow(/100%/);
  });

  it('an admin cannot take the Director decision (§5.E.a.iv)', async () => {
    await expect(as(db, U.hr, tx => rpc(tx, 'pms_awp_director_decide', [awpId, 'ACCEPTED', null, null])))
      .rejects.toThrow('Only the Director can approve an Annual Work Plan');
  });

  it('Director approves; the scientist is told', async () => {
    await as(db, U.dir, tx => rpc(tx, 'pms_awp_director_decide', [awpId, 'ACCEPTED', null, null]));
    const row = await one(db as unknown as Tx, `SELECT status, communicated_at, approved_by FROM pms_awps WHERE id = $1`, [awpId]);
    expect(row.status).toBe('APPROVED');
    expect(row.communicated_at).not.toBeNull();
    expect(row.approved_by).toBe(U.dir);
    const note = await one(db as unknown as Tx, `SELECT count(*)::int AS n FROM pms_notifications WHERE user_id = $1 AND type = 'awp_approved'`, [U.sci]);
    expect(note.n).toBe(1);
  });

  it('revision must also total 100%, then the Director approves it', async () => {
    await expect(as(db, U.sci, tx => rpc(tx, 'pms_awp_request_revision',
      [awpId, 'Project ICMR closed early, re-plan', JSON.stringify(payload(80))]))).rejects.toThrow(/100%/);
    const after = { ...payload(100, true), institutionalWork: 'Library committee' };
    const revId = (await as(db, U.sci, tx => rpc(tx, 'pms_awp_request_revision',
      [awpId, 'Project ICMR closed early, re-plan', JSON.stringify(after)])))[0].pms_awp_request_revision as string;
    await as(db, U.dir, tx => rpc(tx, 'pms_awp_decide_revision', [revId, true, 'ok']));
    expect((await one(db as unknown as Tx, `SELECT institutional_work FROM pms_awps WHERE id = $1`, [awpId])).institutional_work)
      .toBe('Library committee');
  });

  it('an evaluator from another division gets the AWP for the report, confidential project redacted', async () => {
    const row = await as(db, U.evalr, tx => one(tx,
      `SELECT * FROM public.pms_awp_for_report($1)`, ['20000000-0000-0000-0000-000000000002']));
    expect(row?.reporting_year).toBe(YEAR);
    const projects = row.projects as { kind: string; details: string; confidential: boolean }[];
    expect(projects.find(p => p.kind === 'CSIR')!.details).toBe('Open gripper project');
    const secret = projects.find(p => p.kind === 'EXTERNAL')!;
    expect(secret.confidential).toBe(true);
    expect(JSON.stringify(secret)).not.toContain('Strategic sensor');
  });

  it('the evaluator cannot read the raw AWP row or its revisions directly', async () => {
    const n = await as(db, U.evalr, tx => one(tx, `SELECT
      (SELECT count(*)::int FROM pms_awps) AS awps, (SELECT count(*)::int FROM pms_awp_revisions) AS revs`));
    expect(n).toEqual({ awps: 0, revs: 0 });
  });

  it('a stranger gets nothing from pms_awp_for_report', async () => {
    const rows = await as(db, U.stranger, tx => tx.query(`SELECT * FROM public.pms_awp_for_report($1)`, ['20000000-0000-0000-0000-000000000002']));
    expect(rows.rows.filter(r => (r as { id: string | null }).id != null)).toHaveLength(0);
  });
});

describe('edge cases', () => {
  it('a scientist with no Reporting Officer on record cannot get stuck in WITH_RO', async () => {
    await expect(as(db, U.hr, tx => rpc(tx, 'pms_awp_import',
      ['T-NORO', YEAR, JSON.stringify(payload()), 'WITH_RO', null, null, null, null])))
      .rejects.toThrow(/No Reporting Officer on record/);
  });

  it('the RO fills in a blank-forwarded AWP (§5.E.a.iii)', async () => {
    const id = (await as(db, U.hr, tx => rpc(tx, 'pms_awp_forward_blank', ['T-LATE', YEAR])))[0].pms_awp_forward_blank as string;
    await as(db, U.ro, tx => rpc(tx, 'pms_awp_ro_review', [id, 'REASONABLE', null, JSON.stringify(payload())]));
    const row = await one(db as unknown as Tx, `SELECT status, institutional_work FROM pms_awps WHERE id = $1`, [id]);
    expect(row.status).toBe('WITH_DIRECTOR');
    expect(row.institutional_work).toBe('Safety committee');
  });

  it('linking a login to a staff row later makes the AWP theirs', async () => {
    await db.exec(`UPDATE public.staff SET user_id = '${U.late}' WHERE "ID" = 'T-LATE'`);
    const row = await one(db as unknown as Tx, `SELECT scientist_user_id FROM pms_awps WHERE staff_id = 'T-LATE'`);
    expect(row.scientist_user_id).toBe(U.late);
    const n = await as(db, U.late, tx => one(tx, `SELECT count(*)::int AS n FROM pms_awps WHERE staff_id = 'T-LATE'`));
    expect(n.n).toBe(1);
  });

  it('an AWP cannot be submitted after its 15 May deadline (late ones go via forward-blank)', async () => {
    const id = (await as(db, U.sci, tx => rpc(tx, 'pms_awp_save_draft', ['T-SCI', PAST, JSON.stringify(payload())])))[0].pms_awp_save_draft as string;
    await expect(as(db, U.sci, tx => rpc(tx, 'pms_awp_submit', [id])))
      .rejects.toThrow(`AWP submission deadline (15 May ${PAST.slice(0, 4)}) has passed`);
  });

  it('an imported plan must total 100% whatever its status', async () => {
    for (const status of ['APPROVED', 'WITH_DIRECTOR', 'WITH_RO']) {
      await expect(as(db, U.hr, tx => rpc(tx, 'pms_awp_import',
        ['T-X', PAST, JSON.stringify(payload(95)), status, null, null, null, null])))
        .rejects.toThrow(/100%/);
    }
  });

  it('forward-blank records a Reporting Officer assigned after the draft was saved', async () => {
    const id = (await as(db, U.noro, tx => rpc(tx, 'pms_awp_save_draft', ['T-NORO2', YEAR, JSON.stringify(payload())])))[0].pms_awp_save_draft as string;
    expect((await one(db as unknown as Tx, `SELECT reporting_officer_id FROM pms_awps WHERE id = $1`, [id])).reporting_officer_id).toBeNull();
    await db.exec(`UPDATE public.staff SET "ReportingID" = 'T-RO' WHERE "ID" = 'T-NORO2'`);
    await as(db, U.hr, tx => rpc(tx, 'pms_awp_forward_blank', ['T-NORO2', YEAR]));
    const row = await one(db as unknown as Tx, `SELECT status, reporting_officer_id FROM pms_awps WHERE id = $1`, [id]);
    expect(row).toEqual({ status: 'WITH_RO', reporting_officer_id: 'T-RO' });
    await as(db, U.ro, tx => rpc(tx, 'pms_awp_ro_review', [id, 'REASONABLE', null]));
  });

  it('a duplicate import for the same scientist and year is rejected', async () => {
    await expect(as(db, U.hr, tx => rpc(tx, 'pms_awp_import',
      ['T-SCI', YEAR, JSON.stringify(payload()), 'APPROVED', null, null, null, null])))
      .rejects.toThrow('AWP already exists for this scientist and year');
  });

  it('only the owner can save their draft', async () => {
    await expect(as(db, U.stranger, tx => rpc(tx, 'pms_awp_save_draft', ['T-SCI', LATER, JSON.stringify(payload())])))
      .rejects.toThrow('Not your Annual Work Plan');
  });

  it('a malformed reporting year is rejected', async () => {
    await expect(as(db, U.sci, tx => rpc(tx, 'pms_awp_save_draft', ['T-SCI', '2027', JSON.stringify(payload())])))
      .rejects.toThrow(/reporting_year/);
  });

  it('a revision of a non-approved AWP is rejected', async () => {
    const id = (await as(db, U.sci, tx => rpc(tx, 'pms_awp_save_draft', ['T-SCI', LATER, JSON.stringify(payload())])))[0].pms_awp_save_draft as string;
    await expect(as(db, U.sci, tx => rpc(tx, 'pms_awp_request_revision', [id, 'Change of project scope entirely', JSON.stringify(payload())])))
      .rejects.toThrow('Only an approved AWP can be revised');
  });

  it('pms_awp_notify is not callable by signed-in users', async () => {
    await expect(as(db, U.stranger, tx => rpc(tx, 'pms_awp_notify', ['T-SCI', 'x', 'spoof', 'spoof'])))
      .rejects.toThrow(/permission denied/);
  });

  it('only admins may change the Reviewing Officer', async () => {
    const id = (await one(db as unknown as Tx, `SELECT id FROM pms_awps WHERE staff_id = 'T-SCI' AND reporting_year = $1`, [LATER])).id;
    await expect(as(db, U.sci, tx => rpc(tx, 'pms_awp_set_reviewing_officer', [id, 'T-X'])))
      .rejects.toThrow(/administrators/);
  });
});
