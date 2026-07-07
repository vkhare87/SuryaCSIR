import type { Proposal, ProposalStatus } from '../../types/proposal';
import type { ProjectInfo } from '../../types';
import type { ProjectReport } from '../../types/projectReport';

export type LifecycleStage =
  | 'Concept' | 'Under Evaluation' | 'Sanctioned' | 'Execution' | 'Completed' | 'Dropped';

export interface LifecycleThread {
  key: string;
  title: string;
  divisionCode: string;
  stage: LifecycleStage;
  proposalStatus?: string;
  projectNo?: string;
  reportCount: number;
  lastReport?: string;
}

const STAGE_MAP: Record<ProposalStatus, LifecycleStage> = {
  DRAFT: 'Concept',
  SUBMITTED: 'Under Evaluation',
  UNDER_REVIEW: 'Under Evaluation',
  REVISION_REQUESTED: 'Under Evaluation',
  RECOMMENDED: 'Under Evaluation',
  APPROVED: 'Sanctioned',
  OM_ISSUED: 'Sanctioned',
  LINKED: 'Execution',
  REJECTED: 'Dropped',
  ARCHIVED: 'Dropped',
};

export function stageOfProposal(status: ProposalStatus): LifecycleStage {
  return STAGE_MAP[status] ?? 'Concept';
}

const isCompleted = (p: ProjectInfo) => /complete/i.test(p.ProjectStatus);

export function lifecycleThreads(
  proposals: Proposal[], projects: ProjectInfo[], reports: ProjectReport[],
): LifecycleThread[] {
  const reportsByProject = new Map<string, ProjectReport[]>();
  for (const r of reports) {
    const list = reportsByProject.get(r.projectNo) ?? [];
    list.push(r);
    reportsByProject.set(r.projectNo, list);
  }
  const projectByNo = new Map(projects.map(p => [p.ProjectNo, p]));
  const linkedNos = new Set<string>();
  const threads: LifecycleThread[] = [];

  for (const prop of proposals) {
    const project = prop.linkedProjectNo ? projectByNo.get(prop.linkedProjectNo) : undefined;
    if (prop.linkedProjectNo) linkedNos.add(prop.linkedProjectNo);
    const reps = project ? (reportsByProject.get(project.ProjectNo) ?? []) : [];
    threads.push({
      key: `prop-${prop.id}`,
      title: prop.title,
      divisionCode: prop.divisionCode,
      stage: project && isCompleted(project) ? 'Completed' : stageOfProposal(prop.status),
      proposalStatus: prop.status,
      projectNo: project?.ProjectNo,
      reportCount: reps.length,
      lastReport: reps.length ? reps[reps.length - 1].periodLabel : undefined,
    });
  }

  for (const p of projects) {
    if (linkedNos.has(p.ProjectNo)) continue; // already part of a proposal thread
    const reps = reportsByProject.get(p.ProjectNo) ?? [];
    threads.push({
      key: `proj-${p.ProjectNo}`,
      title: p.ProjectName,
      divisionCode: p.DivisionCode,
      stage: isCompleted(p) ? 'Completed' : 'Execution',
      projectNo: p.ProjectNo,
      reportCount: reps.length,
      lastReport: reps.length ? reps[reps.length - 1].periodLabel : undefined,
    });
  }
  return threads;
}
