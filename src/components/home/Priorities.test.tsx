import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DoFirst, PrioritiesAsked } from './Priorities';
import { answerPushBack, markSeen, pushBack } from '../../lib/home/priorities';
import type { WorkPriority } from '../../lib/home/priorities';

vi.mock('../../lib/home/priorities', async (orig) => ({
  ...(await orig<typeof import('../../lib/home/priorities')>()),
  markSeen: vi.fn(async () => {}), markDone: vi.fn(async () => {}), pushBack: vi.fn(async () => {}),
  answerPushBack: vi.fn(async () => {}), withdraw: vi.fn(async () => {}), pinPriority: vi.fn(async () => {}),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../../contexts/DataContext', () => ({ useData: () => ({ staff: [{ ID: 'S1', Name: 'Dr. Mehta', user_id: 'boss' }] }) }));
const refreshPriorities = vi.fn();
let home: Record<string, unknown>;
vi.mock('../../contexts/HomeContext', () => ({ useHome: () => home }));

const NOW = new Date(2026, 10, 14, 9, 0);
const p = (id: string, over: Partial<WorkPriority> = {}): WorkPriority => ({
  id, assigneeUserId: 'me', askedBy: 'boss', title: `title ${id}`, reason: 'The committee meets Monday', wantedBy: '2026-11-20',
  link: null, status: 'OPEN', seenAt: null, pushbackReason: null, pushbackDate: null, pushbackAt: null, pushbackAnswer: null,
  doneAt: null, createdAt: '2026-11-10T00:00:00Z', ...over,
});
const strongButtons = () => screen.getAllByRole('button').filter(b => b.className.includes('gradient-brand'));
const view = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  home = { prioritiesForMe: [], prioritiesAsked: [], refreshPriorities };
});

describe('DoFirst', () => {
  it('is absent when nothing is pinned', () => {
    const { container } = view(<DoFirst now={NOW} />);
    expect(container.textContent).toBe('');
  });

  it('shows who asked and why, with exactly one strong button', () => {
    home = { ...home, prioritiesForMe: [p('a'), p('b', { seenAt: 'x' })] };
    view(<DoFirst now={NOW} />);
    expect(screen.getAllByText(/“The committee meets Monday” · Dr\. Mehta/, { selector: 'p' })).toHaveLength(2);
    expect(strongButtons()).toHaveLength(1);
    expect(strongButtons()[0].textContent).toBe('Seen it');
  });

  it('marks seen, and checks a new date before asking for it', async () => {
    home = { ...home, prioritiesForMe: [p('a')] };
    view(<DoFirst now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seen it' }));
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Cannot by then' }));
    fireEvent.change(screen.getByLabelText('Why not by then'), { target: { value: 'too short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask for this date' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 10 characters/);
    fireEvent.change(screen.getByLabelText('Why not by then'), { target: { value: 'Tests are not done yet' } });
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-11-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask for this date' }));
    await waitFor(() => expect(pushBack).toHaveBeenCalledWith('a', 'Tests are not done yet', '2026-11-25'));
  });
});

describe('PrioritiesAsked', () => {
  it('offers accept or keep when the person asked for a new date', async () => {
    home = { ...home, prioritiesAsked: [p('a', { assigneeUserId: 'x', askedBy: 'me', seenAt: 'x', pushbackAt: 'x', pushbackDate: '2026-11-25', pushbackReason: 'Tests are not done' })] };
    view(<PrioritiesAsked />);
    expect(screen.getByText('asks for 2026-11-25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept new date' }));
    await waitFor(() => expect(answerPushBack).toHaveBeenCalledWith('a', true));
    expect(refreshPriorities).toHaveBeenCalled();
  });
});
