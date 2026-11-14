import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DirectorView } from './DirectorView';
import type { MyAction } from '../../lib/dashboard/myActions';

vi.mock('../../components/home/Delegation', () => ({ DelegationDial: () => null }));
vi.mock('../../components/home/Priorities', () => ({ DoFirst: () => null, PinButton: () => null, PrioritiesAsked: () => null }));
vi.mock('../../lib/home/api', () => ({ milestonesFor: vi.fn(async () => []) }));
vi.mock('../../lib/people/useDivisionStrength', () => ({
  useDivisionStrength: () => ({
    rows: [{ division_code: 'AMD', sanctioned: 10, filled: 10, vacant: 0 }, { division_code: 'CMD', sanctioned: 8, filled: 6, vacant: 2 }],
    totals: { sanctioned: 18, filled: 16, vacant: 2 },
  }),
}));
vi.mock('../../hooks/useDirectorThresholds', () => ({ useDirectorThresholds: () => ({ thresholds: {} }) }));
vi.mock('../../components/dashboard/AttentionStrip', () => ({ AttentionStrip: () => null }));
vi.mock('../../components/dashboard/ProjectFinanceSection', () => ({ ProjectFinanceSection: () => null }));
vi.mock('../../components/dashboard/ResearchSection', () => ({ ResearchSection: () => null }));
vi.mock('../../components/dashboard/EquipmentOpsSection', () => ({ EquipmentOpsSection: () => null }));

const claimed = vi.fn();
let home: Record<string, unknown>;
vi.mock('../../contexts/HomeContext', () => ({ useHome: () => home, useClaim: (keys: string[]) => claimed(keys) }));
let data: Record<string, unknown>;
vi.mock('../../contexts/DataContext', () => ({ useData: () => data }));

const act = (id: string): MyAction => ({ id, kind: 'proposal', due: null, label: `label-${id}`, detail: '', link: `/x/${id}` });
const project = (id: string, division: string, end: string) => ({
  ProjectID: id, ProjectNo: id, ProjectName: `Project ${id}`, ProjectStatus: 'Ongoing', stage: 'ACTIVE',
  DivisionCode: division, StartDate: '2020-01-01', CompletioDate: end, SanctionedCost: '100', UtilizedAmount: '95',
});

function renderView() {
  render(<MemoryRouter><DirectorView /></MemoryRouter>);
}

describe('DirectorView', () => {
  beforeEach(() => {
    data = {
      projects: [project('p1', 'AMD', '2020-06-01'), project('p2', 'AMD', '2099-01-01'), project('p3', 'GBMD', '2099-01-01')],
      divisions: [{ divCode: 'AMD', divName: 'Advanced Materials' }, { divCode: 'CMD', divName: 'Composites' }, { divCode: 'GBMD', divName: 'Green Building' }],
      equipment: [{ UInsID: 'E1', Name: 'SEM', WorkingStatus: 'Not Working' }, { UInsID: 'E2', Name: 'XRD', WorkingStatus: 'Working' }],
      meetings: [], committeeMembers: [],
    };
    home = { prioritiesForMe: [], staffId: 'S1', ownStaff: { ID: 'S1', Name: 'Dr. Srivastava' }, doneCount: 0, actions: [act('a1'), act('a2')] };
  });

  it('greets with the institute in one line and has one strong button', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Dr\. Srivastava\. Two things are left\./);
    expect(screen.getByText(/CSIR-AMPRI/).textContent).toMatch(/3 divisions · 3 running projects/);
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
  });

  it('lists only divisions that need the Director, and counts the rest', () => {
    renderView();
    expect(screen.getByText('Advanced Materials')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 projects')).toBeInTheDocument();
    expect(screen.getByText('Composites')).toBeInTheDocument();
    expect(screen.getAllByText('2 vacant')).toHaveLength(2); // the division badge and the posts figure
    expect(screen.queryByText('Green Building')).not.toBeInTheDocument();
    expect(screen.getByText(/on course/).textContent).toMatch(/1 division is on course/);
  });

  it('shows figures that come from records, each as a link to its list', () => {
    renderView();
    expect(screen.getByRole('link', { name: /Posts filled/ }).textContent).toMatch(/16 \/ 18.*2 vacant/);
    expect(screen.getByRole('link', { name: /Instruments down/ })).toHaveAttribute('href', '/facilities');
    expect(screen.getByRole('link', { name: /Instruments down/ }).textContent).toMatch(/1.*of 2/);
  });

  it('names every block that is not connected, with no made-up value', () => {
    renderView();
    expect(screen.getByText('Fund status by head')).toBeInTheDocument();
    expect(screen.queryByText(/crore/)).not.toBeInTheDocument();
  });

  it('claims the rows it shows', () => {
    renderView();
    expect(claimed).toHaveBeenLastCalledWith(['action:a1', 'action:a2']);
  });
});
