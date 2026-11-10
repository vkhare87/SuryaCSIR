import { describe, it, expect } from 'vitest';
import {
  isActiveProject, isCompletedProject, isFinishedProject, projectStage, projectStatusLabel, stageOfStatus,
} from './stage';

const p = (ProjectStatus: string, stage?: 'ACTIVE' | 'CLOSED' | 'FORECLOSED' | null) => ({ ProjectStatus, stage });

describe('project stage', () => {
  it('reads "Ongoing" and "Active" as the same stage, whatever the casing', () => {
    for (const s of ['Active', 'Ongoing', ' ongoing ', 'ON-GOING', 'Running']) {
      expect(isActiveProject(p(s)), s).toBe(true);
    }
    expect(isActiveProject(p('Completed'))).toBe(false);
  });

  it('prefers the stored stage over the status text', () => {
    expect(projectStage(p('Ongoing', 'CLOSED'))).toBe('CLOSED');
    expect(projectStage(p('Ongoing', null))).toBe('ACTIVE');
  });

  it('labels a known stage and passes an unknown status through as entered', () => {
    expect(projectStatusLabel(p('Ongoing'))).toBe('Active');
    expect(projectStatusLabel(p('closed'))).toBe('Completed');
    expect(projectStatusLabel(p(' Submitted '))).toBe('Submitted');
    expect(stageOfStatus('Submitted')).toBeNull();
    expect(stageOfStatus(undefined)).toBeNull();
  });

  it('separates completed from foreclosed, and counts both as finished', () => {
    expect(isCompletedProject(p('Completed'))).toBe(true);
    expect(isCompletedProject(p('', 'FORECLOSED'))).toBe(false);
    expect(isFinishedProject(p('', 'FORECLOSED'))).toBe(true);
    expect(isFinishedProject(p('On Hold'))).toBe(false);
  });
});
