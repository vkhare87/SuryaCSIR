import type { ActionItem, Ticket, Role, StaffMember, ContractStaff } from '../../types';
import type { PMSReport, PMSEvaluation } from '../../types/pms';
import type { Proposal } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';
import { retirementDate, yearsUntilRetirement } from '../staff/retirement';

export interface MyAction {
  id: string;
  kind: 'pms-draft' | 'pms-evaluation' | 'proposal' | 'action-item' | 'ticket' | 'progress-report'
      | 'retirement' | 'contract-end';
  label: string;
  detail: string;
  due: string | null;
  link: string;
}

const PROPOSAL_REVIEWERS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const PROGRESS_REVIEWERS: Role[] = ['HOD', 'DivisionHead', 'Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];
// Roles that steward workforce continuity. Their `staff` list is already
// division-scoped by RLS, so a DivisionHead only sees their own division's
// retirees — no extra client filter needed here.
const RETIREMENT_WATCHERS: Role[] = ['Director', 'DivisionHead', 'HOD', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const CONTRACT_WATCHERS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];

const RETIREMENT_HORIZON_YEARS = 0.5; // alert when superannuation is within 6 months
const CONTRACT_HORIZON_DAYS = 60;
const MS_PER_DAY = 86400000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export interface MyActionsInput {
  userId: string;
  staffName: string;
  role: Role;
  reports: PMSReport[];
  evaluations: PMSEvaluation[];
  proposals: Proposal[];
  progressReports: ProjectReport[];
  actionItems: ActionItem[];
  tickets: Ticket[];
  staff: StaffMember[];
  contractStaff: ContractStaff[];
}

/** Pending items requiring the current user's action, most urgent first (nulls-last by due date). */
export function deriveMyActions(input: MyActionsInput): MyAction[] {
  const { userId, staffName, role, reports, evaluations, proposals, progressReports, actionItems, tickets, staff, contractStaff } = input;
  const actions: MyAction[] = [];
  const now = new Date();

  for (const r of reports) {
    if (r.scientistId === userId && r.status === 'DRAFT') {
      actions.push({
        id: `pms-${r.id}`,
        kind: 'pms-draft',
        label: 'PMS report in draft',
        detail: 'Complete and submit your appraisal report',
        due: r.cycle?.endDate ?? null,
        link: `/pms/reports/${r.id}/edit`,
      });
    }
  }

  for (const e of evaluations) {
    if (e.evaluatorId === userId && e.status !== 'COMPLETED') {
      actions.push({
        id: `eval-${e.id}`,
        kind: 'pms-evaluation',
        label: 'PMS evaluation pending',
        detail: 'A report is awaiting your evaluation',
        due: null,
        link: `/pms/evaluate/${e.id}`,
      });
    }
  }

  for (const p of proposals) {
    if (p.piUserId === userId && p.status === 'REVISION_REQUESTED') {
      actions.push({
        id: `prop-${p.id}`,
        kind: 'proposal',
        label: 'Proposal revision requested',
        detail: p.title,
        due: null,
        link: `/proposals/${p.id}/edit`,
      });
    } else if (p.piUserId === userId && p.status === 'DRAFT') {
      actions.push({
        id: `prop-${p.id}`,
        kind: 'proposal',
        label: 'Draft proposal not yet submitted',
        detail: p.title,
        due: null,
        link: `/proposals/${p.id}`,
      });
    } else if (PROPOSAL_REVIEWERS.includes(role) && (p.status === 'SUBMITTED' || p.status === 'UNDER_REVIEW')) {
      actions.push({
        id: `prop-review-${p.id}`,
        kind: 'proposal',
        label: 'Proposal awaiting review',
        detail: p.title,
        due: null,
        link: `/proposals/${p.id}`,
      });
    }
  }

  for (const pr of progressReports) {
    if (pr.submittedBy === userId && (pr.status === 'DRAFT' || pr.status === 'REVISION_REQUESTED')) {
      actions.push({
        id: `pr-${pr.id}`,
        kind: 'progress-report',
        label: pr.status === 'REVISION_REQUESTED' ? 'Progress report needs revision' : 'Progress report in draft',
        detail: `${pr.projectName} · ${pr.periodLabel}`,
        due: pr.dueDate,
        link: `/reports/${pr.id}`,
      });
    } else if (PROGRESS_REVIEWERS.includes(role) && (pr.status === 'SUBMITTED' || pr.status === 'UNDER_REVIEW')) {
      actions.push({
        id: `pr-review-${pr.id}`,
        kind: 'progress-report',
        label: 'Progress report awaiting review',
        detail: `${pr.projectName} · ${pr.periodLabel}`,
        due: pr.dueDate,
        link: `/reports/${pr.id}`,
      });
    }
  }

  for (const a of actionItems) {
    if (a.status !== 'Completed' && staffName && staffNameMatchesAuthor(staffName, a.assigned_to)) {
      actions.push({
        id: `ai-${a.id}`,
        kind: 'action-item',
        label: 'Committee action item',
        detail: a.task,
        due: a.deadline || null,
        link: '/committees',
      });
    }
  }

  for (const t of tickets) {
    if (t.assigned_to === userId && (t.status === 'Open' || t.status === 'InProgress')) {
      actions.push({
        id: `tk-${t.id}`,
        kind: 'ticket',
        label: 'Helpdesk ticket assigned to you',
        detail: t.subject,
        due: null,
        link: `/helpdesk/${t.id}`,
      });
    }
  }

  // Staff superannuating within the horizon — workforce-continuity alert for
  // stewards. `staff` is RLS-scoped, so managers only see their own division.
  if (RETIREMENT_WATCHERS.includes(role)) {
    for (const s of staff) {
      const yrs = yearsUntilRetirement(s.DOB, now);
      if (yrs === null || yrs < 0 || yrs > RETIREMENT_HORIZON_YEARS) continue;
      const on = retirementDate(s.DOB);
      actions.push({
        id: `retire-${s.ID}`,
        kind: 'retirement',
        label: 'Superannuation approaching',
        detail: `${s.Name}${s.Designation ? ` · ${s.Designation}` : ''}`,
        due: on ? isoDate(on) : null,
        link: '/staff/analytics',
      });
    }
  }

  // Contract staff whose engagement ends soon — for HR (all) and the person
  // themselves (name match).
  for (const c of contractStaff) {
    const t = Date.parse(c.ContractEndDate);
    if (!Number.isFinite(t)) continue;
    const days = (t - now.getTime()) / MS_PER_DAY;
    if (days < 0 || days > CONTRACT_HORIZON_DAYS) continue;
    const isSelf = staffName !== '' && staffNameMatchesAuthor(staffName, c.Name);
    if (!CONTRACT_WATCHERS.includes(role) && !isSelf) continue;
    actions.push({
      id: `contract-${c.id}`,
      kind: 'contract-end',
      label: isSelf ? 'Your engagement ends soon' : 'Contract ending soon',
      detail: `${c.Name}${c.Designation ? ` · ${c.Designation}` : ''}`,
      due: isoDate(new Date(t)),
      link: '/staff/project',
    });
  }

  // Due-dated items first (ascending), undated after, stable within groups.
  return actions.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}
