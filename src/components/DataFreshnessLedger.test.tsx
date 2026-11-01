import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataFreshnessLedger } from './DataFreshnessLedger';
import { removeDataSteward } from '../lib/contributions/api';

vi.mock('../lib/contributions/api', () => ({
  setDataSteward: vi.fn(async () => ({ ok: true })),
  removeDataSteward: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./ui/UserPicker', () => ({ UserPicker: () => <div>picker</div> }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', roles: ['SystemAdmin'] } }) }));
const refreshContributions = vi.fn(async () => {});
vi.mock('../contexts/DataContext', () => ({
  useData: () => ({
    importEvents: [], contributionRequests: [], refreshContributions,
    staff: [{ user_id: 'u1', Name: 'Asha' }],
    dataStewards: [{ id: 's1', domain: 'equipment', divisionCode: null, userId: 'u1', kind: 'steward', cadenceDays: 90 }],
  }),
}));

describe('DataFreshnessLedger', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks before removing an owner', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<MemoryRouter><DataFreshnessLedger /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: 'Remove Asha as owner' });
    fireEvent.click(btn);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(removeDataSteward).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(removeDataSteward).toHaveBeenCalledWith('s1'));
  });
});
