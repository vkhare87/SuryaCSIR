import type { ActionItem, Ticket, Role } from '../../types';
import type { PMSReport, PMSEvaluation } from '../../types/pms';
import type { Proposal } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';

export interface MyAction {
  id: string;
  kind: 'pms-draft' | 'pms-evaluation' | 'proposal' | 'action-item' | 'ticket' | 'progress-report';
  label: string;
  detail: string;
  due: string | null;
  link: string;
}

const PROPOSAL_REVIEWERS: Role[] = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'];
const PROGRESS_REVIEWERS: Role[] = ['HOD', 'DivisionHead', 'Director', 'HRAdmin', 'SystemAdmin', 'MasterAdmin'];

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
}

/** Pending items requiring the current user's action, most urgent first (nulls-last by due date). */
export function deriveMyActions(input: MyActionsInput): MyAction[] {
  const { userId, staffName, role, reports, evaluations, proposals, progressReports, actionItems, tickets } = input;
  const actions: MyAction[] = [];

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

  // Due-dated items first (ascending), undated after, stable within groups.
  return actions.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}
