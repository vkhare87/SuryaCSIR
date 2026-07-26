import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusSeal } from './StatusSeal';
import { STATUS_COLORS } from '../../lib/pms/constants';
import type { ReportStatus } from '../../types/pms';

const ALL_STATUSES = Object.keys(STATUS_COLORS) as ReportStatus[];

describe('StatusSeal', () => {
  it.each(ALL_STATUSES)('renders the plain-text label for %s', (status) => {
    render(<StatusSeal status={status} />);
    expect(screen.getByText(STATUS_COLORS[status].label)).toBeInTheDocument();
  });

  it.each(ALL_STATUSES)('announces %s to assistive tech', (status) => {
    render(<StatusSeal status={status} />);
    // The mono/rotated styling must not be the only carrier of meaning.
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      `Report status: ${STATUS_COLORS[status].label}`,
    );
  });

  it('colours by ink, never by fill (DESIGN.md R2/R3)', () => {
    render(<StatusSeal status="FINALIZED" />);
    const seal = screen.getByRole('status');
    expect(seal.className).toContain('bg-transparent');
    expect(seal.className).toMatch(/text-archive-green/);
    // A filled pill is the pattern this replaced.
    expect(seal.className).not.toMatch(/bg-(green|blue|yellow|purple|orange|gray)-\d/);
  });

  it('uses semantic tokens, not raw Tailwind palette classes', () => {
    for (const status of ALL_STATUSES) {
      const { unmount } = render(<StatusSeal status={status} />);
      expect(screen.getByRole('status').className).not.toMatch(
        /(text|bg|border)-(slate|gray|zinc|red|orange|amber|yellow|green|blue|indigo|purple|pink)-\d{2,3}/,
      );
      unmount();
    }
  });

  it('leaves settled states unrotated', () => {
    render(<StatusSeal status="FINALIZED" />);
    expect(screen.getByRole('status').className).not.toMatch(/rotate/);
  });
});
