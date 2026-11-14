import type { ContributionRequest, Ticket, TicketCategory } from '../../types';
import type { Proposal, ProposalStatus } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import { daysUntil } from './today';

// --- 1. One door: what a person can ask for ---

export interface RequestKind {
  key: string;
  label: string;
  /** Helpdesk category the ticket is routed by; null lets the person pick. */
  category: TicketCategory | null;
  /** Start of the subject line, so the desk sees the kind at a glance. */
  subject: string;
}

// ponytail: a constant list; a request_catalog table (CD3) when someone other than a developer must add kinds.
export const REQUEST_KINDS: RequestKind[] = [
  { key: 'repair', label: 'Repair or upkeep', category: 'Infrastructure', subject: 'Repair: ' },
  { key: 'it', label: 'Computer, network or instrument fault', category: 'EquipmentIT', subject: '' },
  { key: 'letter', label: 'Letter or certificate', category: 'Administrative', subject: 'Letter: ' },
  { key: 'leave', label: 'Leave', category: 'Administrative', subject: 'Leave: ' },
  { key: 'room', label: 'Room for a meeting', category: 'Infrastructure', subject: 'Room: ' },
  { key: 'vehicle', label: 'Vehicle', category: 'Transport', subject: 'Vehicle: ' },
  { key: 'money', label: 'Money, a bill or a claim', category: 'Finance', subject: '' },
  { key: 'library', label: 'Library', category: 'Library', subject: '' },
  { key: 'complaint', label: 'A complaint', category: 'HRGrievance', subject: 'Complaint: ' },
  { key: 'other', label: 'Something else', category: null, subject: '' },
];

/** The ticket form address for a request kind, with the category and subject filled in. */
export function requestLink(kind: RequestKind): string {
  const q = new URLSearchParams();
  if (kind.category) q.set('category', kind.category);
  if (kind.subject) q.set('subject', kind.subject);
  const s = q.toString();
  return s ? `/helpdesk/new?${s}` : '/helpdesk/new';
}

// --- 2. My requests: everything I asked for that is still open ---

export interface RequestRow {
  key: string;
  title: string;
  /** Who holds it now, in plain words. A desk, not an officer, when an office holds it. */
  holder: string;
  /** Whole days since it was asked. */
  days: number;
  link: string;
}

const PROPOSAL_HOLDER: Partial<Record<ProposalStatus, string>> = {
  SUBMITTED: 'PME desk · vetting',
  UNDER_REVIEW: 'review committee',
  RECOMMENDED: 'Director · approval',
  APPROVED: 'PME desk · sanction',
};

export interface MyRequestsInput {
  userId: string;
  tickets: Ticket[];
  proposals: Proposal[];
  progressReports: ProjectReport[];
  contributions: ContributionRequest[];
  now?: Date;
}

const ageDays = (iso: string | null | undefined, now: Date) => (iso ? Math.max(0, -daysUntil(iso.slice(0, 10), now)) : 0);

/** Open requests this person raised, of every kind SURYA holds today, oldest first. */
export function myRequests({ userId, tickets, proposals, progressReports, contributions, now = new Date() }: MyRequestsInput): RequestRow[] {
  const rows: RequestRow[] = [];
  for (const t of tickets) {
    if (t.submitted_by !== userId || (t.status !== 'Open' && t.status !== 'InProgress')) continue;
    rows.push({
      key: `ticket:${t.id}`, title: t.subject, link: `/helpdesk/${t.id}`, days: ageDays(t.created_at, now),
      holder: t.assigned_to ? `${t.category} desk${t.status === 'InProgress' ? ' · in progress' : ''}` : `${t.category} desk · not picked up`,
    });
  }
  for (const p of proposals) {
    const holder = PROPOSAL_HOLDER[p.status];
    if (p.piUserId !== userId || !holder) continue;
    rows.push({ key: `proposal:${p.id}`, title: p.title, link: `/proposals/${p.id}`, holder, days: ageDays(p.submittedAt ?? p.updatedAt, now) });
  }
  for (const r of progressReports) {
    if (r.submittedBy !== userId || (r.status !== 'SUBMITTED' && r.status !== 'UNDER_REVIEW')) continue;
    rows.push({
      key: `report:${r.id}`, title: `Progress report · ${r.projectName}`, link: `/reports/${r.id}`,
      holder: r.status === 'UNDER_REVIEW' ? 'reviewer · reading' : 'reviewer · not opened', days: ageDays(r.submittedAt, now),
    });
  }
  for (const c of contributions) {
    if (c.requestedBy !== userId || c.status === 'done' || c.status === 'declined') continue;
    rows.push({
      key: `contribution:${c.id}`, title: c.title, link: `/work?r=${c.id}`, days: ageDays(c.createdAt, now),
      holder: c.status === 'submitted' ? 'back with you to check' : 'the person asked',
    });
  }
  return rows.sort((a, b) => b.days - a.days);
}

// --- 3. Report timers: reports I owe, with days left ---

export const TIMER_WINDOW_DAYS = 30;

export interface ReportTimer {
  action: MyAction;
  daysLeft: number;
  /** Share of the 30-day window before the due date that is used (0–1). */
  share: number;
}

/** Reports this person must write: progress reports, the self-appraisal, completion reports. */
export function isOwnReport(a: MyAction): boolean {
  return (a.id.startsWith('slot-') && a.link === '/reports/new')
    || (a.id.startsWith('pr-') && !a.id.startsWith('pr-review-'))
    || a.id.startsWith('pms-')
    || a.id.startsWith('closure-due-');
}

/** One timer per report with a due date, soonest first. */
export function reportTimers(actions: MyAction[], now: Date = new Date()): ReportTimer[] {
  return actions
    .filter(a => a.due !== null && isOwnReport(a))
    .map((a) => {
      const daysLeft = daysUntil(a.due as string, now);
      return { action: a, daysLeft, share: Math.min(1, Math.max(0, (TIMER_WINDOW_DAYS - daysLeft) / TIMER_WINDOW_DAYS)) };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
