import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { featureAccessible } from '../../lib/access/featureControls';
import type { FeatureControl } from '../../types';

const { feature } = vi.hoisted(() => ({
  feature: { controls: [] as FeatureControl[], grants: new Set<string>() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ role: 'Scientist', logout: vi.fn() }),
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
  removeItem: (key: string) => { store.delete(key); },
});

function renderSidebar(badges?: Record<string, number>) {
  render(
    <MemoryRouter>
      <Sidebar
        isMobile={false}
        deviceType="desktop"
        mobileOpen={false}
        badges={badges}
        onCloseMobile={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </MemoryRouter>,
  );
  return within(screen.getByText('For you').parentElement as HTMLElement);
}

describe('Sidebar 2-tier role-first nav', () => {
  beforeEach(() => {
    store.clear();
    feature.controls = [];
    feature.grants = new Set();
  });

  it('puts a Scientist\'s own work under "For you" and groups remaining links by domain', () => {
    const forYou = renderSidebar({ '/pms': 3 });

    expect(forYou.getByRole('link', { name: /Performance Mgmt/i })).toBeInTheDocument();
    expect(forYou.getByText('3')).toBeInTheDocument();
    expect(forYou.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(forYou.getByRole('link', { name: 'Progress Reports' })).toBeInTheDocument();
    expect(forYou.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/scientist');

    expect(forYou.queryByRole('link', { name: 'Intelligence' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'PhD Tracker' })).toBeNull();

    // Expand the People & HR domain group to reveal PhD Tracker
    fireEvent.click(screen.getByRole('button', { name: /People & HR/i }));

    expect(screen.getByRole('link', { name: 'PhD Tracker' })).toBeInTheDocument();
    expect(forYou.queryByRole('link', { name: 'PhD Tracker' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Projects' })).toHaveLength(1);
    expect(localStorage.getItem('surya_sidebar_open_domain')).toBe('hr');
  });

  it('hides a primary item that Feature Controls switched off', () => {
    feature.controls = [{
      feature_key: '/pms', enabled: false, disabled_roles: [], note: null, updated_by: null, updated_at: '',
    }];
    const forYou = renderSidebar();

    expect(forYou.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Performance Mgmt' })).toBeNull();
  });

  it('shows a page MasterAdmin granted to this user under its domain group', () => {
    feature.grants = new Set(['/intelligence']);
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /Overview/i }));

    expect(screen.getByRole('link', { name: 'Intelligence' })).toBeInTheDocument();
  });
});
