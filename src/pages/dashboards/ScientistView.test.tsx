import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScientistView } from './ScientistView';
import type { MyAction } from '../../lib/dashboard/myActions';

vi.mock('../../lib/home/api', () => ({
  milestonesFor: vi.fn(async () => []),
}));

const staffRow = { ID: 'S1', Name: 'Dr. Rao', Designation: 'Principal Scientist', Division: 'AMD' };
let home: Record<string, unknown>;
const claimed = vi.fn();
vi.mock('../../contexts/HomeContext', () => ({ useHome: () => home, useClaim: (keys: string[]) => claimed(keys) }));

let data: Record<string, unknown>;
vi.mock('../../contexts/DataContext', () => ({ useData: () => data }));

const act = (id: string, kind: MyAction['kind'], due: string | null): MyAction =>
  ({ id, kind, due, label: `label-${id}`, detail: `detail-${id}`, link: `/x/${id}` });

function renderView() {
  render(<MemoryRouter><ScientistView /></MemoryRouter>);
}

describe('ScientistView', () => {
  beforeEach(() => {
    data = {
      projects: [{ ProjectID: 'P1', ProjectNo: 'HCP0054', ProjectName: 'Al-foam crash box', ProjectStatus: 'Ongoing', piStaffId: 'S1' }],
      projectStaff: [], phDStudents: [], meetings: [], committeeMembers: [], actionItems: [], calendarEvents: [], holidays: [],
    };
    home = {
      staffId: 'S1', ownStaff: staffRow, staffResolved: true, doneCount: 1,
      actions: [act('report', 'progress-report', '2020-01-01'), act('notice', 'contract-end', null)],
    };
  });

  it('greets by name and shows exactly one next item with one strong button', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Dr\. Rao\. Two things are left\. One is overdue\./);
    expect(screen.getByText('Do this next')).toBeInTheDocument();
    expect(screen.getByText('label-report')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
  });

  it('puts two-minute items under quick wins and counts done items on the ring', () => {
    renderView();
    expect(screen.getByText('label-notice')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 of 3 done today' })).toBeInTheDocument();
  });

  it('lists the projects the scientist leads, matched by staff ID', () => {
    renderView();
    expect(screen.getByText('Al-foam crash box')).toBeInTheDocument();
    expect(screen.getByText('HCP0054')).toBeInTheDocument();
  });

  it('tells the common desk which items it shows', () => {
    renderView();
    expect(claimed).toHaveBeenLastCalledWith(['action:report', 'action:notice']);
  });

  it('shows a timer for each report owed, with days left', () => {
    const due = new Date(Date.now() + 6 * 86400000);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    home = { ...home, actions: [{ id: 'slot-1', kind: 'project-review', due: iso, label: 'Progress report due — HCP0054', detail: '', link: '/reports/new' }] };
    renderView();
    expect(screen.getByText('Report timers · days left')).toBeInTheDocument();
    expect(screen.getByText(`due ${iso}`)).toBeInTheDocument();
  });

  it('says plainly when an office block is not connected', () => {
    renderView();
    expect(screen.getByText(/Not connected yet/)).toBeInTheDocument();
  });

  it('gives a plain sentence, not an error, when no staff row is linked', () => {
    home = { staffId: null, ownStaff: null, staffResolved: true, doneCount: 0, actions: [] };
    renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Nothing is waiting on you\./);
    expect(screen.getByText(/not linked to a staff record/)).toBeInTheDocument();
    expect(screen.queryByText('Do this next')).not.toBeInTheDocument();
    expect(screen.queryByText('Al-foam crash box')).not.toBeInTheDocument();
  });
});
