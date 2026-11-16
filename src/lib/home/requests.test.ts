import { describe, expect, it } from 'vitest';
import type { ContributionRequest, Ticket } from '../../types';
import type { Proposal } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import { REQUEST_KINDS, myRequests, reportTimers, requestLink } from './requests';

const NOW = new Date(2026, 10, 13, 9, 0); // 13 Nov 2026
const ticket = (id: string, by: string, status: Ticket['status'], created: string, assigned: string | null = null) =>
  ({ id, subject: `ticket ${id}`, category: 'Finance', submitted_by: by, assigned_to: assigned, status, created_at: created } as Ticket);
const proposal = (id: string, status: Proposal['status'], submittedAt: string | null) =>
  ({ id, title: `proposal ${id}`, piUserId: 'u1', status, submittedAt, updatedAt: '2026-11-12T00:00:00Z' } as Proposal);
const report = (id: string, status: ProjectReport['status'], by = 'u1') =>
  ({ id, projectName: 'Crash box', submittedBy: by, status, submittedAt: '2026-11-03T00:00:00Z' } as ProjectReport);
const contribution = (id: string, status: ContributionRequest['status']) =>
  ({ id, title: `ask ${id}`, requestedBy: 'u1', status, createdAt: '2026-11-11T00:00:00Z' } as ContributionRequest);
const act = (id: string, due: string | null, link = '/x'): MyAction => ({ id, kind: 'proposal', due, label: id, detail: '', link });

describe('request door', () => {
  it('fills the category and subject of the ticket form', () => {
    expect(requestLink(REQUEST_KINDS.find(k => k.key === 'leave')!)).toBe('/helpdesk/new?category=Administrative&subject=Leave%3A+');
    expect(requestLink(REQUEST_KINDS.find(k => k.key === 'other')!)).toBe('/helpdesk/new');
  });
});

describe('myRequests', () => {
  const rows = myRequests({
    userId: 'u1', now: NOW,
    tickets: [ticket('t1', 'u1', 'Open', '2026-11-10T08:00:00Z'), ticket('t2', 'u1', 'Resolved', '2026-10-01T00:00:00Z'), ticket('t3', 'u2', 'Open', '2026-11-01T00:00:00Z')],
    proposals: [proposal('p1', 'SUBMITTED', '2026-10-24T00:00:00Z'), proposal('p2', 'DRAFT', null), proposal('p3', 'OM_ISSUED', '2026-01-01T00:00:00Z')],
    progressReports: [report('r1', 'UNDER_REVIEW'), report('r2', 'DRAFT'), report('r3', 'SUBMITTED', 'u2')],
    contributions: [contribution('c1', 'open'), contribution('c2', 'done')],
  });
  it('keeps only open requests the person raised, oldest first', () => {
    expect(rows.map(r => r.key)).toEqual(['proposal:p1', 'report:r1', 'ticket:t1', 'contribution:c1']);
  });
  it('names who holds each one and for how many days', () => {
    expect(rows[0]).toMatchObject({ holder: 'PME desk · vetting', days: 20 });
    expect(rows[1]).toMatchObject({ holder: 'reviewer · reading', days: 10 });
    expect(rows[2]).toMatchObject({ holder: 'Finance desk · not picked up', days: 3 });
  });
});

describe('reportTimers', () => {
  const timers = reportTimers([
    act('slot-1', '2026-11-19', '/reports/new'),
    act('slot-2', '2026-11-15', '/projects/P1?tab=monitoring'), // a called review, not a report I write
    act('pr-9', '2026-11-09'),
    act('pr-review-9', '2026-11-10'),
    act('pms-1', '2026-11-30'),
    act('closure-due-P1', '2027-02-01'),
    act('prop-1', '2026-11-14'),
    act('pms-2', null),
  ], NOW);
  it('keeps the reports the person owes, soonest first, overdue as negative', () => {
    expect(timers.map(t => [t.action.id, t.daysLeft])).toEqual([['pr-9', -4], ['slot-1', 6], ['pms-1', 17], ['closure-due-P1', 80]]);
  });
  it('fills the ring over the last 30 days', () => {
    expect(timers.map(t => Math.round(t.share * 100))).toEqual([100, 80, 43, 0]);
  });
});
