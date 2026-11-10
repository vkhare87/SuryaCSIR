import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { FeatureControlProvider, useFeatureControls } from './FeatureControlContext';

const { result } = vi.hoisted(() => ({ result: { current: { data: [] as unknown[] | null, error: null as unknown } } }));

vi.mock('../utils/supabaseClient', () => {
  const q = { select: () => q, eq: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve(result.current).then(ok) };
  return { supabase: { from: () => q } };
});
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', activeRole: 'Scientist' }, isAuthenticated: true }) }));

function probe() {
  const seen: boolean[] = [];
  function Probe() { seen.push(useFeatureControls().controlsDegraded); return null; }
  render(<FeatureControlProvider><Probe /></FeatureControlProvider>);
  return seen;
}

// SEC-13: controls still fail open, but the failure must be visible.
describe('feature controls degraded flag (SEC-13)', () => {
  it('is true when the controls read fails', async () => {
    result.current = { data: null, error: { message: 'relation does not exist' } };
    const seen = probe();
    await waitFor(() => expect(seen.at(-1)).toBe(true));
  });

  it('is false when the read succeeds', async () => {
    result.current = { data: [], error: null };
    const seen = probe();
    await new Promise(r => setTimeout(r, 0));
    expect(seen.at(-1)).toBe(false);
  });
});
