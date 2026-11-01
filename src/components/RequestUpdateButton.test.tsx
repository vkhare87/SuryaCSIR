import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequestUpdateButton } from './RequestUpdateButton';
import { FIELD_META } from '../utils/dataMigration';
import { createContributionRequest } from '../lib/contributions/api';

vi.mock('../lib/contributions/api', () => ({
  createContributionRequest: vi.fn(async () => ({ ok: true, id: 'r1' })),
}));
const refreshContributions = vi.fn(async () => {});
vi.mock('../contexts/DataContext', () => ({
  useData: () => ({ dataStewards: [], refreshContributions }),
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', roles: ['Scientist', 'HOD'], activeRole: 'Scientist' } }),
}));
const push = vi.fn();
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push }) }));
vi.mock('./ui/UserPicker', () => ({ UserPicker: () => <div>picker</div> }));

const record = { UInsID: 'UI-1', Name: 'SEM', Division: 'D01', extra: 'ignored' };

function renderButton() {
  render(
    <MemoryRouter initialEntries={['/facilities/UI-1']}>
      <RequestUpdateButton
        domain="equipment"
        recordRef="UI-1"
        divisionCode="D01"
        record={record}
        defaultTitle="Update SEM"
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /request update/i }));
}

describe('RequestUpdateButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks submit without a reason', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));
    expect(await screen.findByText('Reason is required')).toBeInTheDocument();
    expect(createContributionRequest).not.toHaveBeenCalled();
  });

  it('submits with the FIELD_META prefill and routes to the steward', async () => {
    renderButton();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'AMC lapsed' } });
    fireEvent.click(screen.getByRole('button', { name: /send request/i }));
    await waitFor(() => expect(createContributionRequest).toHaveBeenCalledTimes(1));
    const input = vi.mocked(createContributionRequest).mock.calls[0][0];
    expect(input).toMatchObject({
      domain: 'equipment', recordRef: 'UI-1', divisionCode: 'D01', title: 'Update SEM',
      reason: 'AMC lapsed', link: '/facilities/UI-1', dueDate: null, assigneeId: null,
    });
    expect(Object.keys(input.prefill).sort()).toEqual(FIELD_META.equipment.map(f => f.column).sort());
    expect(input.prefill.Name).toBe('SEM');
    await waitFor(() => expect(push).toHaveBeenCalledWith('Request sent', 'success'));
    expect(refreshContributions).toHaveBeenCalled();
  });
});
