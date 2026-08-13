import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AskSurya from './AskSurya';

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
    render(<AskSurya />);

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
