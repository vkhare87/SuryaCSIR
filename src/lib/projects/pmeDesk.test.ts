import { describe, it, expect } from 'vitest';
import { pmeDeskItems } from './pmeDesk';
import type { ProjectInfo } from '../../types';
import type { Proposal } from '../../types/proposal';

// Came through SURYA unless a test says otherwise, so the legacy row stays out of the way.
const project = (over: Partial<ProjectInfo>) => ({ ProjectStatus: 'Active', track: 'ULIP', proposalId: 'p', ...over }) as ProjectInfo;
const proposal = (status: Proposal['status'], track: string | null = 'ULIP') => ({ status, track }) as Proposal;

describe('pmeDeskItems', () => {
  it('is empty when nothing is waiting', () => {
    expect(pmeDeskItems([proposal('DRAFT'), proposal('LINKED')], [project({})])).toEqual([]);
  });

  it('counts what is waiting on PME and drops the rows at zero', () => {
    const items = pmeDeskItems(
      [proposal('SUBMITTED'), proposal('SUBMITTED'), proposal('OM_ISSUED'), proposal('UNDER_REVIEW')],
      [project({}), project({ ProjectStatus: 'Submitted' }), project({ ProjectStatus: 'Ongoing', track: null })],
    );
    expect(items.map(i => [i.key, i.count])).toEqual([
      ['vetting', 2], ['sanction', 1], ['no-stage', 1], ['no-track', 1],
    ]);
  });

  it('counts approved proposals as ready to sanction, and lists legacy ones without a track', () => {
    const items = pmeDeskItems([proposal('APPROVED'), proposal('UNDER_REVIEW', null)], []);
    expect(items.map(i => [i.key, i.count])).toEqual([
      ['unclassified', 1], ['sanction', 1],
    ]);
  });

  it('lists sanctioned projects awaiting money and milestones awaiting PME', () => {
    const items = pmeDeskItems([], [project({ stage: 'SANCTIONED' })], 3);
    expect(items.map(i => [i.key, i.count])).toEqual([['awaiting-funds', 1], ['milestones', 3]]);
  });

  it('totals what is overdue across the portfolio', () => {
    const items = pmeDeskItems([], [], 0, [{ overdue: 2, minutesOverdue: 0 }, { overdue: 1, minutesOverdue: 1 }]);
    expect(items.map(i => [i.key, i.count])).toEqual([['overdue', 3], ['minutes', 1]]);
  });

  it('counts change-request steps waiting on PME, linking straight to the one project when there is one', () => {
    const items = pmeDeskItems([], [], 0, [], [{ projectId: 'PRJ 1' }]);
    expect(items.map(i => [i.key, i.count, i.to])).toEqual([['changes', 1, '/projects/PRJ%201?tab=changes']]);
  });

  it('lists completion reports waiting on PME and closed projects to archive', () => {
    const items = pmeDeskItems([], [project({ stage: 'CLOSED' })], 0, [], [],
      [{ projectId: 'P9', item: 'step' }, { projectId: 'P8', item: 'due' }]);
    expect(items.map(i => [i.key, i.count])).toEqual([['closure', 1], ['archive', 1]]);
  });

  it('counts running legacy projects not yet brought in', () => {
    const items = pmeDeskItems([], [
      project({ proposalId: null }), project({ proposalId: null, legacyCompletedAt: '2026-11-12' }),
      project({ proposalId: null, stage: 'CLOSED' }),
    ]);
    expect(items.map(i => [i.key, i.count])).toEqual([['archive', 1], ['legacy', 1]]);
  });

  it('trusts a stored stage over the status text', () => {
    const items = pmeDeskItems([], [project({ ProjectStatus: 'whatever', stage: 'ACTIVE' })]);
    expect(items).toEqual([]);
  });

  it('shows the compliance counts that are not zero', () => {
    const items = pmeDeskItems([], [], 0, [], [], [], { declarationsMissing: 2, transfersMissingDocs: 0, logbooksIdle: 1 });
    expect(items.map(i => [i.key, i.count])).toEqual([['declarations', 2], ['logbooks', 1]]);
  });
});
