import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { DataProvider, useData } from './DataContext';

const { from, auth, push, tableRows } = vi.hoisted(() => {
  const tableRows: Record<string, () => Promise<{ data: unknown[]; error: null }>> = {};
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'neq', 'not', 'limit', 'upsert']) builder[m] = () => builder;
    builder.range = async () => (tableRows[table] ? tableRows[table]() : { data: [], error: null });
    return builder;
  });
  return {
    from,
    tableRows,
    // The real push is a stable useCallback; a fresh vi.fn per render would reload forever.
    push: vi.fn(),
    auth: {
      current: {
        user: null as { id: string } | null,
        isAuthenticated: false,
        role: null as string | null,
        roles: [] as string[],
        divisionCode: null as string | null,
      },
    },
  };
});

vi.mock('../utils/supabaseClient', () => ({ supabase: { from }, isProvisioned: () => true }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth.current }));
vi.mock('./ToastContext', () => ({ useToast: () => ({ push }) }));
vi.mock('./FeatureControlContext', () => ({ useFeatureControls: () => ({ canAccess: () => false }) }));

function Probe({ onReady }: { onReady?: (ctx: ReturnType<typeof useData>) => void }) {
  const ctx = useData();
  onReady?.(ctx);
  return (
    <div>
      <div data-testid="staff">{ctx.staff.map(s => s.ID).join(',')}</div>
      <div data-testid="projects">{ctx.projects.map(p => p.ProjectID).join(',')}</div>
      <div data-testid="equipment">{ctx.equipment.map(e => e.UInsID).join(',')}</div>
      <div data-testid="vacancies">{ctx.vacancyAdvertisements.map(v => v.id).join(',')}</div>
      <div data-testid="milestones">{ctx.phdMilestones.map(m => m.id).join(',')}</div>
    </div>
  );
}

