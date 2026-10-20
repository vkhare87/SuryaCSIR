import { describe, it, expect } from 'vitest';
import { mapAppNotificationRow, mergeNotificationFeeds } from './notifications';
import type { AppNotification } from '../../types';
import type { PMSNotification } from '../../types/pms';

const pms = (over: Partial<PMSNotification>): PMSNotification => ({
  id: 'p1', userId: 'u1', type: 'report_finalized',
  title: 'PMS', body: 'pms body', reportId: 'r1', read: false,
  createdAt: '2026-10-20T01:00:00+00:00', ...over,
});

const app = (over: Partial<AppNotification>): AppNotification => ({
  id: 'a1', userId: 'u1', kind: 'ticket', severity: 'info', title: 'App', body: 'app body',
  link: '/helpdesk/t1', source: 'rule', status: 'open', proposedAction: null,
  createdAt: '2026-10-20T02:00:00+00:00', ...over,
});

describe('mapAppNotificationRow', () => {
  it('maps snake_case columns', () => {
    expect(mapAppNotificationRow({
      id: 'n1', user_id: 'u1', kind: 'mou-expiry', severity: 'warning',
      title: 'MoU expiring soon', body: 'Partner X', link: '/partnerships',
      source: 'rule', dedupe_key: 'mou-expiry:m1:2027-01-01', status: 'open',
      proposed_action: { open: '/docs/1' }, created_at: '2026-10-20T01:30:00+00:00',
      updated_at: '2026-10-20T01:30:00+00:00',
    })).toEqual({
      id: 'n1', userId: 'u1', kind: 'mou-expiry', severity: 'warning',
      title: 'MoU expiring soon', body: 'Partner X', link: '/partnerships',
      source: 'rule', status: 'open', proposedAction: { open: '/docs/1' },
      createdAt: '2026-10-20T01:30:00+00:00',
    });
  });

  it('defaults missing nullable columns', () => {
    const n = mapAppNotificationRow({ id: 'n1', link: null, proposed_action: null });
    expect(n.link).toBeNull();
    expect(n.proposedAction).toBeNull();
    expect(n.body).toBe('');
  });
});

describe('mergeNotificationFeeds', () => {
  it('sorts both feeds newest first', () => {
    const merged = mergeNotificationFeeds(
      [pms({ id: 'p-old', createdAt: '2026-10-18T00:00:00+00:00' }),
       pms({ id: 'p-new', createdAt: '2026-10-20T03:00:00+00:00' })],
      [app({ id: 'a-mid', createdAt: '2026-10-19T00:00:00+00:00' })],
    );
    expect(merged.map(m => m.id)).toEqual(['p-new', 'a-mid', 'p-old']);
  });

  it('compares instants, not strings, across UTC offsets', () => {
    const merged = mergeNotificationFeeds(
      [pms({ id: 'p', createdAt: '2026-10-20T06:00:00+05:30' })], // 00:30 UTC
      [app({ id: 'a', createdAt: '2026-10-20T01:00:00+00:00' })],
    );
    expect(merged.map(m => m.id)).toEqual(['a', 'p']);
  });

  it('treats any non-open app status as read', () => {
    const merged = mergeNotificationFeeds([], [
      app({ id: 'open', status: 'open' }),
      app({ id: 'read', status: 'read' }),
      app({ id: 'dismissed', status: 'dismissed' }),
      app({ id: 'accepted', status: 'accepted' }),
    ]);
    expect(merged.filter(m => !m.read).map(m => m.id)).toEqual(['open']);
  });

  it('keeps the PMS report route and follows app links', () => {
    const merged = mergeNotificationFeeds(
      [pms({ id: 'p1', reportId: 'r9' }), pms({ id: 'p2', reportId: null })],
      [app({ id: 'a1', link: '/partnerships' })],
    );
    const byId = Object.fromEntries(merged.map(m => [m.id, m]));
    expect(byId.p1.link).toBe('/pms/reports/r9');
    expect(byId.p2.link).toBeNull();
    expect(byId.a1.link).toBe('/partnerships');
    expect(byId.p1.source).toBe('pms');
    expect(byId.a1.source).toBe('app');
  });

  it('counts unread across both feeds', () => {
    const merged = mergeNotificationFeeds(
      [pms({ id: 'p1', read: false }), pms({ id: 'p2', read: true })],
      [app({ id: 'a1', status: 'open' }), app({ id: 'a2', status: 'read' })],
    );
    expect(merged.filter(m => !m.read)).toHaveLength(2);
  });

  it('flags agent suggestions and marks decided ones', () => {
    const merged = mergeNotificationFeeds([], [
      app({ id: 'rule', source: 'rule' }),
      app({ id: 'open-agent', source: 'agent', status: 'open' }),
      app({ id: 'dismissed-agent', source: 'agent', status: 'dismissed' }),
    ]);
    const byId = Object.fromEntries(merged.map(m => [m.id, m]));
    expect(byId.rule.agent).toBe(false);
    expect(byId['open-agent']).toMatchObject({ agent: true, decided: false });
    expect(byId['dismissed-agent']).toMatchObject({ agent: true, decided: true });
  });
});
