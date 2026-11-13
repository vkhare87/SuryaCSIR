import { describe, it, expect } from 'vitest';
import { formatMetric, packRows, previousValues, type Metric, type MetricSnapshot } from './api';
import { PRIMARY_NAV } from '../../constants/access';

const m: Metric = { key: 'projects_active', label: 'Active projects', definition: 'd', unit: 'count', owner_role: 'PME', sort: 1 };
const snaps: MetricSnapshot[] = [
  { metric_key: 'projects_active', division: null, as_on: '2026-04-30', value: 9 },
  { metric_key: 'projects_active', division: null, as_on: '2026-03-31', value: 8 },
  { metric_key: 'projects_active', division: 'D1', as_on: '2026-03-31', value: 5 },
];

describe('metrics', () => {
  it('the pack takes only the snapshot of its day', () => {
    expect(packRows([m], snaps, '2026-03-31', ['D1', 'D2'])).toEqual([{ metric: m, institute: 8, byDivision: [5, null] }]);
  });

  it('change is measured from the newest snapshot', () => {
    expect(previousValues(snaps).get('projects_active|')).toBe(9);
  });

  it('formats by unit', () => {
    expect(formatMetric(25000000, 'inr')).toBe('₹2.50 Cr');
    expect(formatMetric(41.5, 'pct')).toBe('41.5%');
    expect(formatMetric(null, 'count')).toBe('—');
  });

  it('no role sees more than six primary menu items', () => {
    for (const [role, items] of Object.entries(PRIMARY_NAV)) expect(items.length, role).toBeLessThanOrEqual(6);
  });
});
