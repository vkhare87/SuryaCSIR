import type { ProjectInfo, ProjectStage } from '../../types';

export type { ProjectStage };

export const PROJECT_STAGES: ProjectStage[] = [
  'SANCTIONED', 'ACTIVE', 'ON_HOLD', 'CLOSING', 'CLOSED', 'ARCHIVED', 'FORECLOSED',
];

// Mirrors project_stage_label() / project_stage_of_status() in
// supabase/migrations/20261110000002_project_lifecycle_foundations.sql —
// change both together.
export const STAGE_LABELS: Record<ProjectStage, string> = {
  SANCTIONED: 'Sanctioned',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  CLOSING: 'Closing',
  CLOSED: 'Completed',
  ARCHIVED: 'Archived',
  FORECLOSED: 'Foreclosed',
};

const STATUS_TO_STAGE: Record<string, ProjectStage> = {
  active: 'ACTIVE', ongoing: 'ACTIVE', 'on-going': 'ACTIVE', 'on going': 'ACTIVE',
  running: 'ACTIVE', 'in progress': 'ACTIVE',
  sanctioned: 'SANCTIONED', approved: 'SANCTIONED',
  'on hold': 'ON_HOLD', 'on-hold': 'ON_HOLD', hold: 'ON_HOLD',
  closing: 'CLOSING',
  completed: 'CLOSED', complete: 'CLOSED', closed: 'CLOSED',
  archived: 'ARCHIVED',
  foreclosed: 'FORECLOSED', terminated: 'FORECLOSED',
};

type Staged = Pick<ProjectInfo, 'ProjectStatus' | 'stage'>;

/** Stage for a free-text status as the Excel importer or an older form wrote it; null if unrecognised. */
export function stageOfStatus(status: string | null | undefined): ProjectStage | null {
  return STATUS_TO_STAGE[(status ?? '').trim().toLowerCase()] ?? null;
}

/** The project's stage: the stored one when the database has it, else read from the status text. */
export function projectStage(p: Staged): ProjectStage | null {
  return p.stage ?? stageOfStatus(p.ProjectStatus);
}

/** What to show for a project's status: the stage label, or the text as entered when it maps to no stage. */
export function projectStatusLabel(p: Staged): string {
  const stage = projectStage(p);
  return stage ? STAGE_LABELS[stage] : (p.ProjectStatus ?? '').trim();
}

/** Running now. "Ongoing" and "Active" are the same thing. */
export function isActiveProject(p: Staged): boolean {
  return projectStage(p) === 'ACTIVE';
}

/** Finished or stopped for good: completed, archived or foreclosed. */
export function isFinishedProject(p: Staged): boolean {
  const stage = projectStage(p);
  return stage === 'CLOSED' || stage === 'ARCHIVED' || stage === 'FORECLOSED';
}

/** Completed normally (not foreclosed). */
export function isCompletedProject(p: Staged): boolean {
  const stage = projectStage(p);
  return stage === 'CLOSED' || stage === 'ARCHIVED';
}
