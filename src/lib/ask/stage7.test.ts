import { describe, it, expect } from 'vitest';
import { extractChartData, matchResolvedFaqs } from './stage7';
import type { Ticket } from '../../types';

describe('Stage 7 Ask & Helpdesk FAQ helpers (E2, D4b)', () => {
  it('extracts structured numeric points from bullet and table answers', () => {
    const bullet = '- Division A: 12\n- Division B: 8\n- Division C: 5';
    expect(extractChartData(bullet)).toEqual([
      { label: 'Division A', value: 12 },
      { label: 'Division B', value: 8 },
      { label: 'Division C', value: 5 },
    ]);

    expect(extractChartData('Single line answer with no series.')).toEqual([]);
  });

  it('matches resolved/closed tickets for self-service FAQ suggestions', () => {
    const tickets = [
      { id: '1', subject: 'VPN password reset', description: 'Use portal token', category: 'EquipmentIT', status: 'Resolved' },
      { id: '2', subject: 'AC repair Lab 3', description: 'Pending technician', category: 'Infrastructure', status: 'Open' },
    ] as Ticket[];
    const matches = matchResolvedFaqs(tickets, 'vpn reset');
    expect(matches.map((m) => m.id)).toEqual(['1']);
  });
});