describe('DataProvider boot load and scoping (BUG-12)', () => {
  beforeEach(() => {
    from.mockClear();
    for (const k of Object.keys(tableRows)) delete tableRows[k];
    auth.current = { user: null, isAuthenticated: false, role: null, roles: [], divisionCode: null };
  });

  it('sends no request before auth resolves, scopes divisions in-memory, and preserves multi-role access', async () => {
    tableRows.staff = async () => ({
      data: [
        { ID: 'S1', Name: 'A', Division: 'MSE' },
        { ID: 'S2', Name: 'B', Division: 'CMD' },
      ],
      error: null,
    });
    tableRows.projects = async () => ({
      data: [
        { ProjectID: 'P1', ProjectNo: 'GAP-1', DivisionCode: 'MSE' },
        { ProjectID: 'P2', ProjectNo: 'GAP-2', DivisionCode: 'CMD' },
      ],
      error: null,
    });
    tableRows.equipment = async () => ({
      data: [
        { UInsID: 'E1', Name: 'SEM', Division: 'MSE' },
        { UInsID: 'E2', Name: 'XRD', Division: 'CMD' },
      ],
      error: null,
    });
    tableRows.vacancy_advertisements = async () => ({
      data: [{ id: 'VA-1', title: 'Scientist B', status: 'Open', drive_stage: 'Advertised' }],
      error: null,
    });

    const { rerender } = render(<DataProvider><Probe /></DataProvider>);
    await new Promise(r => setTimeout(r, 0));
    expect(from).not.toHaveBeenCalled();

    // User has both Director and DivisionHead assigned; starts as DivisionHead for MSE.
    auth.current = {
      user: { id: 'u1' },
      isAuthenticated: true,
      role: 'DivisionHead',
      roles: ['Director', 'DivisionHead'],
      divisionCode: 'MSE',
    };
    rerender(<DataProvider><Probe /></DataProvider>);
    await waitFor(() => expect(screen.getByTestId('staff').textContent).toBe('S1'));
    expect(screen.getByTestId('projects').textContent).toBe('P1');
    expect(screen.getByTestId('equipment').textContent).toBe('E1');
    expect(screen.getByTestId('vacancies').textContent).toBe('VA-1');

    const perRound = from.mock.calls.length;
    await new Promise(r => setTimeout(r, 0));
    expect(from).toHaveBeenCalledTimes(perRound);

    // Switching division updates visible scoped records without additional requests.
    auth.current = {
      user: { id: 'u1' },
      isAuthenticated: true,
      role: 'DivisionHead',
      roles: ['Director', 'DivisionHead'],
      divisionCode: 'CMD',
    };
    rerender(<DataProvider><Probe /></DataProvider>);
    await waitFor(() => expect(screen.getByTestId('staff').textContent).toBe('S2'));
    expect(screen.getByTestId('projects').textContent).toBe('P2');
    expect(screen.getByTestId('equipment').textContent).toBe('E2');
    expect(from).toHaveBeenCalledTimes(perRound);

    // Switching active role back to Director restores institute-wide view and retains vacancy data.
    auth.current = {
      user: { id: 'u1' },
      isAuthenticated: true,
      role: 'Director',
      roles: ['Director', 'DivisionHead'],
      divisionCode: null,
    };
    rerender(<DataProvider><Probe /></DataProvider>);
    await waitFor(() => expect(screen.getByTestId('staff').textContent).toBe('S1,S2'));
    expect(screen.getByTestId('projects').textContent).toBe('P1,P2');
    expect(screen.getByTestId('equipment').textContent).toBe('E1,E2');
    expect(screen.getByTestId('vacancies').textContent).toBe('VA-1');
    expect(from).toHaveBeenCalledTimes(perRound);
  });

  it('drops stale overlapping refreshSlice results and stale user refreshes across identity switches', async () => {
    let ctxRef: ReturnType<typeof useData> | null = null;
    tableRows.phd_milestones = async () => ({ data: [{ id: 'M-init' }], error: null });

    auth.current = {
      user: { id: 'user-a' },
      isAuthenticated: true,
      role: 'Scientist',
      roles: ['Scientist'],
      divisionCode: null,
    };
    const { rerender } = render(<DataProvider><Probe onReady={(c) => { ctxRef = c; }} /></DataProvider>);
    await waitFor(() => expect(screen.getByTestId('milestones').textContent).toBe('M-init'));

    let resolveFirst!: (val: { data: unknown[]; error: null }) => void;
    let resolveSecond!: (val: { data: unknown[]; error: null }) => void;
    let call = 0;
    tableRows.phd_milestones = () => new Promise(res => {
      call += 1;
      if (call === 1) resolveFirst = res;
      else resolveSecond = res;
    });

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    await act(async () => {
      p1 = ctxRef!.refreshSlice('phd');
      p2 = ctxRef!.refreshSlice('phd');
    });

    // Second refresh finishes first with newer state; first refresh finishes last and must be ignored.
    await act(async () => {
      resolveSecond({ data: [{ id: 'M-new' }], error: null });
      await p2;
    });
    expect(screen.getByTestId('milestones').textContent).toBe('M-new');

    await act(async () => {
      resolveFirst({ data: [{ id: 'M-stale' }], error: null });
      await p1;
    });
    expect(screen.getByTestId('milestones').textContent).toBe('M-new');

    // Now start a refresh for user-a, then switch to user-b before it resolves.
    let resolveUserARefresh!: (val: { data: unknown[]; error: null }) => void;
    tableRows.phd_milestones = () => new Promise(res => { resolveUserARefresh = res; });
    let userAPromise!: Promise<void>;
    await act(async () => {
      userAPromise = ctxRef!.refreshSlice('phd');
    });

    tableRows.phd_milestones = async () => ({ data: [{ id: 'M-user-b' }], error: null });
    auth.current = {
      user: { id: 'user-b' },
      isAuthenticated: true,
      role: 'Scientist',
      roles: ['Scientist'],
      divisionCode: null,
    };
    rerender(<DataProvider><Probe onReady={(c) => { ctxRef = c; }} /></DataProvider>);
    await waitFor(() => expect(screen.getByTestId('milestones').textContent).toBe('M-user-b'));

    await act(async () => {
      resolveUserARefresh({ data: [{ id: 'M-user-a-leaked' }], error: null });
      await userAPromise;
    });
    expect(screen.getByTestId('milestones').textContent).toBe('M-user-b');
  });
});
