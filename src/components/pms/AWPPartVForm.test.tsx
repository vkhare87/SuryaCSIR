import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AWPPartVForm } from './AWPPartVForm';
import { AWP_ACTIVITY_LABELS, emptyAWPContent } from '../../lib/pms/awp';
import type { AWPContent } from '../../types/pms';

function Harness() {
  const [v, setV] = useState<AWPContent>(emptyAWPContent());
  return <AWPPartVForm value={v} onChange={setV} />;
}

describe('AWPPartVForm', () => {
  it('shows the seven fixed activity rows', () => {
    render(<Harness />);
    // "Any other" is also a project heading, hence getAll.
    for (const label of AWP_ACTIVITY_LABELS) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('warns until time committed totals 100%', () => {
    render(<Harness />);
    const pct = screen.getAllByLabelText(/time committed/i)[0];
    fireEvent.change(pct, { target: { value: '90' } });
    expect(screen.getByText('Total must be 100%')).toBeInTheDocument();
    fireEvent.change(pct, { target: { value: '100' } });
    expect(screen.queryByText('Total must be 100%')).not.toBeInTheDocument();
  });

  it('adds an editable extra activity row', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /add activity/i }));
    expect(screen.getByLabelText(/activity name/i)).toBeInTheDocument();
  });
});
