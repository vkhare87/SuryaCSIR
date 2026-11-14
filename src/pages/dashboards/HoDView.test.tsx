import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HoDView } from './HoDView';
import type { MyAction } from '../../lib/dashboard/myActions';

vi.mock('../../components/home/Priorities', () => ({ DoFirst: () => null, PinButton: () => null, PrioritiesAsked: () => null }));
vi.mock('../../lib/home/api', () => ({ milestonesFor: vi.fn(async () => []) }));
vi.mock('../../lib/people/api', () => ({ loadWorkload: vi.fn(async () => []) }));
vi.mock('../../lib/people/useDivisionStrength', () => ({
  useDivisionStrength: () => ({ byDivision: new Map([['AMD', { division_code: 'AMD', sanctioned: 10, filled: 8, vacant: 2 }]]) }),
}));
vi.mock('../../components/dashboard/ProjectFinanceSection', () => ({ ProjectFinanceSection: () => null }));
vi.mock('../../components/dashboard/ResearchSection', () => ({ ResearchSection: () => null }));
vi.mock('../../components/dashboard/EquipmentOpsSection', () => ({ EquipmentOpsSection: () => null }));
vi.mock('./ScientistView', () => ({ ScientistView: () => <div>scientist view</div> }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ divisionCode: 'AMD' }) }));

const claim = vi.fn();
let home: Record<string, unknown>;
vi.mock('../../contexts/HomeContext', () => ({ useHome: () => home }));
let data: Record<string, unknown>;
vi.mock('../../contexts/DataContext', () => ({ useData: () => data }));

const act = (id: string, due: string | null): MyAction =>
  ({ id, kind: 'progress-report', due, label: `label-${id}`, detail: '', link: `/x/${id}` });
const project = (id: string, division: string, end: string) => ({
  ProjectID: id, ProjectNo: id, ProjectName: `Project ${id}`, ProjectStatus: 'Ongoing', stage: 'ACTIVE',
  DivisionCode: division, StartDate: '2020-01-01', CompletioDate: end, SanctionedCost: '100', UtilizedAmount: '95',
});

function renderView() {
  render(<MemoryRouter><HoDView /></MemoryRouter>);
}

describe('HoDView', () => {
  beforeEach(() => {
    localStorage.clear();
    claim.mockClear();
    data = {
      staff: [{ ID: 'S1', Name: 'Dr. Mehta', Division: 'AMD', DOB: '1980-01-01' }, { ID: 'S2', Name: 'Other', Division: 'CMD', DOB: '1980-01-01' }],
      projects: [project('LATE', 'AMD', '2020-06-01'), project('FINE', 'AMD', '2099-01-01'), project('ELSE', 'CMD', '2020-06-01')],
      projectStaff: [], equipment: [],
    };
    home = { prioritiesForMe: [],
      ownStaff: { ID: 'S1', Name: 'Dr. Mehta' }, doneCount: 0, claim,
      actions: [act('a1', '2020-01-01'), act('a2', null)],
    };
  });

  it('shows the division only: its staff count, its running projects', () => {
    renderView();
    expect(screen.getByText(/Division AMD/).textContent).toMatch(/Division AMD · 1 staff · 2 running projects/);
    expect(screen.queryByText('Project ELSE')).not.toBeInTheDocument();
  });

  it('lists only the projects that need the head, and counts the rest', () => {
    renderView();
    expect(screen.getByText('Project LATE')).toBeInTheDocument();
    expect(screen.queryByText('Project FINE')).not.toBeInTheDocument();
    expect(screen.getByText(/on course/).textContent).toMatch(/1 project is on course/);
  });

  it('shows one line when no project needs the head', () => {
    data = { ...data, projects: [project('FINE', 'AMD', '2099-01-01'), project('FINE2', 'AMD', '2099-01-01')] };
    renderView();
    expect(screen.getByText(/on course/).textContent).toMatch(/2 projects are on course/);
  });

  it('has one strong button, on the first item that waits', () => {
    renderView();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
    expect(claim).toHaveBeenLastCalledWith(['action:a1', 'action:a2']);
  });

  it('reads posts from the post register and says what is not connected', () => {
    renderView();
    expect(screen.getByText(/of/, { selector: 'span.text-xs' }).textContent).toMatch(/8 of 10 filled · 2 vacant/);
    expect(screen.getAllByText(/Not connected yet/)).toHaveLength(3);
  });

  it('switches to the head\'s own work and remembers it', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'My own work' }));
    expect(screen.getByText('scientist view')).toBeInTheDocument();
    expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument();
    expect(localStorage.getItem('surya_home_head_view')).toBe('own');
  });
});
