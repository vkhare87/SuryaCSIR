import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyWork from './MyWork';
import { actOnContributionRequest } from '../lib/contributions/api';
import { updateEntityRecord } from '../lib/data/entityWrite';
import type { ContributionRequest, Role } from '../types';

vi.mock('../lib/contributions/api', () => ({
  actOnContributionRequest: vi.fn(async () => ({ ok: true })),
  listRequestEvents: vi.fn(async () => []),
}));
vi.mock('../lib/data/entityWrite', () => ({
  updateEntityRecord: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../components/ui/UserPicker', () => ({ UserPicker: () => <div>picker</div> }));
const push = vi.fn();
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push }) }));

let roles: Role[] = ['Scientist'];
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', roles, activeRole: roles[0] } }),
}));

const base: ContributionRequest = {
  id: 'r1', domain: 'equipment', recordRef: 'UI-1', divisionCode: 'IMD',
  title: 'Confirm SEM status', reason: 'Status looks stale', link: '/facilities/UI-1',
  requestedBy: 'u9', assigneeId: 'u1', delegateId: null, status: 'open', dueDate: null,
  prefill: { WorkingStatus: 'Working', amc_end_date: null }, response: null,
  createdAt: '2026-10-30T00:00:00Z', resolvedAt: null,
};
let requests: ContributionRequest[] = [];
const refreshContributions = vi.fn(async () => {});
vi.mock('../contexts/DataContext', () => ({
  useData: () => ({ contributionRequests: requests, dataStewards: [], staff: [], refreshContributions }),
}));

function renderAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><MyWork /></MemoryRouter>);
}

describe('MyWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roles = ['Scientist'];
    requests = [
      base,
      { ...base, id: 'r2', title: 'Someone else', assigneeId: 'u7', requestedBy: 'u8' },
      {
        ...base, id: 'r4', title: 'Review SEM update', requestedBy: 'u1', assigneeId: 'u7',
        status: 'submitted', response: { WorkingStatus: 'Down' },
      },
    ];
  });

  it('shows only To do items for an assignee and opens ?r=<id>', () => {
    renderAt('/work?r=r1');
    expect(screen.getAllByText('Confirm SEM status').length).toBeGreaterThan(0);
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
    expect(screen.queryByText('Review SEM update')).not.toBeInTheDocument();
    expect(screen.getByText('Status looks stale')).toBeInTheDocument();
  });

  it('submit sends only changed fields as response', async () => {
    renderAt('/work?r=r1');
    fireEvent.change(screen.getByLabelText('New Working Status'), { target: { value: 'Down' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }));
    await waitFor(() => expect(actOnContributionRequest).toHaveBeenCalledWith(
      'r1', 'submit', { response: { WorkingStatus: 'Down' } }));
    expect(refreshContributions).toHaveBeenCalled();
  });

  it('accept writes the record then resolves the request', async () => {
    renderAt('/work?r=r4');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(actOnContributionRequest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(actOnContributionRequest).mock.calls[0].slice(0, 2)).toEqual(['r4', 'accept']);
    expect(updateEntityRecord).toHaveBeenCalledWith('equipment', 'UI-1', { WorkingStatus: 'Down' });
    expect(vi.mocked(updateEntityRecord).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(actOnContributionRequest).mock.invocationCallOrder[0]);
  });

  it('accept does not resolve when the record write fails', async () => {
    vi.mocked(updateEntityRecord).mockResolvedValueOnce({ ok: false, error: 'permission denied' });
    renderAt('/work?r=r4');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText(/permission denied/)).toBeInTheDocument();
    expect(actOnContributionRequest).not.toHaveBeenCalled();
  });

  it('hides the Unowned tab for a plain scientist', () => {
    renderAt('/work');
    expect(screen.queryByRole('tab', { name: /unowned/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /to do/i })).toBeInTheDocument();
  });

  it('requires a note before asking for clarification', async () => {
    renderAt('/work?r=r1');
    fireEvent.click(screen.getByRole('button', { name: 'Ask for clarification' }));
    expect(await screen.findByText('A note is required')).toBeInTheDocument();
    expect(actOnContributionRequest).not.toHaveBeenCalled();
  });

  it('shows not-found for an unknown id', () => {
    renderAt('/work?r=nope');
    expect(screen.getByText('Request not found or not shared with you')).toBeInTheDocument();
  });
});
