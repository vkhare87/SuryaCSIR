import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudentView } from './StudentView';
import { ProjectStaffView } from './ProjectStaffView';
import { TechnicianView } from './TechnicianView';
import type { MyProjectStaffRecord } from '../../lib/home/people';

let record: MyProjectStaffRecord | null = null;
vi.mock('../../components/home/Priorities', () => ({ DoFirst: () => null, PinButton: () => null, PrioritiesAsked: () => null }));
vi.mock('../../lib/home/people', async (orig) => ({
  ...(await orig<typeof import('../../lib/home/people')>()),
  myProjectStaffRecord: vi.fn(async () => record),
}));
vi.mock('../../contexts/RulesContext', () => ({
  useRules: () => ({ rules: [
    { ruleKey: 'project_staff.tenure_cap_years', value: 6, effectiveFrom: '2025-04-25', effectiveTo: null },
    { ruleKey: 'project_staff.paid_leave_days_per_year', value: 12, effectiveFrom: '2025-04-25', effectiveTo: null },
  ] }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, divisionCode: 'AMD' }) }));
let home: Record<string, unknown>;
vi.mock('../../contexts/HomeContext', () => ({ useHome: () => home, useClaim: () => {} }));
let data: Record<string, unknown>;
vi.mock('../../contexts/DataContext', () => ({ useData: () => data }));

const view = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent ?? '';

beforeEach(() => {
  record = null;
  home = { prioritiesForMe: [], ownStaff: { ID: 'S9', Name: 'Ananya Sen', Designation: 'Technical Officer' }, actions: [], doneCount: 0 };
  data = {
    phDStudents: [], phdMilestones: [], scientificOutputs: [], projects: [{ ProjectID: 'P1', ProjectNo: 'HCP0054', ProjectName: 'Crash box' }],
    equipment: [],
  };
});

describe('StudentView', () => {
  it('says plainly when the PhD record is not linked', () => {
    view(<StudentView />);
    expect(h1()).toMatch(/Your PhD record is not linked to this account yet\./);
    expect(screen.queryByText('Road to the thesis')).not.toBeInTheDocument();
  });

  it('shows the road and names the next step', () => {
    data = {
      ...data,
      phDStudents: [{ EnrollmentNo: 'E1', StudentName: 'Ananya Sen', SupervisorName: 'Dr. Rao', Specialization: 'Foams', FellowshipDetails: 'CSIR SRF', ProjectNo: 'HCP0054' }],
      phdMilestones: [
        { id: '1', enrollmentNo: 'E1', milestone: 'Joining', completedDate: '2023-08-01' },
        { id: '2', enrollmentNo: 'E1', milestone: 'Coursework', completedDate: '2024-01-01' },
        { id: '3', enrollmentNo: 'E2', milestone: 'Comprehensive Exam', completedDate: '2024-01-01' },
      ],
    };
    view(<StudentView />);
    expect(h1()).toMatch(/You have passed two of eight steps\. Next is comprehensive exam\./);
    expect(screen.getByText('2 of 8')).toBeInTheDocument();
    expect(screen.getByText(/No other student's progress/)).toBeInTheDocument();
  });
});

describe('ProjectStaffView', () => {
  it('says plainly when the login is not linked to a project staff record', async () => {
    view(<ProjectStaffView />);
    await waitFor(() => expect(h1()).toMatch(/Your project staff record is not linked/));
  });

  it('shows both clocks and leave left by the rule', async () => {
    const to = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    record = {
      personId: 'p1', tenureDays: 1461,
      engagements: [{ id: 'e1', projectId: 'P1', positionCode: 'JRF', fromOn: '2024-01-01', toOn: to }],
      leave: [],
    };
    view(<ProjectStaffView />);
    await waitFor(() => expect(h1()).toMatch(/Your contract on HCP0054 runs to/));
    expect(screen.getByText(/limit 6 years/)).toBeInTheDocument();
    expect(screen.getByText(/4 y 0 m/)).toBeInTheDocument();
    expect(screen.getByText('12 of 12 left')).toBeInTheDocument();
    expect(screen.getByText(/Not connected yet\. Your last pay/)).toBeInTheDocument();
  });
});

describe('TechnicianView', () => {
  it('lists my instruments, down ones first, matched by owner or operator name', () => {
    data = {
      ...data,
      equipment: [
        { UInsID: 'A', Name: 'XRD', WorkingStatus: 'Working', owner_user_id: 'u1', OperatorName: '' },
        { UInsID: 'B', Name: 'SEM', WorkingStatus: 'Not Working', OperatorName: 'Ananya Sen' },
        { UInsID: 'C', Name: 'UTM', WorkingStatus: 'Working', OperatorName: 'Someone Else' },
      ],
    };
    view(<TechnicianView />);
    expect(h1()).toMatch(/Two instruments are yours\. One is down\./);
    const names = screen.getAllByRole('link').map(l => l.textContent).filter(t => /XRD|SEM|UTM/.test(t ?? ''));
    expect(names[0]).toMatch(/SEM/);
    expect(names.join()).not.toMatch(/UTM/);
  });

  it('says so when no instrument is in the person\'s charge', () => {
    view(<TechnicianView />);
    expect(h1()).toMatch(/No instrument is recorded in your charge yet\./);
  });
});
