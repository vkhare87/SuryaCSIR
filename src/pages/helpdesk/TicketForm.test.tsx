import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TicketForm from './TicketForm';

vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({ staff: [], divisions: [], helpdeskRouting: [], refreshData: vi.fn() }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/helpdesk/ticketRPCs', () => ({ createTicket: vi.fn() }));

const subjectAt = (url: string) => {
  render(<MemoryRouter initialEntries={[url]}><TicketForm /></MemoryRouter>);
  return (screen.getByRole('textbox', { name: /subject/i }) as HTMLInputElement).value;
};

describe('TicketForm prefill from the request door', () => {
  it('takes a subject start the door offers', () => {
    expect(subjectAt('/helpdesk/new?category=Administrative&subject=Leave%3A+')).toBe('Leave: ');
  });
  it('ignores any other subject text in the link', () => {
    expect(subjectAt('/helpdesk/new?subject=Pay+me+now%0Aurgent')).toBe('');
  });
});
