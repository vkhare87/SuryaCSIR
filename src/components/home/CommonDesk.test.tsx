import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommonDesk } from './CommonDesk';
import { ScientistView } from '../../pages/dashboards/ScientistView';

const mockState = {
  user: { id: 'u-sci', email: 'rao@ampri.res.in', roles: ['Scientist'], activeRole: 'Scientist' },
  staff: [
    {
      ID: 'ST-RAO', Name: 'Dr. A. Rao', Division: 'MSE', Email: 'rao@ampri.res.in',
      Designation: 'Principal Scientist', user_id: 'u-sci',
    },
  ],
  tickets: [
    { id: 't1', subject: 'AC Repair', submitted_by: 'u-sci', assigned_to: null, status: 'Open' },
  ],
  contributionRequests: [],
  calendarEvents: [],
  holidays: [],
  meetings: [],
  committeeMembers: [],
  actionItems: [],
  projects: [],
  projectStaff: [],
  phDStudents: [],
  proposals: [],
  home: {
    ownStaff: null as unknown,
    ownStaffId: 'ST-RAO',
    todayIso: '2026-11-22',
    actions: [],
    rankedActions: [],
    doNext: null as unknown,
    quickWins: [] as unknown[],
    groupCounts: { research: 0, admin: 0, committee: 0 },
    todayProgress: { done: 0, total: 1, pending: 1, pct: 0 },
    greeting: 'Good morning, Dr. A. Rao. 1 thing is left today.',
    snoozeTomorrow: vi.fn(),
    markDoneToday: vi.fn(),
    claimedKeys: new Set<string>(),
    registerClaimedKeys: vi.fn(),
    commonDeskCollapsed: false,
    toggleCommonDesk: vi.fn(),
    coPiProposalIds: new Set<string>(),
    milestonesByProject: {},
    reportTimers: [],
    myDayItems: [],
    myRequestsItems: [],
    requestCatalog: [],
  },
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockState.user, activeRole: 'Scientist' }),
}));
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({
    staff: mockState.staff,
    tickets: mockState.tickets,
    contributionRequests: mockState.contributionRequests,
    calendarEvents: mockState.calendarEvents,
    holidays: mockState.holidays,
    meetings: mockState.meetings,
    committeeMembers: mockState.committeeMembers,
    actionItems: mockState.actionItems,
    projects: mockState.projects,
    projectStaff: mockState.projectStaff,
    phDStudents: mockState.phDStudents,
  }),
}));
vi.mock('../../contexts/ProposalsContext', () => ({
  useProposals: () => ({ proposals: mockState.proposals }),
}));
vi.mock('../../contexts/HomeContext', () => ({
  useHome: () => mockState.home,
}));

describe('CommonDesk (CD0)', () => {
  beforeEach(() => {
    mockState.home.claimedKeys = new Set();
    mockState.home.rankedActions = [];
    mockState.home.commonDeskCollapsed = false;
  });

  it('renders the four always-blocks and omits empty conditional blocks from the DOM', () => {
    render(<MemoryRouter><CommonDesk /></MemoryRouter>);
    expect(screen.getByRole('region', { name: 'My day' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'My requests' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Notices' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'People' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Waiting on me' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'My committees' })).toBeNull();
  });

  it('omits claimed items from right-column blocks (One item, one place)', () => {
    mockState.home.claimedKeys = new Set(['ticket-t1', 'act-1']);
    mockState.home.rankedActions = [
      { id: 'act-1', kind: 'ticket', label: 'Claimed item', detail: '', due: null, link: '/work', group: 'admin', minutes: 5, quickWin: false, consequence: '' },
      { id: 'act-2', kind: 'ticket', label: 'Unclaimed item', detail: '', due: '2026-11-25', link: '/work', group: 'admin', minutes: 5, quickWin: false, consequence: '' },
    ] as never[];

    render(<MemoryRouter><CommonDesk /></MemoryRouter>);
    expect(screen.getByText('+1 on the left.')).toBeTruthy();
    expect(screen.queryByText('Claimed item')).toBeNull();
    expect(screen.getByText('Unclaimed item')).toBeTruthy();
  });
});

describe('ScientistView (SH1)', () => {
  it('renders unlinked fallback sentence without error and triggers markDoneToday on quick win', () => {
    mockState.home.ownStaff = null;
    mockState.home.greeting = 'Good morning. Your login is not linked to a staff record yet — ask an administrator to link it under People Links.';
    mockState.home.doNext = {
      id: 'pr-1', kind: 'progress-report', label: 'Send progress report GAP-01',
      detail: 'Q3 due', due: '2026-11-28', link: '/reports/new',
      group: 'research', minutes: 15, quickWin: false, consequence: 'At 7 days overdue, the HoD is notified.',
    };
    mockState.home.quickWins = [
      { id: 'qw-1', kind: 'action-item', label: 'Confirm lab checklist', detail: '', due: null, link: '/committees', group: 'committee', minutes: 2, quickWin: true, consequence: '' },
    ];

    render(<MemoryRouter><ScientistView /></MemoryRouter>);
    expect(screen.getByText(/not linked to a staff record/)).toBeTruthy();
    expect(screen.getByText('Send progress report GAP-01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Confirm lab checklist done today' }));
    expect(mockState.home.markDoneToday).toHaveBeenCalledWith('qw-1');
  });
});
