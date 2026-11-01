import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DataProvider, useData } from './DataContext';
import { PMSProvider, usePMS } from './PMSContext';
import { AWPProvider, useAWP } from './AWPContext';

const { supabase, auth, push } = vi.hoisted(() => {
  // Every query chains and finally resolves to an empty page, awaited directly or paged.
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'neq', 'not', 'limit', 'upsert']) builder[m] = () => builder;
  builder.range = async () => ({ data: [], error: null });
  builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return {
    supabase: { from: () => builder, rpc: async () => ({ data: null, error: null }) },
    auth: { isAuthenticated: true, role: 'Scientist', divisionCode: null, user: { id: 'u1' } },
    push: () => {},
  };
});

vi.mock('../utils/supabaseClient', () => ({ supabase, isProvisioned: () => true }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth }));
vi.mock('./ToastContext', () => ({ useToast: () => ({ push }) }));
vi.mock('./FeatureControlContext', () => ({ useFeatureControls: () => ({ canAccess: () => false }) }));

// BUG-25: a provider re-render with no state change must hand consumers the same value,
// or every consumer of the context re-renders with it.
async function expectStableValue(Provider: (p: { children: ReactNode }) => ReactNode, use: () => { isLoading: boolean }) {
  const seen: { isLoading: boolean }[] = [];
  function Probe() { seen.push(use()); return null; }
  const { rerender } = render(<Provider><Probe /></Provider>);
  await waitFor(() => expect(seen.at(-1)?.isLoading).toBe(false));
  const settled = seen.at(-1);
  rerender(<Provider><Probe /></Provider>);
  expect(seen.at(-1)).toBe(settled);
}

describe('context values are memoised (BUG-25)', () => {
  it('DataContext', () => expectStableValue(DataProvider, useData));
  it('PMSContext', () => expectStableValue(PMSProvider, usePMS));
  it('AWPContext', () => expectStableValue(AWPProvider, useAWP));
});
