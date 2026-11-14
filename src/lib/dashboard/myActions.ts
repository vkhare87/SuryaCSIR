import type { ActionItem, Ticket, Role, StaffMember, ContractStaff, ContributionRequest, DataSteward } from '../../types';
import type { PMSReport, PMSEvaluation } from '../../types/pms';
import type { Proposal } from '../../types/proposal';
import type { ProjectReport } from '../../types/projectReport';
import type { ChangeStepKind, ClosureItem, DueSlot, MyChangeStep } from '../../types/projectFile';
import { CLOSURE_STEP_LABELS } from '../projects/closure';
import { STEP_LABELS, changeKindInfo } from '../projects/changes';
import { staffNameMatchesAuthor } from '../../utils/dateUtils';
import { retirementDate, yearsUntilRetirement } from '../staff/retirement';
import { inboxBucket, isReviewer } from '../contributions/state';

export interface MyAction {
  id: string;
  kind: 'pms-draft' | 'pms-evaluation' | 'proposal' | 'action-item' | 'ticket' | 'progress-report' | 'project-review'
      | 'project-change' | 'project-closure' | 'retirement' | 'contract-end' | 'contribution';
  label: string;
  detail: string;
  due: string | null;
  link: string;
  /** When the item began to wait on this user; set on decisions (approvals, reviews) only. */
  since?: string | null;
}

// Who picks a proposal up at each stage (20261111000001). The step list on
// the proposal page says exactly whose turn it is; this is the inbox nudge.
const PROPOSAL_DESK: Role[] = ['PME', 'MasterAdmin'];
const PROGRESS_REVIEWERS: Role[] = ['HOD', 'DivisionHead', 'Director', 'HRAdmin', 'MasterAdmin'];
// Roles that steward workforce continuity. Their `staff` list is already
// division-scoped by RLS, so a DivisionHead only sees their own division's
// retirees — no extra client filter needed here.
const RETIREMENT_WATCHERS: Role[] = ['Director', 'DivisionHead', 'HOD', 'HRAdmin', 'MasterAdmin'];
const CONTRACT_WATCHERS: Role[] = ['HRAdmin', 'MasterAdmin'];

const RETIREMENT_HORIZON_YEARS = 0.5; // alert when superannuation is within 6 months
const CONTRACT_HORIZON_DAYS = 60;
const MS_PER_DAY = 86400000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export type DueUrgency = 'overdue' | 'soon' | 'later' | 'none';
const DUE_SOON_DAYS = 14;

/** Classifies an ISO due date against today: past → overdue, within 14 days → soon. */
export function dueUrgency(due: string | null, now: Date = new Date()): DueUrgency {
  if (!due) return 'none';
  const today = isoDate(now);
  if (due < today) return 'overdue';
  return due <= isoDate(new Date(now.getTime() + DUE_SOON_DAYS * MS_PER_DAY)) ? 'soon' : 'later';
}

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
  /** Every role the user holds — request review rights follow any role, not the active one. */
  roles: Role[];
  contributions: ContributionRequest[];
  stewards: DataSteward[];
  /** Reports and called reviews owed on projects the user leads (my_due_project_slots). */
  dueSlots?: DueSlot[];
  /** Change-request steps waiting on the user (my_change_steps). */
  changeSteps?: MyChangeStep[];
  /** Completion steps waiting on the user, and reports the user owes (my_closure_items). */
  closureItems?: ClosureItem[];
}

/** Pending items requiring the current user's action, most urgent first (nulls-last by due date). */
export function deriveMyActions(input: MyActionsInput): MyAction[] {
  const {
    userId, staffName, role, reports, evaluations, proposals, progressReports, actionItems, tickets, staff,
    contractStaff, roles, contributions, stewards, dueSlots = [], changeSteps = [], closureItems = [],
  } = input;
  const actions: MyAction[] = [];

  for (const s of dueSlots) {
    actions.push({
      id: `slot-${s.slotId}`,
      kind: 'project-review',
      label: s.kind === 'PROGRESS_REPORT' ? `Progress report due — ${s.projectNo}` : `Review called — ${s.projectNo}`,
      detail: `${s.body} · ${s.periodLabel}`,
      due: s.dueDate,
      link: s.kind === 'PROGRESS_REPORT' ? '/reports/new' : `/projects/${encodeURIComponent(s.projectId)}?tab=monitoring`,
    });
  }
  for (const c of changeSteps) {
    actions.push({
      id: `change-${c.stepId}`,
      kind: 'project-change',
      label: `Change request to record — ${c.projectNo}`,
      detail: `${changeKindInfo(c.changeKind).label} · ${STEP_LABELS[c.stepKind]}`,
      due: null,
      since: c.submittedAt,
      link: `/projects/${encodeURIComponent(c.projectId)}?tab=changes`,
    });
  }
  for (const c of closureItems) {
    actions.push({
      id: `closure-${c.item}-${c.stepId ?? c.projectId}`,
      kind: 'project-closure',
      label: c.item === 'due' ? `Completion report due — ${c.projectNo}` : `Completion report to record — ${c.projectNo}`,
      detail: c.item === 'due' ? 'Write what the project did and learned; it closes the project'
        : CLOSURE_STEP_LABELS[c.stepKind as ChangeStepKind] ?? '',
      due: c.item === 'due' ? c.endDate : null,
      link: `/projects/${encodeURIComponent(c.projectId)}?tab=closure`,
    });
  }
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
        since: e.createdAt,
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
        link: `/proposals/${p.id}/edit`,
      });
    } else if (PROPOSAL_DESK.includes(role) && p.status === 'SUBMITTED') {
      actions.push({
        id: `prop-review-${p.id}`, kind: 'proposal', label: 'Proposal awaiting vetting',
        detail: p.title, due: null, link: `/proposals/${p.id}`, since: p.submittedAt ?? p.updatedAt,
      });
    } else if (PROPOSAL_DESK.includes(role) && (p.status === 'APPROVED' || p.status === 'OM_ISSUED')) {
      actions.push({
        id: `prop-sanction-${p.id}`, kind: 'proposal', label: 'Approved — record the sanction',
        detail: p.title, due: null, link: `/proposals/${p.id}`, since: p.updatedAt,
      });
    } else if (role === 'Director' && p.status === 'RECOMMENDED' && p.track === 'ULIP') {
      actions.push({
        id: `prop-review-${p.id}`, kind: 'proposal', label: 'Recommended — awaiting your approval',
        detail: p.title, due: null, link: `/proposals/${p.id}`, since: p.updatedAt,
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
        since: pr.submittedAt,
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

  for (const c of contributions) {
    const bucket = inboxBucket(c, userId, isReviewer(c, userId, roles, stewards));
    const label = bucket === 'todo' ? 'Data request'
      : bucket === 'review' && c.status === 'submitted' ? 'Update awaiting your review'
      : null;
    if (!label) continue;
    actions.push({
      id: `cr-${c.id}`, kind: 'contribution', label, detail: c.title, due: c.dueDate, link: `/work?r=${c.id}`,
      ...(bucket === 'review' ? { since: c.createdAt } : {}),
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
