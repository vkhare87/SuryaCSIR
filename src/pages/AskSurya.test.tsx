import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AskSurya from './AskSurya';
import { scheduleBrief, askSuryaStream, fetchAskHistory, setQuestionPinned } from '../lib/ask/client';

const { ANSWER } = vi.hoisted(() => ({
  ANSWER: {
    answer: 'Yes. It was licensed for 300,000.',
    mode: 'document' as const,
    citations: [{
      document_id: 'd1', title: 'Patents Licensed to Industry', node_title: 'Page 4',
      page_start: 4, page_end: 4, storage_path: 'institute/AMPRI/Patents_licensed.pdf',
    }],
    queryId: 'q1',
  },
}));

vi.mock('../lib/ask/client', () => ({
  askSuryaStream: vi.fn(async () => ANSWER),
  sendFeedback: vi.fn(),
  scheduleBrief: vi.fn(async () => undefined),
  parseAskEntity: () => null,
  fetchAskHistory: vi.fn(async () => ({ recent: [], frequent: [], saved: [] })),
  setQuestionPinned: vi.fn(async () => undefined),
  SAVED_LIMIT: 20,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' } }),
}));

vi.mock('../lib/ask/citations', () => ({
  citationHref: vi.fn().mockResolvedValue('https://signed.example/doc.pdf#page=4'),
}));

describe('AskSurya source citations', () => {
  it('opens the cited page in the in-page panel, not a new tab', async () => {
    // Regression: openSource() set the `source` state but the Sheet that reads it was
    // never rendered, so a click on a citation updated state and showed nothing —
    // clicking "did not open" from the user's perspective.
    const openSpy = vi.spyOn(window, 'open');
    render(<MemoryRouter><AskSurya /></MemoryRouter>);

    fireEvent.change(screen.getByPlaceholderText(/2025 progress reports/i), {
      target: { value: 'Was the disinfectant generator licensed?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    const citationButton = await screen.findByRole('button', {
      name: /Patents Licensed to Industry.*Page 4/i,
    });
    fireEvent.click(citationButton);

    await waitFor(() => {
      const frame = document.querySelector('iframe[title*="Patents Licensed to Industry"]');
      expect(frame).not.toBeNull();
      expect(frame?.getAttribute('src')).toBe('https://signed.example/doc.pdf#page=4');
    });

    // The whole point of the panel: no tab was spawned, session context is not lost.
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('AskSurya scheduled briefs', () => {
  it('saves the asked question as a weekly brief for the signed-in user', async () => {
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/2025 progress reports/i), {
      target: { value: 'Which projects end this year?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    fireEvent.click(await screen.findByRole('button', { name: /send me this weekly/i }));

    expect(await screen.findByText(/weekly brief saved/i)).toBeTruthy();
    expect(scheduleBrief).toHaveBeenCalledWith('u-1', 'Which projects end this year?');
  });
});

describe('AskSurya question history', () => {
  const ONE = { recent: [{ id: 'r1', question: 'How many projects?', pinned: false }], frequent: [], saved: [] };
  beforeEach(() => {
    vi.mocked(fetchAskHistory).mockReset().mockResolvedValue(ONE);
    vi.mocked(askSuryaStream).mockClear();
    vi.mocked(setQuestionPinned).mockClear();
  });

  it('shows the recorded-requests notice', async () => {
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    expect(await screen.findByText('Out-of-scope requests are recorded.')).toBeTruthy();
  });

  it('clicking a recent question asks it again', async () => {
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'How many projects?' }));
    await waitFor(() => expect(askSuryaStream).toHaveBeenCalledWith('How many projects?', [], expect.any(Function), null));
  });

  it('pin button saves the question and reloads history', async () => {
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Save question: How many projects?' }));
    await waitFor(() => expect(setQuestionPinned).toHaveBeenCalledWith('r1', true));
    await waitFor(() => expect(fetchAskHistory).toHaveBeenCalledTimes(2));
  });

  it('saving is disabled at 20 saved questions', async () => {
    const saved = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, question: `saved ${i}`, pinned: true }));
    vi.mocked(fetchAskHistory).mockResolvedValue({ ...ONE, saved });
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    const save = await screen.findByRole('button', { name: 'Save question: How many projects?' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Remove saved question: saved 0' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a history load failure leaves the page usable', async () => {
    vi.mocked(fetchAskHistory).mockRejectedValue(new Error('down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /^ask$/i })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    errSpy.mockRestore();
  });

  it('an empty history shows no panel headings', async () => {
    vi.mocked(fetchAskHistory).mockResolvedValue({ recent: [], frequent: [], saved: [] });
    render(<MemoryRouter><AskSurya /></MemoryRouter>);
    await waitFor(() => expect(fetchAskHistory).toHaveBeenCalled());
    expect(screen.queryByText('Recent')).toBeNull();
  });
});
