import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sparkline } from './Sparkline';
import { MiniNeighborhoodGraph } from './MiniNeighborhoodGraph';

describe('Sparkline', () => {
  it('returns null when fewer than 2 points are provided', () => {
    const { container } = render(<Sparkline data={[5]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an inline SVG polyline path for multi-point series', () => {
    const { container } = render(<Sparkline data={[2, 5, 4, 9]} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});

describe('MiniNeighborhoodGraph', () => {
  it('renders orbiting nodes and caps overflow with +N more indicator', () => {
    const neighbors = Array.from({ length: 12 }, (_, i) => ({
      id: `P-${i}`,
      label: `Project ${i}`,
      kind: 'project' as const,
    }));
    render(
      <MemoryRouter>
        <MiniNeighborhoodGraph centerLabel="Dr. Sharma" centerKind="staff" neighbors={neighbors} maxNodes={8} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Connected Graph · 12/i)).toBeInTheDocument();
    expect(screen.getByText(/\+4 more connections/i)).toBeInTheDocument();
  });
});
