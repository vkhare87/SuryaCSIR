import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('shows a placeholder, not a partial count, while loading', () => {
    render(<KpiCard label="Equipment" value="181" sublabel="27 down" loading />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('181')).toBeNull();
  });

  it('becomes a link when given a destination', () => {
    render(<MemoryRouter><KpiCard label="Equipment" value="181" to="/facilities" loading={false} /></MemoryRouter>);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/facilities');
  });
});
