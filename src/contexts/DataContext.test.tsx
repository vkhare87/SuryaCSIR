import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { DataProvider } from './DataContext';

const { from, auth, push } = vi.hoisted(() => {
  // Every query builder call chains and finally resolves to an empty page.
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'neq', 'not', 'limit', 'upsert']) builder[m] = () => builder;
  builder.range = async () => ({ data: [], error: null });
  return {
    from: vi.fn(() => builder),
    // The real push is a stable useCallback; a fresh vi.fn per render would reload forever.
    push: vi.fn(),
    auth: { current: { isAuthenticated: false, role: null as string | null, divisionCode: null } },
  };
});

vi.mock('../utils/supabaseClient', () => ({ supabase: { from }, isProvisioned: () => true }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth.current }));
vi.mock('./ToastContext', () => ({ useToast: () => ({ push }) }));
vi.mock('./FeatureControlContext', () => ({ useFeatureControls: () => ({ canAccess: () => false }) }));

describe('DataProvider boot load (BUG-12)', () => {
  beforeEach(() => { from.mockClear(); auth.current = { isAuthenticated: false, role: null, divisionCode: null }; });

  it('sends no request before auth resolves, then exactly one load round', async () => {
    const { rerender } = render(<DataProvider><div /></DataProvider>);
    await new Promise(r => setTimeout(r, 0));
    expect(from).not.toHaveBeenCalled();

    auth.current = { isAuthenticated: true, role: 'Scientist', divisionCode: null };
    rerender(<DataProvider><div /></DataProvider>);
    await waitFor(() => expect(from).toHaveBeenCalled());
    const perRound = from.mock.calls.length;
    await new Promise(r => setTimeout(r, 0));
    expect(from).toHaveBeenCalledTimes(perRound);
    expect(from.mock.calls.filter(([t]) => t === 'staff')).toHaveLength(1);
  });
});
