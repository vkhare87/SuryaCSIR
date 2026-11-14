import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoticesBlock } from './Notices';
import { loadNotices, markNoticeRead, orderNotices } from '../../lib/home/notices';
import type { Notice } from '../../lib/home/notices';

vi.mock('../../lib/home/notices', async (orig) => ({
  ...(await orig<typeof import('../../lib/home/notices')>()),
  loadNotices: vi.fn(), markNoticeRead: vi.fn(async () => {}), noticeReadCounts: vi.fn(async () => ({ readers: 4, read: 2, acked: 1, notAcked: ['Bina Sen'] })),
}));
let roles = ['Scientist'];
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', roles }, divisionCode: 'D1' }) }));

const n = (id: string, over: Partial<Notice> = {}): Notice => ({
  id, noticeNo: `OO/2026/${id}`, kind: 'OFFICE_ORDER', title: `title ${id}`, body: `body ${id}`, issuedBy: 'dir', issuedOn: '2026-11-10',
  divisions: null, mustAck: false, ackBy: null, readAt: null, ackedAt: null, ...over,
});

beforeEach(() => { vi.clearAllMocks(); roles = ['Scientist']; });

describe('orderNotices', () => {
  it('puts orders to acknowledge first, then unread, then read, then my own', () => {
    const out = orderNotices([
      n('read', { readAt: 'x', issuedOn: '2026-11-12' }), n('mine', { issuedBy: 'me' }),
      n('unread'), n('ack', { mustAck: true, readAt: 'x' }),
    ], 'me');
    expect(out.map(x => x.id)).toEqual(['ack', 'unread', 'read', 'mine']);
  });
});

describe('NoticesBlock', () => {
  it('marks a notice read when opened and acknowledges an order on request', async () => {
    vi.mocked(loadNotices).mockResolvedValue([n('1', { mustAck: true, ackBy: '2026-11-20' })]);
    render(<NoticesBlock />);
    expect(await screen.findByText('read and acknowledge by 2026-11-20')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /title 1/ }));
    await waitFor(() => expect(markNoticeRead).toHaveBeenCalledWith('1', false));
    fireEvent.click(screen.getByRole('button', { name: 'I have read it' }));
    await waitFor(() => expect(markNoticeRead).toHaveBeenCalledWith('1', true));
  });

  it('shows the issuer who has not acknowledged; only issuers see the issue button', async () => {
    vi.mocked(loadNotices).mockResolvedValue([n('1', { issuedBy: 'me', mustAck: true })]);
    render(<NoticesBlock />);
    expect(screen.queryByRole('button', { name: 'Issue a notice' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /title 1/ }));
    expect(await screen.findByText(/not yet acknowledged: Bina Sen/)).toBeTruthy();
    expect(markNoticeRead).not.toHaveBeenCalled();
  });

  it('says so when no notice is in force', async () => {
    roles = ['HOD'];
    vi.mocked(loadNotices).mockResolvedValue([]);
    render(<NoticesBlock />);
    expect(await screen.findByText('No notice is in force.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Issue a notice' })).toBeTruthy();
  });
});
