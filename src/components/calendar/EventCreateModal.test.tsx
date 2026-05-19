import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventCreateModal } from './EventCreateModal';
import type { DivisionInfo } from '../../types';

const divisions: DivisionInfo[] = [
  {
    divCode: 'D01',
    divName: 'Materials',
    divDescription: '',
    divResearchAreas: '',
    divHoD: '',
    divHoDID: '',
    divSanctionedstrength: 0,
    divCurrentStrength: 0,
    divStatus: 'Active',
  },
];

const noop = () => {};

describe('EventCreateModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders when open', () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    expect(screen.getByText(/New Event/i)).toBeInTheDocument();
  });

  it('shows validation error when title is empty on submit', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    const submit = screen.getByRole('button', { name: /create/i });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
    });
  });

  it('rejects a non-URL string in MS Teams URL', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.change(screen.getByLabelText(/ms teams url/i, { selector: 'input' }), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(screen.getByText(/must be an http\(s\) url/i)).toBeInTheDocument();
    });
  });

  it('forces division selection when visibility=Division', async () => {
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode=""
        onSubmit={async () => {}}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByLabelText('Division'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(screen.getByText(/division is required/i)).toBeInTheDocument();
    });
  });

  it('calls onSubmit with valid payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <EventCreateModal
        open
        divisions={divisions}
        defaultDivisionCode="D01"
        onSubmit={onSubmit}
        onClose={noop}
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i, { selector: 'input' }), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText(/date/i, { selector: 'input' }), {
      target: { value: '2026-06-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Test Event',
      event_date: '2026-06-15',
      visibility: 'OrgWide',
    });
  });
});
