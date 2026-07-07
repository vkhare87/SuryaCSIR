import { describe, it, expect } from 'vitest';
import { patentPipeline } from './patents';
import type { IPIntelligence } from '../../types';

function pat(over: Partial<IPIntelligence>): IPIntelligence {
  return { id: 'p', title: 'P', type: 'Patent', status: 'Filed', filingDate: '2024-01-01',
           inventors: [], divisionCode: 'LWMD', ...over };
}

describe('patentPipeline', () => {
  it('builds cumulative funnel over patents only', () => {
    const p = patentPipeline([
      pat({ id: 'a', status: 'Filed' }),
      pat({ id: 'b', status: 'Published' }),
      pat({ id: 'c', status: 'Granted', grantDate: '2026-01-01' }),
      pat({ id: 'd', type: 'Trademark', status: 'Granted' }), // not a patent
    ]);
    expect(p.filed).toBe(3);
    expect(p.published).toBe(2);
    expect(p.granted).toBe(1);
  });

  it('computes median months filing→grant', () => {
    const p = patentPipeline([
      pat({ status: 'Granted', filingDate: '2023-01-01', grantDate: '2025-01-01' }), // 24
      pat({ status: 'Granted', filingDate: '2024-01-01', grantDate: '2025-01-01' }), // 12
      pat({ status: 'Granted', filingDate: '2020-01-01', grantDate: '2023-01-01' }), // 36
    ]);
    expect(p.medianMonthsToGrant).toBe(24);
  });

  it('null median when nothing granted', () => {
    expect(patentPipeline([pat({})]).medianMonthsToGrant).toBeNull();
  });

  it('rolls up per division', () => {
    const p = patentPipeline([
      pat({ divisionCode: 'LWMD', status: 'Granted', grantDate: '2026-01-01' }),
      pat({ divisionCode: 'SCMD' }),
    ]);
    expect(p.byDivision).toEqual([
      { divisionCode: 'LWMD', filed: 1, granted: 1 },
      { divisionCode: 'SCMD', filed: 1, granted: 0 },
    ]);
  });
});
