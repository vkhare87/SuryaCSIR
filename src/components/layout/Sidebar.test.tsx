import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { featureAccessible } from '../../lib/access/featureControls';
import type { FeatureControl } from '../../types';

const { feature, data } = vi.hoisted(() => ({
  feature: { controls: [] as FeatureControl[], grants: new Set<string>() },
  data: { tickets: [] as { assigned_to: string; status: string }[] },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ role: 'Scientist', logout: vi.fn(), user: { id: 'u1', roles: ['Scientist'] } }),
}));

vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({ contributionRequests: [], dataStewards: [], tickets: data.tickets }),
}));

vi.mock('../../contexts/FeatureControlContext', () => ({
  useFeatureControls: () => ({
    canAccess: (path: string) => featureAccessible(path, 'Scientist', feature.controls, feature.grants),
  }),
}));

// Node's own (flag-gated) localStorage global shadows jsdom's here, so give
// the test a plain in-memory one.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
});

function renderSidebar(at = '/scientist') {
  render(
    <MemoryRouter initialEntries={[at]}>
      <Sidebar isMobile={false} deviceType="desktop" mobileOpen={false} onCloseMobile={vi.fn()} onOpenSettings={vi.fn()} />
    </MemoryRouter>,
  );
  return within(screen.getByText('Pinned').parentElement as HTMLElement);
}

const group = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('Sidebar', () => {
  beforeEach(() => {
    store.clear();
    feature.controls = [];
    feature.grants = new Set();
    data.tickets = [];
  });

  it('pins a Scientist\'s own work and keeps analytics in the groups', () => {
    const pinned = renderSidebar();

    expect(pinned.getByRole('link', { name: 'Performance Mgmt' })).toBeInTheDocument();
    expect(pinned.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(pinned.getByRole('link', { name: 'Progress Reports' })).toBeInTheDocument();
    expect(pinned.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/scientist');
    expect(pinned.queryByRole('link', { name: 'Intelligence' })).toBeNull();

    // A closed group shows none of its pages; opening it does.
    expect(screen.queryByRole('link', { name: 'PhD Tracker' })).toBeNull();
    fireEvent.click(group('People'));
    expect(screen.getByRole('link', { name: 'PhD Tracker' })).toBeInTheDocument();
    expect(pinned.queryByRole('link', { name: 'PhD Tracker' })).toBeNull();
  });

  it('opens the group of the page the user is on, and only that one', () => {
    renderSidebar('/phd');

    expect(group('People')).toHaveAttribute('aria-expanded', 'true');
    expect(group('Research')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'PhD Tracker' })).toBeInTheDocument();

    fireEvent.click(group('Research'));
    expect(group('People')).toHaveAttribute('aria-expanded', 'false');
  });

  it('finds a page by name across groups', () => {
    renderSidebar();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a page' }), { target: { value: 'phd' } });

    expect(screen.getByRole('link', { name: 'PhD Tracker' })).toBeInTheDocument();
    expect(screen.queryByText('Pinned')).toBeNull();
  });

  it('pins a page from a group and remembers it', () => {
    const pinned = renderSidebar();
    fireEvent.click(group('People'));
    fireEvent.click(screen.getByRole('button', { name: 'Pin PhD Tracker' }));

    expect(pinned.getByRole('link', { name: 'PhD Tracker' })).toBeInTheDocument();
    expect(store.get('surya_sidebar_layout:u1:Scientist')).toContain('/phd');
  });

  it('shows how many helpdesk tickets wait on the user', () => {
    data.tickets = [
      { assigned_to: 'u1', status: 'Open' },
      { assigned_to: 'u1', status: 'Resolved' },
      { assigned_to: 'someone-else', status: 'Open' },
    ];
    renderSidebar();

    // The closed group carries the count of what waits inside it.
    expect(within(group('Institute')).getByText('1')).toBeInTheDocument();
  });

  it('hides a pinned page that Feature Controls switched off', () => {
    feature.controls = [{
      feature_key: '/pms', enabled: false, disabled_roles: [], note: null, updated_by: null, updated_at: '',
    }];
    const pinned = renderSidebar();
    fireEvent.click(group('Institute'));

    expect(pinned.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Performance Mgmt' })).toBeNull();
  });

  it('shows a page MasterAdmin granted to this user beyond their role', () => {
    feature.grants = new Set(['/intelligence']);
    renderSidebar();
    fireEvent.click(group('Research'));

    expect(screen.getByRole('link', { name: 'Intelligence' })).toBeInTheDocument();
  });
});
