import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyMeetings } from './Meetings';
import { busyDuring, callMeeting, cancelMeeting, loadMyMeetings, replyMeeting, toInstants } from '../../lib/home/meetings';

vi.mock('../../lib/home/meetings', async (orig) => ({
  ...(await orig<typeof import('../../lib/home/meetings')>()),
  loadMyMeetings: vi.fn(), callMeeting: vi.fn(async () => 'm1'), replyMeeting: vi.fn(async () => {}),
  cancelMeeting: vi.fn(async () => {}), busyDuring: vi.fn(async () => new Set(['u2'])),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({ staff: [{ ID: 'S2', Name: 'Asha Rao', user_id: 'u2' }, { ID: 'S3', Name: 'Bina Sen', user_id: 'u3' }, { ID: 'S9', Name: 'No Login', user_id: null }] }),
}));

const meeting = (over = {}) => ({
  id: 'g1', title: 'Team review', organiser: 'boss', startsAt: '2099-03-02T05:00:00Z', endsAt: '2099-03-02T06:00:00Z',
  place: 'Room 12', link: null, agenda: '', myReply: null, invitees: 3, yes: 1, ...over,
});

beforeEach(() => { vi.clearAllMocks(); });

describe('toInstants', () => {
  it('needs the end after the start', () => {
    expect(toInstants('2099-03-02', '10:00', '09:00')).toBeNull();
    expect(toInstants('2099-03-02', '10:00', '11:00')).not.toBeNull();
  });
});

describe('MyMeetings', () => {
  it('lets an invitee reply in place', async () => {
    vi.mocked(loadMyMeetings).mockResolvedValue([meeting()]);
    render(<MyMeetings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(replyMeeting).toHaveBeenCalledWith('g1', 'YES'));
  });

  it('asks the organiser before cancelling', async () => {
    vi.mocked(loadMyMeetings).mockResolvedValue([meeting({ organiser: 'me', myReply: undefined })]);
    render(<MyMeetings />);
    expect(await screen.findByText((_, el) => el?.tagName === 'P' && /1 of 3 said yes/.test(el.textContent ?? ''))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelMeeting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    await waitFor(() => expect(cancelMeeting).toHaveBeenCalledWith('g1'));
  });

  it('shows who is busy, lists only people with a login, and sends the invitation', async () => {
    vi.mocked(loadMyMeetings).mockResolvedValue([]);
    render(<MyMeetings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Call a meeting' }));
    expect(screen.queryByText('No Login')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Results of batch 4'), { target: { value: 'Batch 4' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Asha Rao/ }));
    await waitFor(() => expect(busyDuring).toHaveBeenCalled());
    expect(await screen.findByText('busy then', { selector: 'span.text-xs' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send the invitation' }));
    await waitFor(() => expect(callMeeting).toHaveBeenCalledWith(expect.objectContaining({ title: 'Batch 4', invitees: ['u2'] })));
  });
});
