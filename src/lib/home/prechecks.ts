import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';
import type { MyAction } from '../dashboard/myActions';
import type { HomeMilestone } from './api';
import { readProject } from './division';

export interface Precheck { text: string; finding: boolean }

export interface PrecheckContext {
  projects: ProjectInfo[];
  progressReports: ProjectReport[];
  milestones: HomeMilestone[];
  now?: Date;
}

/**
 * The facts a decision-maker needs before opening the item (HOD-HOME-PLAN §3).
 * A pure reading of records already loaded; null when there is no check for the kind,
 * so the row never shows a pass that was not computed.
 * ponytail: progress-report reviews only; each kind gets its check when its data is on hand
 * (posts and funds for hiring with P5, CPS for indents, readiness context for proposals).
 */
export function precheck(a: MyAction, ctx: PrecheckContext): Precheck | null {
  if (!a.id.startsWith('pr-review-')) return null;
  const report = ctx.progressReports.find(r => `pr-review-${r.id}` === a.id);
  const project = report ? ctx.projects.find(p => p.ProjectNo === report.projectNo) : undefined;
  if (!report || !project) return null;
  const reading = readProject(project, ctx.milestones.filter(m => m.projectId === project.ProjectID), ctx.now);
  const due = report.dueDate ? ` · was due ${report.dueDate}` : '';
  return reading.reasons.length > 0
    ? { text: `${reading.reasons.join(' · ')}${due}`, finding: true }
    : { text: `No finding on time, money or milestones${due}`, finding: false };
}
