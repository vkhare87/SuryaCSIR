import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card, Badge } from './Cards';

describe('Card keyboard access (BUG-21)', () => {
  it('a clickable card is a focusable button that Enter and Space activate', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Open division</Card>);
    const card = screen.getByRole('button', { name: 'Open division' });
    expect(card.tabIndex).toBe(0);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('a plain card stays a plain region', () => {
    render(<Card>Static</Card>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Badge theming (BUG-21)', () => {
  it('uses theme tokens, never light-only hex', () => {
    for (const variant of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
      const { container } = render(<Badge variant={variant}>x</Badge>);
      expect(container.firstElementChild!.className).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });
});
