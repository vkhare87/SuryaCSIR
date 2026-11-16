import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthContext';

const { mockSupabase, state, fire, fromCalls } = vi.hoisted(() => {
  const defaultSession = { user: { id: 'u1', email: 'dir@ampri.res.in' } } as unknown as Session;
  const state = {
    currentSession: defaultSession as Session | null,
    authCallback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
    calls: {} as Record<string, number>,
    mustChangePassword: false,
    rolesByUser: {
      u1: [
        { role: 'Director', division_code: null },
        { role: 'Scientist', division_code: 'MSE' },
      ],
      u2: [{ role: 'Scientist', division_code: 'CMD' }],
    } as Record<string, { role: string; division_code: string | null }[]>,
    activeRoleByUser: {
      u1: 'Director',
      u2: 'Scientist',
    } as Record<string, string>,
  };

  const fromCalls = (table: string) => state.calls[table] ?? 0;

  const fire = (event: AuthChangeEvent, session: Session | null) => {
    state.currentSession = session;
    state.authCallback?.(event, session);
  };

  const mockSupabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.currentSession } })),
      signOut: vi.fn(async () => {
        state.currentSession = null;
      }),
      onAuthStateChange: vi.fn((cb: (event: AuthChangeEvent, session: Session | null) => void) => {
        state.authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn((table: string) => {
      state.calls[table] = (state.calls[table] ?? 0) + 1;
      let userIdFilter = 'u1';
      let roleFilter: string | null = null;

      const queryBuilder = {
        select: () => queryBuilder,
        eq: (col: string, val: string) => {
          if (col === 'user_id') userIdFilter = val;
          if (col === 'role') roleFilter = val;
          return queryBuilder;
        },
        order: async () => ({
          data: state.rolesByUser[userIdFilter] ?? [],
          error: null,
        }),
        single: async () => {
          if (table === 'user_roles') {
            const rows = state.rolesByUser[userIdFilter] ?? [];
            const match = rows.find(r => r.role === roleFilter) ?? rows[0];
            return { data: { division_code: match?.division_code ?? null }, error: null };
          }
          return {
            data: {
              must_change_password: state.mustChangePassword,
              active_role: state.activeRoleByUser[userIdFilter] ?? null,
              last_seen_at: new Date().toISOString(),
            },
            error: null,
          };
        },
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      };

      return queryBuilder;
    }),
  };

  return { mockSupabase, state, fire, fromCalls };
});

vi.mock('../utils/supabaseClient', () => ({ supabase: mockSupabase }));
vi.mock('../lib/auth/devLogin', () => ({ isDevLogin: () => false }));

const session = { user: { id: 'u1', email: 'dir@ampri.res.in' } } as unknown as Session;
const otherSession = { user: { id: 'u2', email: 'other@ampri.res.in' } } as unknown as Session;

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.currentSession = session;
    state.authCallback = null;
    state.calls = {};
    state.mustChangePassword = false;
  });

  it('reads roles once when getSession and INITIAL_SESSION both report the same session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      fire('INITIAL_SESSION', session);
      await new Promise(r => setTimeout(r, 10));
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fromCalls('user_roles')).toBe(1);
    expect(fromCalls('user_profiles')).toBe(1);
  });

  it('keeps the same user object when SIGNED_IN repeats with unchanged roles', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.user;
    await act(async () => {
      fire('SIGNED_IN', session);
      await new Promise(r => setTimeout(r, 10));
    });
    await waitFor(() => expect(fromCalls('user_roles')).toBe(2));
    expect(result.current.user).toBe(first);
  });

  it('resolves the new account when SIGNED_IN carries a different user id', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      fire('SIGNED_IN', otherSession);
    });
    await waitFor(() => expect(result.current.user?.id).toBe(otherSession.user.id));
  });

  it('gives a new user object when setActiveRole changes activeRole', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.user;
    await act(() => result.current.setActiveRole('Scientist'));
    expect(result.current.user).not.toBe(first);
    expect(result.current.user?.activeRole).toBe('Scientist');
    expect(result.current.user?.divisionCode).toBe('MSE');
  });

  it('gives a new user object when clearMustChangePassword clears the flag', async () => {
    state.mustChangePassword = true;
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.user;
    expect(first?.mustChangePassword).toBe(true);
    await act(() => result.current.clearMustChangePassword());
    expect(result.current.user).not.toBe(first);
    expect(result.current.user?.mustChangePassword).toBe(false);
  });
});
